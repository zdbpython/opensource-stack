import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  ASSET_DIR, PUBLIC_DIR, UPLOAD_DIR, DATA_DIR, initStore, getDb, mutate, mutateAuth,
  publishedArticles, articleBySlug, articleById, categoryBySlug, categoryById,
  categoryCounts, monthGroups, searchArticles, normalizeArticleInput, normalizeCategoryInput,
  normalizeSettings, dashboardStats, addMedia, hashPassword, getInitialPassword, getAuth,
} from './lib/store.js';
import { uid, escapeHtml, validColor, monthLabel, normalizeQuery, clampNumber, uniqueSlug, safeAssetPath, safeEquals } from './lib/util.js';
import {
  parseCookies, readJson, readMultipart, sendHtml, sendJson, sendText, redirect,
  sessionCookie, clearSessionCookie, isSecure,
} from './lib/http.js';
import {
  sessionFromRequest, requireSession, createSession, destroySession, csrfValid,
  refreshSession, verifyPassword, loginAllowed, recordLoginFailure, clearLoginFailures,
} from './lib/auth.js';
import { coverSvg } from './lib/cover.js';
import { renderMarkdown } from './lib/markdown.js';
import * as views from './lib/views.js';
import * as adminViews from './lib/admin-views.js';

const boot = initStore();
const PORT = Number.parseInt(process.env.PORT || '4173', 10);
const HOST = process.env.HOST || '127.0.0.1';
const MIME = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
};

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: https:; script-src 'self'; style-src 'self'; connect-src 'self'; font-src 'self' data:",
};

function headers(extra = {}) { return { ...securityHeaders, ...extra }; }
function db() { return getDb(); }
function settings() { return db().settings; }
function categories() { return db().categories; }
function viewOptions(extra = {}) { return { settings: settings(), categories: categories(), ...extra }; }
function clientKey(req) { return String(req.socket.remoteAddress || 'unknown'); }
function errorStatus(error) { return Number.isInteger(error?.status) ? error.status : 500; }
function errorMessage(error) { return error?.status ? error.message : '服务器暂时无法完成请求'; }

function render(res, html, status = 200, extra = {}) {
  sendHtml(res, html, status, headers(extra));
}

function json(res, data, status = 200, extra = {}) {
  sendJson(res, data, status, headers(extra));
}

function notFound(req, res) {
  render(res, views.notFoundPage(viewOptions()), 404);
}

function themeCss() {
  const accent = validColor(settings().accent);
  return `:root{--accent:${accent};--accent-dark:${shade(accent,-28)};--accent-soft:${shade(accent,-68)};--accent-glow:${shade(accent,-82)}}`;
}

function shade(hex, amount) {
  const base = hex.replace('#', '');
  const channels = [0, 2, 4].map((index) => Number.parseInt(base.slice(index, index + 2), 16));
  const mixed = channels.map((channel) => Math.round(amount > 0 ? channel + (255 - channel) * (amount / 100) : channel * (1 + amount / 100)));
  return `#${mixed.map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')).join('')}`;
}

function staticFile(req, res, root, relative, cache = 'public, max-age=300') {
  const decoded = decodeURIComponent(relative);
  const full = path.resolve(root, `.${path.sep}${decoded}`);
  const normalizedRoot = path.resolve(root);
  if (!full.startsWith(`${normalizedRoot}${path.sep}`)) return notFound(req, res);
  fs.stat(full, (error, stat) => {
    if (error || !stat.isFile()) return notFound(req, res);
    const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, headers({ 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': cache }));
    fs.createReadStream(full).pipe(res);
  });
}

function cover(req, res, rawSlug) {
  const slug = decodeURIComponent(rawSlug).replace(/\.svg$/i, '');
  const article = articleBySlug(slug);
  if (!article) return notFound(req, res);
  const category = categoryById(article.categoryId);
  sendText(res, coverSvg(article, settings(), category || {}), 200, headers({ 'Content-Type': MIME['.svg'], 'Cache-Control': 'public, max-age=3600' }));
}

function parsePath(pathname) {
  const parts = pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  return parts;
}

function listingParams(req, url, parts) {
  const query = url.searchParams.get('q') || '';
  const pageIndex = parts.indexOf('page');
  const page = clampNumber(pageIndex >= 0 ? parts[pageIndex + 1] : url.searchParams.get('page'), 1, 9999, 1);
  return { query: normalizeQuery(query), page };
}

async function publicRoute(req, res, url) {
  const pathname = url.pathname;
  const parts = parsePath(pathname);
  const perPage = settings().postsPerPage || 8;

  if (pathname === '/') {
    const { page } = listingParams(req, url, parts);
    const result = searchArticles('', {}, page, perPage);
    if (page > result.totalPages && page > 1) return redirect(res, '/');
    return render(res, views.homePage(viewOptions({ result, page: result.current })));
  }
  if (parts[0] === 'page' && /^\d+$/.test(parts[1] || '') && parts.length === 2) {
    const page = Number(parts[1]);
    const result = searchArticles('', {}, page, perPage);
    if (page !== result.current) return redirect(res, result.current <= 1 ? '/' : `/page/${result.current}`);
    return render(res, views.homePage(viewOptions({ result, page: result.current })));
  }
  if (parts[0] === 'category' && parts[1]) {
    const category = categoryBySlug(parts[1]);
    if (!category) return notFound(req, res);
    const { page } = listingParams(req, url, parts);
    const result = searchArticles('', { categoryId: category.id }, page, perPage);
    if (page > result.totalPages && page > 1) return redirect(res, `/category/${encodeURIComponent(category.slug)}`);
    return render(res, views.listingPage(viewOptions({
      result, kind: `CATEGORY / ${category.slug.toUpperCase()}`, title: category.name,
      description: category.description, base: `/category/${encodeURIComponent(category.slug)}`,
      active: category.slug,
    })));
  }
  if (parts[0] === 'archive' && parts[1]) {
    const month = parts[1];
    if (!/^\d{4}-\d{2}$/.test(month)) return notFound(req, res);
    const { page } = listingParams(req, url, parts);
    const result = searchArticles('', { month }, page, perPage);
    if (page > result.totalPages && page > 1) return redirect(res, `/archive/${encodeURIComponent(month)}`);
    return render(res, views.listingPage(viewOptions({
      result, kind: 'ARCHIVE / MONTHLY', title: `${monthLabel(month)} 归档`,
      description: '按月份回看这段时间留下的工具记录与方法笔记。', base: `/archive/${encodeURIComponent(month)}`,
    })));
  }
  if (parts[0] === 'article' && parts[1]) {
    const article = articleBySlug(parts[1]);
    if (!article) return notFound(req, res);
    return render(res, views.articlePage(viewOptions({ article })));
  }
  if (pathname === '/search' || pathname === '/search/') {
    const { query, page } = listingParams(req, url, parts);
    const result = searchArticles(query, {}, page, perPage);
    return render(res, views.listingPage(viewOptions({
      result, kind: 'SEARCH / INDEX', title: query ? `检索「${query}」` : '站内检索',
      description: query ? `在标题、摘要、正文、分类与标签中查找「${query}」。` : '输入关键词，检索这本档案里的全部公开内容。',
      base: '/search', query: `?q=${encodeURIComponent(query)}`,
    })));
  }
  if (pathname === '/about') return render(res, views.aboutPage(viewOptions()));
  return notFound(req, res);
}

async function loginApi(req, res) {
  const key = clientKey(req);
  if (!loginAllowed(key)) return json(res, { error: '尝试次数过多，请 10 分钟后再试' }, 429);
  const input = await readJson(req);
  const auth = getAuth();
  const user = String(input.username || '').trim();
  const pass = String(input.password || '');
  const matches = safeEquals(user, auth.username) && verifyPassword(pass);
  if (!matches) {
    recordLoginFailure(key);
    return json(res, { error: '账号或密码不正确' }, 401);
  }
  clearLoginFailures(key);
  const session = createSession(res, req, auth.username);
  return json(res, { ok: true, csrf: session.csrf, username: auth.username }, 200, { 'Set-Cookie': session.headers['Set-Cookie'] });
}

function sessionPayload(session) {
  return {
    authenticated: true,
    username: session.username,
    csrf: session.csrf,
    stats: dashboardStats(),
    settings: settings(),
    categories: categories(),
    articles: db().articles.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    media: db().media,
  };
}

function adminFragment(url) {
  const view = url.searchParams.get('view') || 'dashboard';
  const articles = db().articles.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const status = ['published', 'draft'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'all';
  const query = normalizeQuery(url.searchParams.get('q'));
  const counts = Object.fromEntries(categoryCounts().map((category) => [category.id, category.count]));
  if (view === 'articles') {
    let list = articles;
    if (status !== 'all') list = list.filter((article) => article.status === status);
    if (query) {
      const needle = query.toLocaleLowerCase();
      list = list.filter((article) => `${article.title} ${categoryById(article.categoryId)?.name || ''}`.toLocaleLowerCase().includes(needle));
    }
    return { html: adminViews.articlesView(list, { status, query }), title: '文章档案', kicker: 'CONTENT / ARCHIVE', nav: 'articles' };
  }
  if (view === 'editor') {
    const article = articleById(url.searchParams.get('id') || '');
    return {
      html: adminViews.editorView({ article, categories: categories(), settings: settings() }),
      title: article ? '编辑档案' : '撰写新档案',
      kicker: 'EDITOR / COMPOSE',
      nav: 'articles',
    };
  }
  if (view === 'categories') {
    return { html: adminViews.categoriesView(categories(), counts), title: '分类目录', kicker: 'TAXONOMY', nav: 'categories' };
  }
  if (view === 'media') {
    return { html: adminViews.mediaView(db().media), title: '媒体库', kicker: 'MEDIA / ASSETS', nav: 'media' };
  }
  if (view === 'settings') {
    return { html: adminViews.settingsView(settings()), title: '站点设置', kicker: 'CONFIGURATION', nav: 'settings' };
  }
  return { html: adminViews.dashboardView(dashboardStats(), articles, settings()), title: '工作台', kicker: 'OVERVIEW', nav: 'dashboard' };
}

async function apiRoute(req, res, url) {
  const pathname = url.pathname;
  if (pathname === '/api/login' && req.method === 'POST') return loginApi(req, res);
  const session = requireSession(req, res);
  if (!session) return;
  if (csrfValid(req, session)) refreshSession(session.sid);

  if (pathname === '/api/session' && req.method === 'GET') {
    return json(res, sessionPayload(session));
  }
  if (pathname === '/api/admin/view' && req.method === 'GET') {
    return json(res, adminFragment(url));
  }
  if (pathname === '/api/logout' && req.method === 'POST') {
    if (!csrfValid(req, session)) return json(res, { error: '安全令牌无效' }, 403);
    const cookie = destroySession(req, res);
    return json(res, { ok: true }, 200, { 'Set-Cookie': cookie });
  }
  if (req.method !== 'GET' && !csrfValid(req, session)) return json(res, { error: '安全令牌无效，请刷新页面' }, 403);

  if (pathname === '/api/preview' && req.method === 'POST') {
    const input = await readJson(req);
    return json(res, { html: renderMarkdown(String(input.content || '').slice(0, 30000)) });
  }
  if (pathname === '/api/upload' && req.method === 'POST') {
    const { buffer, name, type } = await readMultipart(req);
    const max = 4 * 1024 * 1024;
    if (!buffer.length || buffer.length > max) throw Object.assign(new Error('图片大小需在 4 MB 以内'), { status: 400 });
    const allowed = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
    const extension = allowed[type];
    if (!extension) throw Object.assign(new Error('仅支持 PNG / JPEG / WebP / GIF'), { status: 400 });
    const signatures = {
      'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
      'image/webp': (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
      'image/gif': (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString()),
    };
    if (!signatures[type](buffer)) throw Object.assign(new Error('文件内容与图片格式不匹配'), { status: 400 });
    const filename = `${uid('img')}${extension}`;
    await fsp.writeFile(path.join(UPLOAD_DIR, filename), buffer);
    const media = await addMedia({ url: `/uploads/${filename}`, filename, originalName: path.basename(name).slice(0, 100), type, size: buffer.length, createdAt: new Date().toISOString() });
    return json(res, { ok: true, media });
  }

  if (pathname === '/api/articles' && req.method === 'POST') {
    const input = normalizeArticleInput(await readJson(req));
    const article = await mutate((state) => {
      const slug = uniqueSlug(input.title, state.articles.map((item) => item.slug));
      const record = { id: uid('post'), slug, createdAt: new Date().toISOString(), ...input };
      if (record.pinned) state.articles.forEach((item) => { item.pinned = false; });
      state.articles.unshift(record);
      return record;
    });
    return json(res, { ok: true, article }, 201);
  }
  const articleMatch = pathname.match(/^\/api\/articles\/([^/]+)$/);
  if (articleMatch) {
    const id = decodeURIComponent(articleMatch[1]);
    if (req.method === 'PUT') {
      const input = normalizeArticleInput(await readJson(req), articleById(id));
      const article = await mutate((state) => {
        const record = state.articles.find((item) => item.id === id);
        if (!record) throw Object.assign(new Error('文章不存在'), { status: 404 });
        if (input.pinned) state.articles.forEach((item) => { if (item.id !== id) item.pinned = false; });
        Object.assign(record, input);
        return record;
      });
      return json(res, { ok: true, article });
    }
    if (req.method === 'DELETE') {
      const article = articleById(id);
      await mutate((state) => { state.articles = state.articles.filter((item) => item.id !== id); });
      if (article?.cover) {
        const filename = path.basename(article.cover);
        await fsp.unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
        await mutate((state) => { state.media = state.media.filter((item) => item.filename !== filename); });
      }
      return json(res, { ok: true });
    }
  }

  if (pathname === '/api/categories' && req.method === 'POST') {
    const input = normalizeCategoryInput(await readJson(req));
    const category = await mutate((state) => {
      const slug = uniqueSlug(input.slug || input.name, state.categories.map((item) => item.slug));
      const record = { id: uid('cat'), ...input, slug };
      state.categories.push(record);
      return record;
    });
    return json(res, { ok: true, category }, 201);
  }
  const categoryMatch = pathname.match(/^\/api\/categories\/([^/]+)$/);
  if (categoryMatch) {
    const id = decodeURIComponent(categoryMatch[1]);
    if (req.method === 'PUT') {
      const input = normalizeCategoryInput(await readJson(req));
      const category = await mutate((state) => {
        const record = state.categories.find((item) => item.id === id);
        if (!record) throw Object.assign(new Error('分类不存在'), { status: 404 });
        const slug = uniqueSlug(input.slug, state.categories.map((item) => item.slug), record.slug);
        Object.assign(record, input, { slug });
        return record;
      });
      return json(res, { ok: true, category });
    }
    if (req.method === 'DELETE') {
      if (categories().length <= 1) throw Object.assign(new Error('至少保留一个分类'), { status: 400 });
      const used = db().articles.some((article) => article.categoryId === id);
      if (used) throw Object.assign(new Error('该分类下仍有文章，请先移动文章'), { status: 400 });
      await mutate((state) => { state.categories = state.categories.filter((item) => item.id !== id); });
      return json(res, { ok: true });
    }
  }

  if (pathname === '/api/settings' && req.method === 'PUT') {
    const input = await readJson(req);
    const normalized = normalizeSettings(input);
    const currentPassword = String(input.currentPassword || '');
    const newPassword = String(input.newPassword || '');
    if (newPassword && newPassword.length < 8) throw Object.assign(new Error('新密码至少需要 8 位'), { status: 400 });
    if (newPassword && !verifyPassword(currentPassword)) throw Object.assign(new Error('当前密码不正确'), { status: 403 });
    if (newPassword) await mutateAuth((auth) => { Object.assign(auth, hashPassword(newPassword)); });
    await mutate((state) => { state.settings = normalized; });
    return json(res, { ok: true, settings: normalized });
  }

  const mediaMatch = pathname.match(/^\/api\/media\/([^/]+)$/);
  if (mediaMatch && req.method === 'DELETE') {
    const id = decodeURIComponent(mediaMatch[1]);
    const item = db().media.find((media) => media.id === id);
    if (item) {
      const filename = path.basename(item.url);
      await fsp.unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
      await mutate((state) => {
        state.media = state.media.filter((media) => media.id !== id);
        state.articles.forEach((article) => { if (article.cover === item.url) article.cover = ''; });
        if (state.settings.logoImage === item.url) state.settings.logoImage = '';
      });
    }
    return json(res, { ok: true });
  }
  return json(res, { error: '接口不存在' }, 404);
}

async function adminRoute(req, res, url) {
  const pathname = url.pathname;
  if (pathname === '/admin/login') {
    const session = sessionFromRequest(req);
    if (session) return redirect(res, '/admin');
    return render(res, views.layout({ title: '管理员登录', settings: settings(), categories: [], admin: true, body: adminViews.loginView('', settings().siteName, settings().logoText) }));
  }
  if (pathname === '/admin') {
    const session = sessionFromRequest(req);
    if (!session) return redirect(res, '/admin/login');
    refreshSession(session.sid);
    const body = adminViews.shellView({ settings: settings(), username: session.username, csrf: session.csrf, active: 'dashboard' });
    return render(res, views.layout({ title: '内容后台', description: '内容管理后台', settings: settings(), categories: [], admin: true, body }), 200, { 'Set-Cookie': sessionCookie(session.sid, isSecure(req)) });
  }
  return notFound(req, res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE'].includes(req.method)) return json(res, { error: '不支持的请求方法' }, 405);
    if (pathname === '/health') return json(res, { ok: true, service: 'gewu-cms', articles: publishedArticles().length });
    if (pathname === '/assets/theme.css' && req.method === 'GET') return sendText(res, themeCss(), 200, headers({ 'Content-Type': MIME['.css'], 'Cache-Control': 'no-store' }));
    if (pathname.startsWith('/assets/') && req.method === 'GET') return staticFile(req, res, ASSET_DIR, pathname.slice('/assets/'.length));
    if (pathname.startsWith('/uploads/') && req.method === 'GET') {
      const filename = path.basename(pathname.slice('/uploads/'.length));
      if (filename !== pathname.slice('/uploads/'.length)) return notFound(req, res);
      return staticFile(req, res, UPLOAD_DIR, filename, 'public, max-age=86400');
    }
    if (pathname.startsWith('/cover/') && req.method === 'GET') return cover(req, res, pathname.slice('/cover/'.length));
    if (pathname.startsWith('/api/')) return apiRoute(req, res, url);
    if (pathname.startsWith('/admin')) return adminRoute(req, res, url);
    return publicRoute(req, res, url);
  } catch (error) {
    const status = errorStatus(error);
    if (status >= 500) console.error(error);
    if (req.url.startsWith('/api/')) return json(res, { error: errorMessage(error) }, status);
    return render(res, views.layout(viewOptions({ title: '出错了', body: `<div class="not-found"><span>${status}</span><h1>${escapeHtml(errorMessage(error))}</h1><a class="button-primary" href="/">返回首页</a></div>` })), status);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`格物志 CMS 已启动：http://${HOST}:${PORT}`);
  console.log(`前台首页：http://${HOST}:${PORT}/`);
  console.log(`后台入口：http://${HOST}:${PORT}/admin`);
  console.log(`管理员账号：${boot.username}`);
  if (boot.initialPassword) console.log(`初始密码（仅首次生成时显示）：${boot.initialPassword}`);
  console.log(`数据文件：${boot.dbPath}`);
});
