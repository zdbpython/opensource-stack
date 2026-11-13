import crypto from 'node:crypto';
import { getAuth } from './store.js';
import { parseCookies, isSecure, sessionCookie, clearSessionCookie } from './http.js';

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map();
const failures = new Map();

function cleanup() {
  const now = Date.now();
  for (const [sid, session] of sessions) if (session.expiresAt < now) sessions.delete(sid);
  for (const [key, record] of failures) if (record.resetAt < now) failures.delete(key);
}

export function sessionFromRequest(req) {
  cleanup();
  const sid = parseCookies(req.headers.cookie).cms_sid;
  const session = sid ? sessions.get(sid) : null;
  if (!session || session.expiresAt < Date.now()) return null;
  return { sid, ...session, secure: isSecure(req) };
}

export function requireSession(req, res) {
  const session = sessionFromRequest(req);
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: '登录状态已过期，请重新登录' }));
    return null;
  }
  return session;
}

export function createSession(res, req, username) {
  cleanup();
  const sid = crypto.randomBytes(24).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  sessions.set(sid, { username, csrf, expiresAt: Date.now() + SESSION_TTL });
  return { headers: { 'Set-Cookie': sessionCookie(sid, isSecure(req)) }, csrf };
}

export function destroySession(req, res) {
  const session = sessionFromRequest(req);
  if (session) sessions.delete(session.sid);
  return clearSessionCookie(isSecure(req));
}

export function csrfValid(req, session) {
  const token = req.headers['x-csrf-token'];
  return typeof token === 'string' && token.length === session.csrf.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(session.csrf));
}

export function refreshSession(sid) {
  const session = sessions.get(sid);
  if (session) session.expiresAt = Date.now() + SESSION_TTL;
}

export function verifyPassword(password) {
  const auth = getAuth();
  const candidate = crypto.scryptSync(String(password), auth.salt, 64);
  const expected = Buffer.from(auth.hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function loginAllowed(key) {
  cleanup();
  const record = failures.get(key) || { count: 0, resetAt: Date.now() + 10 * 60 * 1000 };
  return record.count < 8;
}

export function recordLoginFailure(key) {
  cleanup();
  const record = failures.get(key) || { count: 0, resetAt: Date.now() + 10 * 60 * 1000 };
  record.count += 1;
  failures.set(key, record);
}

export function clearLoginFailures(key) {
  failures.delete(key);
}

export function username() {
  return getAuth().username;
}
