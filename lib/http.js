import { Buffer } from 'node:buffer';

const MAX_BODY = 6 * 1024 * 1024;
const MAX_JSON = 1024 * 1024;

export function parseCookies(header = '') {
  const result = {};
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index < 1) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!key || !value) continue;
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

export function sessionCookie(sid, secure) {
  const flags = `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure ? '; Secure' : ''}`;
  return `cms_sid=${encodeURIComponent(sid)}; ${flags}`;
}

export function clearSessionCookie(secure) {
  return `cms_sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function isSecure(req) {
  return Boolean(req.socket?.encrypted || req.headers['x-forwarded-proto'] === 'https');
}

export async function readBuffer(req, limit = MAX_BODY) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('请求内容过大');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req) {
  const buffer = await readBuffer(req, MAX_JSON);
  if (!buffer.length) return {};
  try {
    const value = JSON.parse(buffer.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    return value;
  } catch {
    const error = new Error('请求格式不是有效 JSON');
    error.status = 400;
    throw error;
  }
}

export async function readMultipart(req) {
  const contentType = String(req.headers['content-type'] || '');
  if (!/^multipart\/form-data;/i.test(contentType)) {
    const error = new Error('请使用 multipart/form-data 上传');
    error.status = 415;
    throw error;
  }
  const body = await readBuffer(req);
  try {
    const request = new Request('http://localhost/upload', { method: 'POST', headers: { 'content-type': contentType }, body });
    const form = await request.formData();
    const file = form.get('image');
    if (!file || typeof file === 'string' || !file.type?.startsWith('image/')) {
      const error = new Error('请选择图片文件');
      error.status = 400;
      throw error;
    }
    return { buffer: Buffer.from(await file.arrayBuffer()), name: String(file.name || 'upload'), type: file.type };
  } catch (error) {
    if (error.status) throw error;
    const wrapped = new Error('上传数据解析失败');
    wrapped.status = 400;
    throw wrapped;
  }
}

export function sendHtml(res, html, status = 200, extraHeaders = {}) {
  const body = Buffer.from(html, 'utf8');
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

export function sendJson(res, data, status = 200, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

export function sendText(res, text, status = 200, headers = {}) {
  const body = Buffer.from(String(text), 'utf8');
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length, ...headers });
  res.end(body);
}

export function redirect(res, location, status = 302) {
  res.writeHead(status, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}
