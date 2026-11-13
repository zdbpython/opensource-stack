import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createSeed } from './seed.js';
import { uid, clampNumber, parseTags, normalizeQuery, safeHttpsUrl, safeQuarkUrl } from './util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const ASSET_DIR = path.join(PUBLIC_DIR, 'assets');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const AUTH_PATH = path.join(DATA_DIR, 'auth.json');

let state;
let auth;
let queue = Promise.resolve();
let initialPassword = '';

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function atomicWrite(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

export function initStore({ initAuth = true } = {}) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) {
    state = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } else {
    state = createSeed();
    atomicWrite(DB_PATH, state);
  }
  if (initAuth) {
    if (fs.existsSync(AUTH_PATH)) {
      auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
    } else {
      const username = String(process.env.ADMIN_USER || 'admin').trim() || 'admin';
      const configured = String(process.env.ADMIN_PASSWORD || '').trim();
      initialPassword = configured || crypto.randomBytes(12).toString('base64url');
      auth = { username, ...hashPassword(initialPassword), createdAt: new Date().toISOString() };
      atomicWrite(AUTH_PATH, auth);
    }
  }
  if (!state.media) state.media = [];
  return { initialPassword, username: auth?.username || '', dbPath: DB_PATH };
}

export function getInitialPassword() {
  return initialPassword;
}

export function getAuth() {
  return auth;
}

export function getDb() {
  return state;
}

export function snapshot() {
  return JSON.parse(JSON.stringify(state));
}

export function mutate(operation) {
  const next = queue.catch(() => {}).then(async () => {
    const result = await operation(state, auth);
    atomicWrite(DB_PATH, state);
    return result;
  });
  queue = next.catch(() => {});
  return next;
}

export function mutateAuth(operation) {
  const next = queue.catch(() => {}).then(async () => {
    const result = await operation(auth);
    atomicWrite(AUTH_PATH, auth);
    return result;
  });
  queue = next.catch(() => {});
  return next;
}

export function publishedArticles() {
  return state.articles
    .filter((article) => article.status === 'published')
    .slice()
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(b.publishedAt) - new Date(a.publishedAt));
}

export function articleById(id) {
  return state.articles.find((article) => article.id === id) || null;
}

export function articleBySlug(slug) {
  return state.articles.find((article) => article.slug === slug && article.status === 'published') || null;
}

export function categoryById(id) {
  return state.categories.find((category) => category.id === id) || null;
}

export function categoryBySlug(slug) {
  return state.categories.find((category) => category.slug === slug) || null;
}

export function categoryName(id) {
  return categoryById(id)?.name || '未分类';
}

export function categoryCounts() {
  const counts = new Map();
  for (const article of publishedArticles()) counts.set(article.categoryId, (counts.get(article.categoryId) || 0) + 1);
  return state.categories.map((category) => ({ ...category, count: counts.get(category.id) || 0 }));
}

export function monthGroups() {
  const counts = new Map();
  for (const article of publishedArticles()) {
    const key = article.publishedAt.slice(0, 7);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, count]) => ({ key, count }));
}

export function searchArticles(query, scope = {}, page = 1, perPage = 8) {
  const needle = normalizeQuery(query).toLocaleLowerCase();
  const items = publishedArticles().filter((article) => {
    if (scope.categoryId && article.categoryId !== scope.categoryId) return false;
    if (scope.month && !article.publishedAt.startsWith(scope.month)) return false;
    if (!needle) return true;
    const haystack = [article.title, article.excerpt, article.content, categoryName(article.categoryId), ...(article.tags || [])].join(' ').toLocaleLowerCase();
    return haystack.includes(needle);
  });
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const current = clampNumber(page, 1, totalPages, 1);
  const start = (current - 1) * perPage;
  return { items: items.slice(start, start + perPage), total: items.length, totalPages, current };
}

export function adjacentArticles(article) {
  const list = publishedArticles();
  const index = list.findIndex((item) => item.id === article.id);
  return { previous: index > 0 ? list[index - 1] : null, next: index >= 0 && index < list.length - 1 ? list[index + 1] : null };
}

export function relatedArticles(article, limit = 3) {
  return publishedArticles()
    .filter((item) => item.id !== article.id)
    .map((item) => ({ item, score: (item.categoryId === article.categoryId ? 2 : 0) + (item.tags || []).filter((tag) => (article.tags || []).includes(tag)).length }))
    .sort((a, b) => b.score - a.score || new Date(b.item.publishedAt) - new Date(a.item.publishedAt))
    .slice(0, limit)
    .map(({ item }) => item);
}

export function dashboardStats() {
  const published = state.articles.filter((article) => article.status === 'published').length;
  return {
    total: state.articles.length,
    published,
    drafts: state.articles.length - published,
    categories: state.categories.length,
    media: state.media.length,
    updatedAt: state.articles.reduce((latest, article) => (article.updatedAt > latest ? article.updatedAt : latest), ''),
  };
}

function cleanResources(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const quarkRaw = String(source.quarkUrl || '').trim();
  const quarkUrl = safeQuarkUrl(quarkRaw);
  if (quarkRaw && !quarkUrl) throw Object.assign(new Error('夸克网盘链接需为 https://pan.quark.cn/s/ 开头'), { status: 400 });
  const quarkCode = String(source.quarkCode || '').trim().toUpperCase();
  if (quarkCode && !/^[A-Z0-9]{1,16}$/.test(quarkCode)) throw Object.assign(new Error('提取码只能包含 1–16 位字母或数字'), { status: 400 });
  const officialRaw = String(source.officialUrl || '').trim();
  const officialUrl = safeHttpsUrl(officialRaw);
  if (officialRaw && !officialUrl) throw Object.assign(new Error('官网地址必须是有效的 HTTPS 链接'), { status: 400 });
  const releaseRaw = String(source.releaseUrl || '').trim();
  const releaseUrl = safeHttpsUrl(releaseRaw);
  if (releaseRaw && !releaseUrl) throw Object.assign(new Error('官方 Release 地址必须是有效的 HTTPS 链接'), { status: 400 });
  return {
    quarkUrl,
    quarkCode,
    officialUrl,
    releaseUrl,
    note: String(source.note || '').trim().slice(0, 300),
  };
}

export function normalizeArticleInput(input, existing = null) {
  const title = String(input.title || '').trim().slice(0, 120);
  const content = String(input.content || '').trim().slice(0, 30000);
  const categoryId = categoryById(String(input.categoryId || ''))?.id || state.categories[0].id;
  if (!title) throw Object.assign(new Error('请输入文章标题'), { status: 400 });
  if (!content) throw Object.assign(new Error('请输入正文内容'), { status: 400 });
  const now = new Date().toISOString();
  const status = input.status === 'draft' ? 'draft' : 'published';
  const rawResources = input.resources && typeof input.resources === 'object' ? input.resources : existing?.resources || {};
  return {
    title,
    content,
    categoryId,
    excerpt: String(input.excerpt || '').trim().slice(0, 220),
    tags: parseTags(input.tags),
    cover: /^\/uploads\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp|gif)$/i.test(String(input.cover || '')) ? input.cover : '',
    status,
    pinned: Boolean(input.pinned) && status === 'published',
    resources: cleanResources(rawResources),
    publishedAt: existing?.publishedAt || (status === 'published' ? now : null),
    updatedAt: now,
  };
}

export function normalizeCategoryInput(input) {
  const name = String(input.name || '').trim().slice(0, 24);
  if (!name) throw Object.assign(new Error('请输入分类名称'), { status: 400 });
  return {
    name,
    slug: String(input.slug || name).normalize('NFKC').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^\p{L}\p{N}-]+/gu, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || `cat-${Date.now().toString(36)}`,
    description: String(input.description || '').trim().slice(0, 120),
  };
}

export function normalizeSettings(input) {
  const contact = String(input.contact || '').trim().slice(0, 100);
  return {
    siteName: String(input.siteName || '').trim().slice(0, 30) || '开源栈',
    siteSubtitle: String(input.siteSubtitle || '').trim().slice(0, 60),
    logoText: String(input.logoText || '').trim().slice(0, 2),
    logoImage: /^\/uploads\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp|gif)$/i.test(String(input.logoImage || '')) ? input.logoImage : '',
    description: String(input.description || '').trim().slice(0, 240),
    accent: /^#[0-9a-f]{6}$/i.test(String(input.accent || '').trim()) ? String(input.accent).trim().toLowerCase() : '#2f6b5e',
    contact: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact : '',
    footer: String(input.footer || '').trim().slice(0, 200),
    postsPerPage: clampNumber(input.postsPerPage, 4, 18, 8),
    about: String(input.about || '').trim().slice(0, 12000),
  };
}

export function addMedia(record) {
  return mutate((db) => {
    const media = { id: uid('media'), ...record };
    db.media.unshift(media);
    return media;
  });
}
