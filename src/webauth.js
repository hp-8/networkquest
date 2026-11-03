// Hosted mode only: Google sign-in in front of the whole app, limited to NQ_ALLOWED_EMAILS,
// plus browser-based "connect a Google account" for Gmail/Calendar (replaces the local `auth` command).
import crypto from 'node:crypto';
import { PUBLIC_URL, ALLOWED_EMAILS, SESSION_SECRET } from './paths.js';
import { SCOPES, PUBSUB_SCOPE, pkce, authUrl, exchangeCode, connectAccount } from './google.js';

const SESSION_DAYS = 30;
const LOGIN_REDIRECT = `${PUBLIC_URL}/oauth/login`;
const CONNECT_REDIRECT = `${PUBLIC_URL}/oauth/connect`;

// ---- signed cookies (HMAC), so they can't be forged or edited ----

const sign = v => crypto.createHmac('sha256', SESSION_SECRET).update(v).digest('base64url');
function seal(obj) {
  const v = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${v}.${sign(v)}`;
}
function unseal(token) {
  const [v, mac] = String(token || '').split('.');
  if (!v || !mac) return null;
  const expected = sign(v);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  const obj = JSON.parse(Buffer.from(v, 'base64url').toString());
  return obj.exp > Date.now() ? obj : null;
}
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map(c => {
  const i = c.indexOf('=');
  return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
}));
const setCookie = (name, value, maxAgeSec) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;

export function sessionEmail(req) {
  return unseal(cookies(req).nq_session)?.email || null;
}

function redirect(res, to, extraCookies = []) {
  res.writeHead(302, { Location: to, 'Set-Cookie': extraCookies });
  res.end();
}

function page(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>NetworkQuest</title>
<body style="font:15px system-ui;display:grid;place-items:center;min-height:90vh;background:#f3f1ec;color:#23221f">
<div style="text-align:center;max-width:420px">${text}</div></body>`);
}

// Starts a Google round-trip: remembers state + PKCE verifier in a short-lived signed cookie.
function startOAuth(res, { redirectUri, scopes, offline, kind }) {
  const { verifier, challenge } = pkce();
  const state = crypto.randomBytes(16).toString('hex');
  const flow = seal({ state, verifier, kind, exp: Date.now() + 10 * 60000 });
  redirect(res, authUrl({ redirect: redirectUri, scopes, state, challenge, offline }), [setCookie('nq_oauth', flow, 600)]);
}

function finishOAuth(req, url, kind) {
  const flow = unseal(cookies(req).nq_oauth);
  if (url.searchParams.get('error')) throw new Error(`Google returned: ${url.searchParams.get('error')}`);
  if (!flow || flow.kind !== kind || flow.state !== url.searchParams.get('state')) throw new Error('Sign-in expired or was tampered with. Please try again.');
  return flow;
}

// Handles /login, /logout and the OAuth callbacks, and blocks everything else until signed in.
// Returns true when it has answered the request itself.
export async function guard(req, res, url, { onConnected }) {
  const p = url.pathname;
  const clearFlow = setCookie('nq_oauth', '', 0);

  if (p === '/login') {
    startOAuth(res, { redirectUri: LOGIN_REDIRECT, scopes: ['openid', 'email'], offline: false, kind: 'login' });
    return true;
  }
  if (p === '/oauth/login') {
    try {
      const flow = finishOAuth(req, url, 'login');
      const tok = await exchangeCode(url.searchParams.get('code'), LOGIN_REDIRECT, flow.verifier);
      // The ID token comes straight from Google's token endpoint over TLS, so its claims can be read directly.
      const claims = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString());
      const email = String(claims.email || '').toLowerCase();
      if (!claims.email_verified || !ALLOWED_EMAILS.includes(email)) {
        page(res, 403, `<h2>Not allowed</h2><p>${email ? email + ' is' : 'This account is'} not on this app's allowed list.</p><p><a href="/login">Try another account</a></p>`);
        return true;
      }
      redirect(res, '/', [clearFlow, setCookie('nq_session', seal({ email, exp: Date.now() + SESSION_DAYS * 86400000 }), SESSION_DAYS * 86400)]);
    } catch (e) {
      page(res, 400, `<h2>Sign-in failed</h2><p>${String(e.message).replace(/</g, '&lt;')}</p><p><a href="/login">Try again</a></p>`);
    }
    return true;
  }
  if (p === '/logout') {
    redirect(res, '/login', [setCookie('nq_session', '', 0)]);
    return true;
  }

  // Everything below needs a signed-in, allowed user.
  const email = sessionEmail(req);
  if (!email || !ALLOWED_EMAILS.includes(email)) {
    if (p.startsWith('/api/')) { res.writeHead(401); res.end(); } else redirect(res, '/login');
    return true;
  }

  // Connect a Gmail/Calendar account from the browser. ?pubsub=1 also grants live notifications.
  if (p === '/connect') {
    const scopes = url.searchParams.get('pubsub') ? [...SCOPES, PUBSUB_SCOPE] : SCOPES;
    startOAuth(res, { redirectUri: CONNECT_REDIRECT, scopes, offline: true, kind: 'connect' });
    return true;
  }
  if (p === '/oauth/connect') {
    try {
      const flow = finishOAuth(req, url, 'connect');
      const account = await connectAccount(await exchangeCode(url.searchParams.get('code'), CONNECT_REDIRECT, flow.verifier));
      await onConnected(account);
      redirect(res, '/?connected=' + encodeURIComponent(account), [clearFlow]);
    } catch (e) {
      page(res, 400, `<h2>Couldn't connect that account</h2><p>${String(e.message).replace(/</g, '&lt;')}</p><p><a href="/">Back to NetworkQuest</a></p>`);
    }
    return true;
  }
  return false;
}
