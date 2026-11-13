import {
  escapeHtml, formatDate, monthLabel, excerpt, readingTime, pageWindow, safeImageUrl, safeHttpsUrl, safeQuarkUrl,
} from './util.js';
import { categoryCounts, monthGroups, publishedArticles, categoryById, adjacentArticles, relatedArticles } from './store.js';
import { renderMarkdown } from './markdown.js';

const ICON_SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.4"/><path d="m16 16 4.2 4.2"/></svg>';

function coverUrl(article) {
  const uploaded = safeImageUrl(article.cover);
  return uploaded && uploaded.startsWith('/uploads/') ? uploaded : `/cover/${encodeURIComponent(article.slug)}.svg`;
}

function brand(settings) {
  const mark = settings.logoImage
    ? `<img class="brand-image" src="${escapeHtml(settings.logoImage)}" alt="">`
    : `<span class="brand-glyph" aria-hidden="true">${escapeHtml(settings.logoText || settings.siteName.slice(0, 1))}</span>`;
  return `<a class="brand" href="/" aria-label="${escapeHtml(settings.siteName)}首页">${mark}<span class="brand-copy"><strong>${escapeHtml(settings.siteName)}</strong><small>${escapeHtml(settings.siteSubtitle)}</small></span></a>`;
}

function nav(settings, categories, active = '') {
  const links = categories.slice(0, 5).map((category) => `<a class="${active === category.slug ? 'is-active' : ''}" href="/category/${encodeURIComponent(category.slug)}">${escapeHtml(category.name)}</a>`).join('');
  return `<nav class="main-nav" aria-label="主导航"><div class="nav-links">${links}<a class="${active === 'about' ? 'is-active' : ''}" href="/about">关于</a></div></nav>`;
}

export function layout({ title, description = '', body, settings, categories, active = '', admin = false }) {
  const today = new Date();
  const dateLabel = `${today.getUTCFullYear()}.${String(today.getUTCMonth() + 1).padStart(2, '0')}.${String(today.getUTCDate()).padStart(2, '0')}`;
  const head = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHtml(description || settings.description)}"><meta name="theme-color" content="${escapeHtml(settings.accent)}"><title>${escapeHtml(title)} · ${escapeHtml(settings.siteName)}</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/theme.css"><link rel="stylesheet" href="/assets/base.css">${admin ? '<link rel="stylesheet" href="/assets/admin-base.css"><link rel="stylesheet" href="/assets/admin.css">' : '<link rel="stylesheet" href="/assets/site-header.css"><link rel="stylesheet" href="/assets/site.css">'}</head>`;
  if (admin) return `${head}<body class="admin-body"><div class="admin-boot">${body}</div><script src="/assets/admin.js" defer></script></body></html>`;
  return `${head}<body>
    <a class="skip-link" href="#main">跳到正文</a>
    <div class="paper-grain" aria-hidden="true"></div>
    <header class="site-header">
      <div class="utility-rail"><span>INDEPENDENT FIELD ARCHIVE</span><span class="rail-center">把工具用明白，把过程留下来</span><span>${dateLabel} / 第 ${String(publishedArticles().length).padStart(3, '0')} 份记录</span></div>
      <div class="masthead">${brand(settings)}<div class="header-actions"><form class="header-search" action="/search/" method="get" role="search"><label class="sr-only" for="header-q">搜索档案</label><input id="header-q" name="q" type="search" placeholder="检索标题、标签或正文" autocomplete="off"><button type="submit" aria-label="搜索">${ICON_SEARCH}</button></form><a class="header-about" href="/about">编辑部 <span aria-hidden="true">↗</span></a><button class="menu-button" type="button" aria-label="展开导航" aria-expanded="false"><span></span><span></span></button></div></div>
      ${nav(settings, categories, active)}
    </header>
    <main id="main">${body}</main>
    <footer class="site-footer"><div class="footer-grid"><div><div class="footer-brand">${escapeHtml(settings.siteName)}</div><p>${escapeHtml(settings.description)}</p></div><div><div class="footer-label">索引</div>${categories.slice(0, 4).map((category) => `<a href="/category/${encodeURIComponent(category.slug)}">${escapeHtml(category.name)}</a>`).join('')}</div><div><div class="footer-label">联系</div><a href="/about">关于这本档案</a>${settings.contact ? `<a href="mailto:${escapeHtml(settings.contact)}">${escapeHtml(settings.contact)}</a>` : ''}<span>不追踪读者，不售卖数据</span></div></div><div class="footer-bottom"><span>© ${today.getUTCFullYear()} ${escapeHtml(settings.siteName)} · ${escapeHtml(settings.footer)}</span><a href="/admin">内容后台 <span aria-hidden="true">↗</span></a></div></footer>
    <script src="/assets/app.js" defer></script>
  </body></html>`;
}

function card(article, settings, index = 0, featured = false) {
  const category = categoryById(article.categoryId);
  return `<article class="post-card${featured ? ' post-card-featured' : ''}">
    <a class="card-image" href="/article/${encodeURIComponent(article.slug)}" aria-label="阅读：${escapeHtml(article.title)}"><img src="${escapeHtml(coverUrl(article))}" alt="" loading="${index < 3 ? 'eager' : 'lazy'}"><span class="image-stamp">NO. ${String(index + 1).padStart(2, '0')}</span></a>
    <div class="card-body"><div class="card-meta"><a href="/category/${encodeURIComponent(category?.slug || '')}">${escapeHtml(category?.name || '未分类')}</a><time datetime="${escapeHtml(article.publishedAt || '')}">${formatDate(article.publishedAt, true)}</time></div>
    <h2><a href="/article/${encodeURIComponent(article.slug)}">${escapeHtml(article.title)}</a></h2>
    <p>${escapeHtml(article.excerpt || excerpt(article.content, 108))}</p>
    <div class="card-foot"><span>${readingTime(article.content)} 分钟阅读</span><span>${escapeHtml((article.tags || [])[0] || '档案')}</span><a href="/article/${encodeURIComponent(article.slug)}" aria-label="阅读全文">↗</a></div></div>
  </article>`;
}

export function sidebar(settings, options = {}) {
  const recent = publishedArticles().slice(0, 5);
  const counts = categoryCounts();
  const months = monthGroups().slice(0, 8);
  return `<aside class="sidebar" aria-label="站点索引">
    <section class="sidebar-panel sidebar-search"><div class="panel-label">站内检索</div><form action="/search/" method="get" role="search"><label class="sr-only" for="sidebar-q">站内检索</label><input id="sidebar-q" name="q" type="search" placeholder="输入关键词…" value="${escapeHtml(options.query || '')}"><button type="submit">检索 ${ICON_SEARCH}</button></form></section>
    <section class="sidebar-panel"><div class="panel-label">近期档案</div><ol class="recent-list">${recent.map((article, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><a href="/article/${encodeURIComponent(article.slug)}">${escapeHtml(article.title)}</a></li>`).join('')}</ol></section>
    <section class="sidebar-panel"><div class="panel-label">专题分类</div><ul class="index-list">${counts.map((category) => `<li><a href="/category/${encodeURIComponent(category.slug)}"><span>${escapeHtml(category.name)}</span><em>${String(category.count).padStart(2, '0')}</em></a></li>`).join('')}</ul></section>
    <section class="sidebar-panel"><div class="panel-label">月份归档</div><ul class="index-list">${months.map((month) => `<li><a href="/archive/${encodeURIComponent(month.key)}"><span>${monthLabel(month.key)}</span><em>${String(month.count).padStart(2, '0')}</em></a></li>`).join('')}</ul></section>
    <section class="sidebar-note"><span>EDITOR'S NOTE</span><p>方法比结论更重要。每份档案都保留适用边界、复核步骤与失败时的退路。</p><a href="/about">阅读编辑原则 <span aria-hidden="true">→</span></a></section>
  </aside>`;
}

function pageUrl(base, page, query = '') {
  if (base === '/search') {
    const params = new URLSearchParams(query.replace(/^\?/, ''));
    if (page <= 1) params.delete('page');
    else params.set('page', String(page));
    const suffix = params.toString();
    return suffix ? `/search/?${suffix}` : '/search/';
  }
  if (base === '/') return page <= 1 ? `/${query}` : `/page/${page}${query}`;
  return page <= 1 ? `${base}${query}` : `${base}/page/${page}${query}`;
}

function pagination(result, base, query = '') {
  if (result.totalPages <= 1) return '';
  const pages = pageWindow(result.current, result.totalPages);
  const links = pages.map((page) => page === '…'
    ? '<span class="page-ellipsis">…</span>'
    : `<a class="${page === result.current ? 'is-current' : ''}" href="${pageUrl(base, page, query)}"${page === result.current ? ' aria-current="page"' : ''}>${String(page).padStart(2, '0')}</a>`).join('');
  const previous = result.current > 1 ? `<a class="page-arrow" href="${pageUrl(base, result.current - 1, query)}">← 上一页</a>` : '<span></span>';
  const next = result.current < result.totalPages ? `<a class="page-arrow" href="${pageUrl(base, result.current + 1, query)}">下一页 →</a>` : '<span></span>';
  return `<nav class="pagination" aria-label="分页"><div class="page-line"><span>${String(result.total).padStart(2, '0')} 份 / 第 ${String(result.current).padStart(2, '0')} 页</span></div>${previous}<div class="page-numbers">${links}</div>${next}</nav>`;
}

function listingHeader(kicker, title, description, count) {
  return `<header class="listing-head"><div class="section-kicker">${escapeHtml(kicker)}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><div class="listing-count">${String(count).padStart(2, '0')} ENTRIES</div></header>`;
}

export function homePage({ settings, categories, result, page }) {
  const featured = page === 1 ? result.items[0] : null;
  const rest = featured ? result.items.slice(1) : result.items;
  const intro = `<section class="home-intro"><div class="intro-left"><div class="section-kicker">VOL. 01 / ${escapeHtml(settings.siteSubtitle)}</div><h1>工具会过时，<br><em>方法值得留存。</em></h1><p>${escapeHtml(settings.description)}</p><div class="intro-actions"><a class="button-primary" href="#archive">浏览档案 <span aria-hidden="true">↓</span></a><a class="button-quiet" href="/about">了解编辑原则</a></div></div><div class="intro-right"><div class="issue-card"><span>FIELD INDEX</span><strong>${String(publishedArticles().length).padStart(2, '0')}</strong><p>份可复核的数字工具与方法记录</p><div class="issue-rule"></div><dl><div><dt>分类</dt><dd>${categories.length}</dd></div><div><dt>归档</dt><dd>${monthGroups().length}</dd></div><div><dt>更新</dt><dd>${formatDate(publishedArticles()[0]?.publishedAt, true)}</dd></div></dl></div></div></section>`;
  const grid = `<section class="archive-section" id="archive"><div class="section-title"><div><span class="section-kicker">LATEST ENTRIES</span><h2>最新档案</h2></div><span class="section-aside">按发布时间排列 · ${result.total} 份</span></div><div class="content-layout"><div class="post-column">${featured ? card(featured, settings, 0, true) : ''}${rest.length ? `<div class="post-grid">${rest.map((article, index) => card(article, settings, featured ? index + 1 : index)).join('')}</div>` : '<div class="empty-state">这一页暂时没有档案。</div>'}${pagination(result, '/')}</div>${sidebar(settings)}</div></section>`;
  return layout({ title: settings.siteName, settings, categories, active: '', body: `${intro}${grid}` });
}

export function listingPage({ settings, categories, result, kind, title, description, base, query = '', active = '' }) {
  const searchValue = new URLSearchParams(query.replace(/^\?/, '')).get('q') || '';
  const body = `<div class="interior-shell">${listingHeader(kind, title, description, result.total)}<div class="content-layout"><div class="post-column">${result.items.length ? `<div class="post-grid post-grid-full">${result.items.map((article, index) => card(article, settings, index)).join('')}</div>` : '<div class="empty-state"><strong>没有找到匹配的档案</strong><p>换一个关键词，或从右侧分类与归档进入。</p></div>'}${pagination(result, base, query)}</div>${sidebar(settings, { query: searchValue })}</div></div>`;
  return layout({ title, description, settings, categories, active, body });
}

function resourceBlock(article) {
  const resource = article.resources || {};
  const quarkUrl = safeQuarkUrl(resource.quarkUrl);
  const officialUrl = safeHttpsUrl(resource.officialUrl);
  const releaseUrl = safeHttpsUrl(resource.releaseUrl);
  const code = String(resource.quarkCode || '').trim();
  const note = String(resource.note || '').trim();
  if (!quarkUrl && !officialUrl && !releaseUrl && !note) return '';
  const quarkAction = quarkUrl
    ? `<a class="resource-link" href="${escapeHtml(quarkUrl)}" target="_blank" rel="sponsored noopener noreferrer">打开夸克网盘 <span aria-hidden="true">↗</span></a>${code ? `<span class="resource-code">提取码 <strong>${escapeHtml(code)}</strong></span>` : ''}`
    : '<span class="resource-link is-pending">夸克资源包整理中</span>';
  const officialLinks = [
    officialUrl ? `<a class="resource-secondary" href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer">官网 <span aria-hidden="true">↗</span></a>` : '',
    releaseUrl ? `<a class="resource-secondary" href="${escapeHtml(releaseUrl)}" target="_blank" rel="noopener noreferrer">官方 Release <span aria-hidden="true">↗</span></a>` : '',
  ].filter(Boolean);
  return `<section class="resource-card" id="resources" aria-labelledby="resource-title">
    <div class="resource-top"><div><div class="section-kicker">RESOURCE PACK / 合规资源包</div><h2 id="resource-title">教程、配置与清单</h2></div><span class="resource-badge">非安装包</span></div>
    <p class="resource-desc">网盘内只放本站自制的教程 PDF、配置、脚本与清单，不包含安装包、音源或未授权内容。安装包请从官方发布页获取。</p>
    <div class="resource-actions">${quarkAction}${officialLinks.length ? `<div class="resource-official">${officialLinks.join('')}</div>` : ''}</div>
    ${note ? `<p class="resource-note">${escapeHtml(note)}</p>` : ''}
    <p class="resource-disclosure">说明：夸克网盘链接为分享推广链接，转存可能为本站带来收益；资源包仅包含本站自制内容，不包含破解或未授权资源。</p>
  </section>`;
}

function downloadCta(article) {
  const resource = article.resources || {};
  const quarkUrl = safeQuarkUrl(resource.quarkUrl);
  const code = String(resource.quarkCode || '').trim();
  if (!quarkUrl && !resource.note) return '';
  return `<div class="download-cta-wrap">
    ${quarkUrl ? `<a class="download-cta" href="${escapeHtml(quarkUrl)}" target="_blank" rel="sponsored noopener noreferrer"><span><small>夸克网盘 · 本站自制</small><strong>下载教程 + 配置 + 清单</strong></span><em aria-hidden="true">↗</em></a>` : '<div class="download-cta is-pending"><span><small>夸克网盘 · 本站自制</small><strong>资源包整理中</strong></span></div>'}
    ${code ? `<span class="download-code">提取码 <strong>${escapeHtml(code)}</strong></span>` : ''}
    <p>网盘内不含安装包；软件请从官方来源获取，具体说明见文末资源区。</p>
  </div>`;
}

export function articlePage({ settings, categories, article }) {
  const category = categoryById(article.categoryId);
  const { previous, next } = adjacentArticles(article);
  const related = relatedArticles(article);
  const body = `<div class="article-shell"><nav class="breadcrumb" aria-label="面包屑"><a href="/">首页</a><span>/</span><a href="/category/${encodeURIComponent(category?.slug || '')}">${escapeHtml(category?.name || '未分类')}</a><span>/</span><span>档案</span></nav>
    <article class="article-detail"><header class="article-header"><div class="section-kicker">${escapeHtml(category?.name || '未分类')} / FIELD NOTE</div><h1>${escapeHtml(article.title)}</h1><p>${escapeHtml(article.excerpt || excerpt(article.content, 140))}</p><div class="article-meta"><time datetime="${escapeHtml(article.publishedAt || '')}">${formatDate(article.publishedAt)}</time><span>${readingTime(article.content)} 分钟阅读</span><span>编辑部档案</span></div></header>
    <figure class="article-cover"><img src="${escapeHtml(coverUrl(article))}" alt=""><figcaption>原创抽象封面 · 由站点自动生成</figcaption></figure>
    ${downloadCta(article)}
    <div class="article-layout"><div class="article-prose">${renderMarkdown(article.content)}</div>${sidebar(settings)}</div>
    <footer class="article-footer"><div class="tag-list">${(article.tags || []).map((tag) => `<span># ${escapeHtml(tag)}</span>`).join('')}</div><div class="adjacent"><div>${previous ? `<span>较新一篇</span><a href="/article/${encodeURIComponent(previous.slug)}">${escapeHtml(previous.title)}</a>` : ''}</div><div>${next ? `<span>较早一篇</span><a href="/article/${encodeURIComponent(next.slug)}">${escapeHtml(next.title)}</a>` : ''}</div></div></footer>${resourceBlock(article)}</article>
    ${related.length ? `<section class="related"><div class="section-title"><div><span class="section-kicker">KEEP READING</span><h2>继续翻阅</h2></div></div><div class="post-grid post-grid-full">${related.map((item, index) => card(item, settings, index)).join('')}</div></section>` : ''}</div>`;
  return layout({ title: article.title, description: article.excerpt || excerpt(article.content), settings, categories, active: category?.slug || '', body });
}

export function aboutPage({ settings, categories }) {
  const body = `<div class="interior-shell"><header class="listing-head"><div class="section-kicker">ABOUT / EDITORIAL PRINCIPLES</div><h1>关于这本档案</h1><p>${escapeHtml(settings.description)}</p><div class="listing-count">EDITORIAL</div></header><div class="content-layout"><div class="about-prose article-prose">${renderMarkdown(settings.about)}</div>${sidebar(settings)}</div></div>`;
  return layout({ title: '关于', settings, categories, active: 'about', body });
}

export function notFoundPage({ settings, categories }) {
  return layout({ title: '页面未找到', settings, categories, body: `<div class="not-found"><span>404</span><h1>这份档案不在索引里</h1><p>链接可能已更新，或内容尚未发布。</p><a class="button-primary" href="/">返回首页</a></div>` });
}

export function adminPage(settings) {
  return layout({ title: '内容后台', description: '内容管理后台', settings, categories: [], admin: true, body: `<div class="admin-shell" id="admin-root"><div class="admin-loading"><div class="admin-mark">${escapeHtml(settings.logoText || '格')}</div><p>正在核对编辑身份…</p></div></div>` });
}
