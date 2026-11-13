let csrf = '';
let currentView = 'dashboard';
let currentArticleId = '';
let filterState = { status: 'all', q: '' };
let previewTimer = 0;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function toast(message, kind = 'ok') {
  const node = document.createElement('div');
  node.className = `admin-toast${kind === 'error' ? ' error' : ''}`;
  node.textContent = message;
  document.body.append(node);
  window.setTimeout(() => node.remove(), 2800);
}

function errorBox(id, message) {
  const node = document.getElementById(id);
  if (node) node.textContent = message || '';
}

async function api(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { ...(options.headers || {}) };
  if (method !== 'GET') headers['X-CSRF-Token'] = csrf;
  let body = options.body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch(path, { method, headers, body, credentials: 'same-origin' });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (response.status === 401) {
    window.location.href = '/admin/login';
    throw new Error('登录状态已过期');
  }
  if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
  return payload;
}

async function refreshSession() {
  const data = await api('/api/session');
  csrf = data.csrf;
  return data;
}

async function uploadImage(file) {
  if (!file) return null;
  if (file.size > 4 * 1024 * 1024) throw new Error('图片不能超过 4 MB');
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('仅支持 PNG / JPEG / WebP / GIF');
  const form = new FormData();
  form.append('image', file, file.name);
  const data = await api('/api/upload', { method: 'POST', body: form });
  return data.media;
}

function parseRoute() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [pathPart] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  if (parts[0] === 'articles' && parts[1] === 'new') return { view: 'editor', id: '' };
  if (parts[0] === 'articles' && parts[1] === 'edit') return { view: 'editor', id: decodeURIComponent(parts[2] || '') };
  if (['articles', 'categories', 'media', 'settings'].includes(parts[0])) return { view: parts[0], id: '' };
  return { view: 'dashboard', id: '' };
}

function setActiveNav(nav) {
  $$('.admin-nav-link').forEach((link) => link.classList.toggle('is-active', link.dataset.nav === nav));
}

async function renderView() {
  const route = parseRoute();
  currentView = route.view;
  currentArticleId = route.id;
  const params = new URLSearchParams({ view: route.view });
  if (route.id) params.set('id', route.id);
  if (route.view === 'articles') {
    params.set('status', filterState.status);
    if (filterState.q) params.set('q', filterState.q);
  }
  const data = await api(`/api/admin/view?${params}`);
  $('#admin-content').innerHTML = data.html;
  $('#view-title').textContent = data.title;
  $('#view-kicker').textContent = data.kicker;
  setActiveNav(data.nav);
  if (route.view === 'editor') {
    initEditor();
  }
}

async function submitArticle(status) {
  const form = $('#article-form');
  if (!form) return;
  errorBox('editor-error', '');
  const formData = new FormData(form);
  const input = {
    title: String(formData.get('title') || ''),
    excerpt: String(formData.get('excerpt') || ''),
    content: String(formData.get('content') || ''),
    categoryId: String(formData.get('categoryId') || ''),
    tags: String(formData.get('tags') || ''),
    cover: String(formData.get('cover') || ''),
    pinned: formData.get('pinned') === 'on',
    resources: {
      quarkUrl: String(formData.get('quarkUrl') || ''),
      quarkCode: String(formData.get('quarkCode') || ''),
      officialUrl: String(formData.get('officialUrl') || ''),
      releaseUrl: String(formData.get('releaseUrl') || ''),
      note: String(formData.get('resourceNote') || ''),
    },
    status,
  };
  const id = String(formData.get('id') || '');
  try {
    $('#save-indicator').textContent = status === 'draft' ? '正在保存草稿…' : '正在发布…';
    const data = id
      ? await api(`/api/articles/${encodeURIComponent(id)}`, { method: 'PUT', body: input })
      : await api('/api/articles', { method: 'POST', body: input });
    await refreshSession();
    $('#save-indicator').textContent = '已保存';
    toast(status === 'draft' ? '草稿已保存' : '文章已发布');
    if (!id) {
      window.location.hash = `#/articles/edit/${encodeURIComponent(data.article.id)}`;
    } else {
      window.location.hash = '#/articles';
      await renderView();
    }
  } catch (error) {
    errorBox('editor-error', error.message);
    $('#save-indicator').textContent = '保存失败';
    toast(error.message, 'error');
  }
}

function resetCoverPreview(slug) {
  const preview = $('#cover-preview');
  const hidden = $('input[name="cover"]', $('#article-form'));
  if (preview) {
    preview.replaceChildren();
    if (slug && slug !== 'new') {
      const image = document.createElement('img');
      image.src = `/cover/${encodeURIComponent(slug)}.svg`;
      image.alt = '自动生成封面';
      preview.append(image);
    }
    const label = document.createElement('em');
    label.textContent = slug && slug !== 'new' ? '自动生成封面' : '保存后自动生成封面';
    preview.append(label);
  }
  if (hidden) hidden.value = '';
}

async function renderPreview() {
  const content = $('#content-input');
  const target = $('#preview-content');
  if (!content || !target) return;
  try {
    const data = await api('/api/preview', { method: 'POST', body: { content: content.value } });
    target.innerHTML = data.html || '<p class="admin-empty">开始输入正文后，这里会显示预览。</p>';
  } catch (error) {
    target.textContent = error.message;
  }
}

function initEditor() {
  const form = $('#article-form');
  if (!form) return;
  const content = $('#content-input');
  const slug = form.dataset.slug || '';
  renderPreview();
  content?.addEventListener('input', () => {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(renderPreview, 500);
  });
  $$('[data-action="refresh-preview"]', form).forEach((button) => button.addEventListener('click', renderPreview));
  $$('[data-action="save-draft"]', form).forEach((button) => button.addEventListener('click', () => submitArticle('draft')));
  $('[data-action="clear-cover"]', form)?.addEventListener('click', () => {
    resetCoverPreview(slug || 'new');
  });
  const file = $('input[name="image"]', form);
  file?.addEventListener('change', async () => {
    try {
      const media = await uploadImage(file.files[0]);
      if (!media) return;
      $('input[name="cover"]', form).value = media.url;
      const preview = $('#cover-preview');
      preview.replaceChildren();
      const image = document.createElement('img');
      image.src = media.url;
      image.alt = '已上传封面';
      preview.append(image);
      toast('封面已上传');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      file.value = '';
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitArticle('published');
  });
}

function initArticles() {
  $$('[data-filter]').forEach((button) => {
    button.addEventListener('click', async () => {
      filterState.status = button.dataset.filter;
      await renderView();
    });
  });
  const search = $('#article-filter');
  let searchTimer = 0;
  search?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(async () => {
      filterState.q = search.value.trim();
      const caret = search.selectionStart;
      await renderView();
      const next = $('#article-filter');
      if (next) {
        next.focus();
        next.setSelectionRange(caret, caret);
      }
    }, 320);
  });
  $$('[data-action="delete-article"]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('确定删除这篇文章？此操作不可撤销。')) return;
      try {
        await api(`/api/articles/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
        await refreshSession();
        toast('文章已删除');
        await renderView();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  });
}

function initCategories() {
  const form = $('#category-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox('category-error', '');
    const input = Object.fromEntries(new FormData(form).entries());
    try {
      await api('/api/categories', { method: 'POST', body: input });
      await refreshSession();
      toast('分类已添加');
      await renderView();
    } catch (error) {
      errorBox('category-error', error.message);
    }
  });
  $$('.category-row').forEach((row) => {
    row.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox('category-list-error', '');
      const input = Object.fromEntries(new FormData(row).entries());
      try {
        await api(`/api/categories/${encodeURIComponent(row.dataset.id)}`, { method: 'PUT', body: input });
        await refreshSession();
        toast('分类已更新');
        await renderView();
      } catch (error) {
        errorBox('category-list-error', error.message);
      }
    });
  });
  $$('[data-action="delete-category"]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('确定删除这个分类？')) return;
      try {
        await api(`/api/categories/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
        await refreshSession();
        toast('分类已删除');
        await renderView();
      } catch (error) {
        errorBox('category-list-error', error.message);
      }
    });
  });
}

function initMedia() {
  const input = $('#media-file');
  const drop = $('#upload-drop');
  const upload = async (files) => {
    errorBox('media-error', '');
    for (const file of files) {
      try {
        await uploadImage(file);
        toast(`已上传 ${file.name}`);
      } catch (error) {
        errorBox('media-error', error.message);
      }
    }
    await refreshSession();
    await renderView();
  };
  input?.addEventListener('change', () => upload(Array.from(input.files || [])));
  if (drop) {
    ['dragenter', 'dragover'].forEach((name) => drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach((name) => drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.remove('is-over');
    }));
    drop.addEventListener('drop', (event) => upload(Array.from(event.dataTransfer?.files || [])));
  }
  $$('[data-action="delete-media"]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('确定删除这张图片？引用它的文章封面将被清空。')) return;
      try {
        await api(`/api/media/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
        await refreshSession();
        toast('图片已删除');
        await renderView();
      } catch (error) {
        errorBox('media-error', error.message);
      }
    });
  });
}

function initSettings() {
  const form = $('#settings-form');
  if (!form) return;
  const color = form.elements.accent;
  const colorText = form.elements.accentText;
  color?.addEventListener('input', () => { colorText.value = color.value; });
  colorText?.addEventListener('input', () => {
    if (/^#[0-9a-f]{6}$/i.test(colorText.value)) color.value = colorText.value;
  });
  const logoFile = form.elements.image;
  logoFile?.addEventListener('change', async () => {
    try {
      const media = await uploadImage(logoFile.files[0]);
      if (!media) return;
      form.elements.logoImage.value = media.url;
      const preview = $('#logo-preview');
      preview.replaceChildren();
      const image = document.createElement('img');
      image.src = media.url;
      image.alt = '站点标记';
      preview.append(image);
      toast('站点标记已上传');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      logoFile.value = '';
    }
  });
  $('[data-action="clear-logo"]', form)?.addEventListener('click', () => {
    form.elements.logoImage.value = '';
    const preview = $('#logo-preview');
    preview.replaceChildren();
    const span = document.createElement('span');
    span.textContent = form.elements.logoText.value || '格';
    preview.append(span);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox('settings-error', '');
    const data = Object.fromEntries(new FormData(form).entries());
    delete data.image;
    delete data.accentText;
    try {
      const result = await api('/api/settings', { method: 'PUT', body: data });
      sessionStorage.setItem('admin-toast', '站点设置已保存');
      window.location.reload();
      return result;
    } catch (error) {
      errorBox('settings-error', error.message);
      toast(error.message, 'error');
    }
  });
}

function initLogin() {
  const form = $('#login-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox('login-error', '');
    const input = Object.fromEntries(new FormData(form).entries());
    const button = $('button[type="submit"]', form);
    button.disabled = true;
    try {
      const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), credentials: 'same-origin' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || '登录失败');
      window.location.href = '/admin';
    } catch (error) {
      errorBox('login-error', error.message);
      button.disabled = false;
    }
  });
}

async function initAdmin() {
  const data = await refreshSession().catch(() => null);
  if (!data) return;
  csrf = data.csrf;
  const saved = sessionStorage.getItem('admin-toast');
  if (saved) {
    sessionStorage.removeItem('admin-toast');
    toast(saved);
  }
  $('[data-action="logout"]')?.addEventListener('click', async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } finally {
      window.location.href = '/admin/login';
    }
  });
  $('[data-action="view-site"]')?.addEventListener('click', () => window.open('/', '_blank', 'noopener'));
  window.addEventListener('hashchange', () => renderView().catch((error) => toast(error.message, 'error')));
  if (!window.location.hash) window.history.replaceState(null, '', '#/dashboard');
  await renderView();
}

const originalRenderView = renderView;
renderView = async function () {
  await originalRenderView();
  if (currentView === 'articles') initArticles();
  if (currentView === 'categories') initCategories();
  if (currentView === 'media') initMedia();
  if (currentView === 'settings') initSettings();
};

if ($('#login-form')) initLogin();
else if ($('#admin-root') || $('.admin-shell')) initAdmin().catch((error) => toast(error.message, 'error'));
