import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initStore, getDb, publishedArticles, categoryById, searchArticles, monthGroups,
} from '../lib/store.js';
import * as views from '../lib/views.js';
import { coverSvg } from '../lib/cover.js';
import {
  escapeHtml, formatDate, monthLabel, readingTime, stripMarkdown, safeImageUrl, validColor,
} from '../lib/util.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const domain = process.env.SITE_DOMAIN || '345600.xyz';
const origin = `https://${domain}`;

initStore({ initAuth: false });
const db = getDb();
const settings = db.settings;
const categories = [...db.categories].sort((a, b) => a.order - b.order);
const perPage = Math.min(24, Math.max(4, Number(settings.postsPerPage) || 8));
const articles = publishedArticles();

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else if (entry.isFile()) fs.writeFileSync(to, fs.readFileSync(from));
  }
}

copyDirectory(path.join(root, 'public', 'assets'), path.join(dist, 'assets'));
if (fs.existsSync(path.join(root, 'data', 'uploads'))) {
  copyDirectory(path.join(root, 'data', 'uploads'), path.join(dist, 'uploads'));
}
if (fs.existsSync(path.join(root, 'public', '_headers'))) {
  fs.writeFileSync(path.join(dist, '_headers'), fs.readFileSync(path.join(root, 'public', '_headers')));
}
if (fs.existsSync(path.join(root, 'public', '_redirects'))) {
  fs.writeFileSync(path.join(dist, '_redirects'), fs.readFileSync(path.join(root, 'public', '_redirects')));
}

function write(relative, content) {
  const value = relative.endsWith('.html')
    ? content.replace('<a href="/admin">内容后台 <span aria-hidden="true">↗</span></a>', '<span>由 GitHub 构建 · Cloudflare Pages 托管</span>')
    : content;
  const file = path.join(dist, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function shade(hex, amount) {
  const base = validColor(hex).replace('#', '');
  const channels = [0, 2, 4].map((index) => Number.parseInt(base.slice(index, index + 2), 16));
  const mixed = channels.map((channel) => Math.round(amount > 0 ? channel + (255 - channel) * (amount / 100) : channel * (1 + amount / 100)));
  return `#${mixed.map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')).join('')}`;
}

function coverPath(article) {
  const uploaded = safeImageUrl(article.cover);
  return uploaded && uploaded.startsWith('/uploads/') ? uploaded : `/cover/${encodeURIComponent(article.slug)}.svg`;
}

function themeCss() {
  const accent = validColor(settings.accent);
  return `:root{--accent:${accent};--accent-dark:${shade(accent, -28)};--accent-soft:${shade(accent, -68)};--accent-glow:${shade(accent, -82)}}`;
}

function pageHtml(result, page, base, extra = {}) {
  return views.homePage({ settings, categories, result, page });
}

write('index.html', pageHtml(searchArticles('', {}, 1, perPage), 1, '/'));
const homeFirst = searchArticles('', {}, 1, perPage);
for (let page = 2; page <= homeFirst.totalPages; page += 1) {
  write(`page/${page}/index.html`, pageHtml(searchArticles('', {}, page, perPage), page, '/'));
}

for (const category of categories) {
  const first = searchArticles('', { categoryId: category.id }, 1, perPage);
  for (let page = 1; page <= first.totalPages; page += 1) {
    const result = searchArticles('', { categoryId: category.id }, page, perPage);
    const html = views.listingPage({
      settings,
      categories,
      result,
      kind: `CATEGORY / ${category.slug.toUpperCase()}`,
      title: category.name,
      description: category.description,
      base: `/category/${encodeURIComponent(category.slug)}`,
      active: category.slug,
    });
    const rel = page === 1 ? `category/${category.slug}/index.html` : `category/${category.slug}/page/${page}/index.html`;
    write(rel, html);
  }
}

for (const month of monthGroups()) {
  const first = searchArticles('', { month: month.key }, 1, perPage);
  for (let page = 1; page <= first.totalPages; page += 1) {
    const result = searchArticles('', { month: month.key }, page, perPage);
    const html = views.listingPage({
      settings,
      categories,
      result,
      kind: 'ARCHIVE / MONTHLY',
      title: `${monthLabel(month.key)} 归档`,
      description: '按月份回看这段时间留下的工具记录与方法笔记。',
      base: `/archive/${encodeURIComponent(month.key)}`,
    });
    const rel = page === 1 ? `archive/${month.key}/index.html` : `archive/${month.key}/page/${page}/index.html`;
    write(rel, html);
  }
}

for (const article of articles) {
  write(`article/${article.slug}/index.html`, views.articlePage({ settings, categories, article }));
  const category = categoryById(article.categoryId);
  write(`cover/${article.slug}.svg`, coverSvg(article, settings, category || {}));
}

write('about/index.html', views.aboutPage({ settings, categories }));
write('404.html', views.notFoundPage({ settings, categories }));

const searchIndex = articles.map((article) => {
  const category = categoryById(article.categoryId);
  return {
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt || stripMarkdown(article.content).slice(0, 160),
    category: category?.name || '未分类',
    categorySlug: category?.slug || '',
    date: formatDate(article.publishedAt, true),
    readMinutes: readingTime(article.content),
    cover: coverPath(article),
    tags: article.tags || [],
    text: stripMarkdown(article.content).slice(0, 12000),
  };
});
write('search-index.json', `${JSON.stringify({ generatedAt: new Date().toISOString(), perPage, articles: searchIndex }, null, 2)}\n`);

const searchBody = `<div class="interior-shell"><header class="listing-head"><div class="section-kicker">SEARCH / STATIC INDEX</div><h1 id="search-heading">站内检索</h1><p>在标题、摘要、正文、分类与标签中查找开源工具教程。</p><div class="listing-count" id="search-count">读取索引中</div></header><div class="content-layout"><div class="post-column"><div class="post-grid post-grid-full" id="search-results"></div><div class="empty-state" id="search-empty" hidden><strong>没有找到匹配的档案</strong><p>换一个关键词，或从右侧分类与归档进入。</p></div><nav class="pagination" id="search-pagination" aria-label="分页"></nav></div>${views.sidebar(settings)}</div></div><script src="/assets/static-search.js" defer></script>`;
write('search/index.html', views.layout({
  title: '站内检索',
  description: '检索开源栈的全部公开教程。',
  settings,
  categories,
  body: searchBody,
}));

write('theme.css', themeCss());
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);

const urls = ['/', '/about/', '/search/'];
for (const article of articles) urls.push(`/article/${encodeURIComponent(article.slug)}/`);
for (const category of categories) urls.push(`/category/${encodeURIComponent(category.slug)}/`);
for (const month of monthGroups()) urls.push(`/archive/${month.key}/`);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${escapeHtml(origin + url)}</loc></url>`).join('\n')}\n</urlset>\n`;
write('sitemap.xml', sitemap);

console.log(`Static site built: ${dist}`);
console.log(`Articles: ${articles.length}, categories: ${categories.length}, pages: ${homeFirst.totalPages}`);
console.log(`Domain: ${domain}`);
