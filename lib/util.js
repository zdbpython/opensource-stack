import crypto from 'node:crypto';

export const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export const escapeXml = escapeHtml;

export function safeUrl(raw, options = {}) {
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value || value.startsWith('//')) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    try {
      const parsed = new URL(value);
      const allowed = new Set(options.mailto === false ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:']);
      return allowed.has(parsed.protocol) ? parsed.href : '';
    } catch {
      return '';
    }
  }
  return /^[/?#]/.test(value) ? value : '';
}

export function safeImageUrl(raw) {
  const value = safeUrl(raw, { mailto: false });
  if (!value) return '';
  if (value.startsWith('https://') || value.startsWith('http://')) return value;
  return /^\/(uploads|cover)\//.test(value) ? value : '';
}

export function safeAssetPath(raw) {
  if (typeof raw !== 'string') return '';
  return /^\/uploads\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp|gif)$/i.test(raw.trim()) ? raw.trim() : '';
}

export function safeHttpsUrl(raw) {
  const value = safeUrl(raw, { mailto: false });
  return value.startsWith('https://') ? value : '';
}

export function safeQuarkUrl(raw) {
  const value = safeHttpsUrl(raw);
  if (!value) return '';
  try {
    const parsed = new URL(value);
    return parsed.hostname === 'pan.quark.cn' && parsed.pathname.startsWith('/s/') ? parsed.href : '';
  } catch {
    return '';
  }
}

export function validColor(raw, fallback = '#c84b2f') {
  return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw.trim()) ? raw.trim().toLowerCase() : fallback;
}

export function uid(prefix = 'id') {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

export function hashString(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

export function safeEquals(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function slugify(value, fallback = 'article') {
  const slug = String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return (slug || fallback).slice(0, 72);
}

export function uniqueSlug(value, taken, current = '') {
  const base = slugify(value);
  let candidate = base;
  let index = 2;
  while (taken.some((item) => item !== current && item === candidate)) {
    candidate = `${base}-${index++}`.slice(0, 80);
  }
  return candidate;
}

export function stripMarkdown(value = '') {
  return String(value)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[>*_`~#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function excerpt(value, limit = 116) {
  const text = stripMarkdown(value);
  return text.length > limit ? `${text.slice(0, limit).trim()}…` : text;
}

export function readingTime(value) {
  return Math.max(2, Math.ceil(stripMarkdown(value).length / 420));
}

export function formatDate(value, compact = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return compact ? `${year}.${month}.${day}` : `${year} 年 ${month} 月 ${day} 日`;
}

export function monthKey(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key) {
  const [year, month] = String(key).split('-');
  return `${year} 年 ${Number(month)} 月`;
}

export function clampNumber(value, min, max, fallback = min) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function paginate(items, page, perPage) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * perPage;
  return { items: items.slice(start, start + perPage), total, totalPages, current, start };
}

export function pageWindow(current, totalPages, radius = 2) {
  const pages = new Set([1, totalPages, current]);
  for (let i = current - radius; i <= current + radius; i += 1) {
    if (i >= 1 && i <= totalPages) pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  sorted.forEach((page, index) => {
    if (index && page - sorted[index - 1] > 1) result.push('…');
    result.push(page);
  });
  return result;
}

export function normalizeQuery(value) {
  return String(value || '').trim().slice(0, 80);
}

export function parseTags(value) {
  const source = Array.isArray(value) ? value.join(',') : String(value || '');
  return [...new Set(source.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 8).map((tag) => tag.slice(0, 20));
}
