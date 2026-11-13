(() => {
  const results = document.querySelector('#search-results');
  const empty = document.querySelector('#search-empty');
  const heading = document.querySelector('#search-heading');
  const count = document.querySelector('#search-count');
  const pagination = document.querySelector('#search-pagination');
  if (!results || !empty || !heading || !count || !pagination) return;

  const params = new URLSearchParams(window.location.search);
  const query = (params.get('q') || '').trim();
  let page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  let articles = [];
  let perPage = 8;

  function makeCard(article, index) {
    const card = document.createElement('article');
    card.className = 'post-card';

    const imageLink = document.createElement('a');
    imageLink.className = 'card-image';
    imageLink.href = `/article/${encodeURIComponent(article.slug)}/`;
    imageLink.setAttribute('aria-label', `阅读：${article.title}`);
    const image = document.createElement('img');
    image.src = article.cover;
    image.alt = '';
    image.loading = index < 3 ? 'eager' : 'lazy';
    const stamp = document.createElement('span');
    stamp.className = 'image-stamp';
    stamp.textContent = `NO. ${String(index + 1).padStart(2, '0')}`;
    imageLink.append(image, stamp);

    const body = document.createElement('div');
    body.className = 'card-body';
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    const category = document.createElement('a');
    category.href = article.categorySlug ? `/category/${encodeURIComponent(article.categorySlug)}/` : '/';
    category.textContent = article.category;
    const date = document.createElement('time');
    date.textContent = article.date;
    meta.append(category, date);

    const title = document.createElement('h2');
    const titleLink = document.createElement('a');
    titleLink.href = `/article/${encodeURIComponent(article.slug)}/`;
    titleLink.textContent = article.title;
    title.append(titleLink);

    const excerpt = document.createElement('p');
    excerpt.textContent = article.excerpt;

    const foot = document.createElement('div');
    foot.className = 'card-foot';
    const time = document.createElement('span');
    time.textContent = `${article.readMinutes} 分钟阅读`;
    const tag = document.createElement('span');
    tag.textContent = article.tags[0] || '档案';
    const arrow = document.createElement('a');
    arrow.href = `/article/${encodeURIComponent(article.slug)}/`;
    arrow.setAttribute('aria-label', '阅读全文');
    arrow.textContent = '↗';
    foot.append(time, tag, arrow);
    body.append(meta, title, excerpt, foot);
    card.append(imageLink, body);
    return card;
  }

  function renderPagination(totalPages) {
    pagination.replaceChildren();
    if (totalPages <= 1) return;
    const line = document.createElement('div');
    line.className = 'page-line';
    line.textContent = `${String(articles.length).padStart(2, '0')} 份 / 第 ${String(page).padStart(2, '0')} 页`;
    const prev = document.createElement('a');
    prev.className = 'page-arrow';
    prev.textContent = '← 上一页';
    if (page > 1) prev.href = `/search/?q=${encodeURIComponent(query)}&page=${page - 1}`;
    const numbers = document.createElement('div');
    numbers.className = 'page-numbers';
    for (let index = 1; index <= totalPages; index += 1) {
      const link = document.createElement('a');
      link.href = `/search/?q=${encodeURIComponent(query)}&page=${index}`;
      link.textContent = String(index).padStart(2, '0');
      if (index === page) {
        link.className = 'is-current';
        link.setAttribute('aria-current', 'page');
      }
      numbers.append(link);
    }
    const next = document.createElement('a');
    next.className = 'page-arrow';
    next.textContent = '下一页 →';
    if (page < totalPages) next.href = `/search/?q=${encodeURIComponent(query)}&page=${page + 1}`;
    pagination.append(line, prev, numbers, next);
  }

  function render() {
    const needle = query.toLocaleLowerCase();
    const matched = articles.filter((article) => {
      if (!needle) return true;
      return [article.title, article.excerpt, article.category, article.text, ...(article.tags || [])].join(' ').toLocaleLowerCase().includes(needle);
    });
    const totalPages = Math.max(1, Math.ceil(matched.length / perPage));
    page = Math.min(page, totalPages);
    const start = (page - 1) * perPage;
    results.replaceChildren(...matched.slice(start, start + perPage).map((article, index) => makeCard(article, start + index)));
    empty.hidden = matched.length > 0;
    heading.textContent = query ? `检索「${query}」` : '站内检索';
    count.textContent = `${String(matched.length).padStart(2, '0')} ENTRIES`;
    renderPagination(totalPages);
  }

  fetch('/search-index.json', { cache: 'no-store' })
    .then((response) => response.json())
    .then((data) => {
      articles = data.articles || [];
      perPage = Math.max(1, Number(data.perPage) || 8);
      render();
    })
    .catch(() => {
      count.textContent = '索引读取失败';
      empty.hidden = false;
    });
})();
