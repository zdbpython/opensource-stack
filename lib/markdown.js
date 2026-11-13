import { escapeHtml, safeUrl, safeImageUrl } from './util.js';

const INLINE = /(!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\))|(\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g;

function inline(text) {
  let result = '';
  let last = 0;
  INLINE.lastIndex = 0;
  for (let match = INLINE.exec(text); match; match = INLINE.exec(text)) {
    result += escapeHtml(text.slice(last, match.index));
    last = match.index + match[0].length;
    if (match[1]) {
      const url = safeImageUrl(match[3]);
      const alt = escapeHtml(match[2]);
      result += url ? `<img src="${escapeHtml(url)}" alt="${alt}" loading="lazy">` : alt;
    } else if (match[5]) {
      const url = safeUrl(match[7]);
      const label = escapeHtml(match[6]);
      if (!url) result += label;
      else {
        const external = /^https?:/i.test(url);
        result += `<a href="${escapeHtml(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
      }
    } else if (match[9]) {
      result += `<strong>${escapeHtml(match[10])}</strong>`;
    } else if (match[11]) {
      result += `<em>${escapeHtml(match[12])}</em>`;
    } else if (match[13]) {
      result += `<code>${escapeHtml(match[14])}</code>`;
    }
  }
  result += escapeHtml(text.slice(last));
  return result.replace(/\n/g, '<br>');
}

function flushParagraph(lines, output) {
  if (!lines.length) return;
  output.push(`<p>${inline(lines.join('\n'))}</p>`);
  lines.length = 0;
}

function flushList(items, ordered, output) {
  if (!items.length) return;
  const tag = ordered ? 'ol' : 'ul';
  output.push(`<${tag}>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</${tag}>`);
  items.length = 0;
}

function flushQuote(lines, output) {
  if (!lines.length) return;
  output.push(`<blockquote>${inline(lines.join(' '))}</blockquote>`);
  lines.length = 0;
}

export function renderMarkdown(source = '') {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let paragraph = [];
  let list = [];
  let ordered = false;
  let quote = [];
  let code = [];
  let codeLanguage = '';
  let inCode = false;

  const flushAll = () => {
    flushParagraph(paragraph, output);
    flushList(list, ordered, output);
    flushQuote(quote, output);
  };

  for (const line of lines) {
    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      if (inCode) {
        output.push(`<pre><code${codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = [];
        codeLanguage = '';
        inCode = false;
      } else {
        flushAll();
        inCode = true;
        codeLanguage = fence[1];
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      flushAll();
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushAll();
      output.push('<hr>');
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = Math.min(4, heading[1].length + 1);
      output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const number = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (bullet || number) {
      flushParagraph(paragraph, output);
      flushQuote(quote, output);
      const isOrdered = Boolean(number);
      if (list.length && isOrdered !== ordered) flushList(list, ordered, output);
      ordered = isOrdered;
      list.push((bullet || number)[1]);
      continue;
    }
    const quoted = line.match(/^>\s?(.+)$/);
    if (quoted) {
      flushParagraph(paragraph, output);
      flushList(list, ordered, output);
      quote.push(quoted[1]);
      continue;
    }
    flushList(list, ordered, output);
    flushQuote(quote, output);
    paragraph.push(line);
  }
  if (inCode) output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  flushAll();
  return output.join('\n');
}

export function renderPlain(source = '') {
  return String(source).replace(/[#*`>[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
}
