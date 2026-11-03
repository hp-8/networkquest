// Google access. Calendar is read-only. Gmail reads only Boardy threads and sends only to Boardy.
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import path from 'node:path';
import { CLIENT_FILE, TOKEN_FILE, TOKENS_DIR } from './paths.js';

// gmail.metadata cannot search, so reading needs gmail.readonly. gmail.send can send but not read or delete.
export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
];
// Only the account that owns the Google Cloud project needs this, to receive Gmail's notifications.
export const PUBSUB_SCOPE = 'https://www.googleapis.com/auth/pubsub';

// The OAuth client: from GOOGLE_CLIENT_JSON when hosted (a "Web application" client), else the local file.
function loadClient() {
  let raw;
  if (process.env.GOOGLE_CLIENT_JSON) raw = JSON.parse(process.env.GOOGLE_CLIENT_JSON);
  else if (fs.existsSync(CLIENT_FILE)) raw = JSON.parse(fs.readFileSync(CLIENT_FILE, 'utf8'));
  else throw new Error(`Missing OAuth client. Download a "Desktop app" client JSON from Google Cloud and save it as:\n  ${CLIENT_FILE}`);
  const c = raw.installed || raw.web;
  return { id: c.client_id, secret: c.client_secret };
}

// ---- Browser sign-in for the hosted app (redirects back to the app instead of a local port) ----

export function pkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}

export function authUrl({ redirect, scopes, state, challenge, offline = false }) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: loadClient().id, redirect_uri: redirect, response_type: 'code', scope: scopes.join(' '),
    state, code_challenge: challenge, code_challenge_method: 'S256',
    ...(offline ? { access_type: 'offline', prompt: 'select_account consent' } : { prompt: 'select_account' }),
  });
  return url.toString();
}

export async function exchangeCode(code, redirect, verifier) {
  const client = loadClient();
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: client.id, client_secret: client.secret, code_verifier: verifier });
}

// Saves a freshly granted Gmail/Calendar token under the account's email; returns the email.
export async function connectAccount(tok) {
  if (!tok.refresh_token) throw new Error('Google did not return a refresh token. Remove NetworkQuest at myaccount.google.com/permissions and connect again.');
  const profile = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  }).then(r => r.json());
  const account = profile.emailAddress?.toLowerCase();
  if (!account) throw new Error('Could not read the account email address');
  saveToken(account, tok);
  return account;
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
}

export async function authorize({ pubsub = false } = {}) {
  const scopes = pubsub ? [...SCOPES, PUBSUB_SCOPE] : SCOPES;
  const client = loadClient();
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  // The tab only reports success after the token is exchanged and saved.
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/' || !u.searchParams.has('state')) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      try {
        if (u.searchParams.get('error')) throw new Error(`Google returned: ${u.searchParams.get('error')}`);
        if (u.searchParams.get('state') !== state) throw new Error('OAuth state mismatch');
        const tok = await tokenRequest({
          grant_type: 'authorization_code', code: u.searchParams.get('code'),
          redirect_uri: `http://127.0.0.1:${server.address().port}`,
          client_id: client.id, client_secret: client.secret, code_verifier: verifier,
        });
        const account = await connectAccount(tok);
        res.end(`NetworkQuest is connected to ${account}. You can close this tab.`);
        resolve(account);
      } catch (e) {
        res.end(`Sign-in failed: ${e.message}\nCheck the terminal and try again.`);
        reject(e);
      } finally {
        server.close();
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const redirect = `http://127.0.0.1:${server.address().port}`;
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: client.id, redirect_uri: redirect, response_type: 'code',
        scope: scopes.join(' '), access_type: 'offline', prompt: 'select_account consent',
        code_challenge: challenge, code_challenge_method: 'S256', state,
      });
      console.log(`Opening browser for Google sign-in. If it does not open, visit:\n${url}\n`);
      openBrowser(url.toString());
    });
  });
}

async function tokenRequest(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Token error: ${j.error_description || j.error}`);
  return j;
}

const tokenFile = account => path.join(TOKENS_DIR, `${account}.json`);

function saveToken(account, tok) {
  const file = tokenFile(account);
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const merged = { ...prev, ...tok, expires_at: Date.now() + (tok.expires_in - 60) * 1000 };
  fs.writeFileSync(file, JSON.stringify(merged, null, 2), { mode: 0o600 });
}

// Moves the old single token.json into tokens/<email>.json.
async function migrateLegacyToken() {
  if (!fs.existsSync(TOKEN_FILE)) return;
  const tok = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  const tmp = tokenFile('_legacy');
  fs.writeFileSync(tmp, JSON.stringify(tok));
  const profile = await get('https://gmail.googleapis.com/gmail/v1/users/me/profile', {}, '_legacy');
  fs.renameSync(tmp, tokenFile(profile.emailAddress.toLowerCase()));
  fs.unlinkSync(TOKEN_FILE);
}

export async function accounts() {
  await migrateLegacyToken();
  return fs.readdirSync(TOKENS_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => f.slice(0, -5));
}

export function disconnect(account) {
  if (fs.existsSync(tokenFile(account))) fs.unlinkSync(tokenFile(account));
}

async function accessToken(account) {
  const file = tokenFile(account);
  if (!fs.existsSync(file)) throw new Error(`${account} is not connected. Run: node src/cli.js auth`);
  const tok = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Date.now() < tok.expires_at) return tok.access_token;
  const client = loadClient();
  const fresh = await tokenRequest({
    grant_type: 'refresh_token', refresh_token: tok.refresh_token,
    client_id: client.id, client_secret: client.secret,
  });
  saveToken(account, fresh);
  return fresh.access_token;
}

async function get(url, params, account) {
  const u = new URL(url);
  // Arrays become repeated params (Gmail wants metadataHeaders=Subject&metadataHeaders=From).
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach(x => u.searchParams.append(k, x));
    else if (v !== undefined) u.searchParams.set(k, v);
  }
  const r = await fetch(u, { headers: { Authorization: `Bearer ${await accessToken(account)}` } });
  if (!r.ok) throw new Error(`Google API ${r.status} (${account}): ${await r.text()}`);
  return r.json();
}

async function post(url, body, account, { signal } = {}) {
  const r = await fetch(url, {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${await accessToken(account)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Google API ${r.status} (${account}): ${await r.text()}`);
  return r.json();
}

export function hasScope(account, scope) {
  const file = tokenFile(account);
  return fs.existsSync(file) && (JSON.parse(fs.readFileSync(file, 'utf8')).scope || '').split(' ').includes(scope);
}

// ---- Gmail push via Pub/Sub ----

// Asks Gmail to publish to the topic whenever this inbox changes. Lasts 7 days, so it is renewed on start and daily.
export async function watchInbox(account, topic) {
  return post('https://gmail.googleapis.com/gmail/v1/users/me/watch',
    { topicName: topic, labelIds: ['INBOX'], labelFilterBehavior: 'include' }, account); // { historyId, expiration }
}

// Messages added to the inbox since a history id: [{ id, threadId }].
export async function addedSince(account, startHistoryId) {
  const out = [];
  let pageToken;
  do {
    const j = await get('https://gmail.googleapis.com/gmail/v1/users/me/history',
      { startHistoryId, historyTypes: 'messageAdded', pageToken }, account);
    for (const h of j.history || []) for (const a of h.messagesAdded || []) out.push(a.message);
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}

export async function senderOf(account, messageId) {
  const m = await get(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
    { format: 'metadata', metadataHeaders: 'From' }, account);
  return addressOf(header(m, 'From'));
}

// Waits on the subscription until Google delivers messages (Pub/Sub holds the request open), then acks them.
export async function pullNotifications(account, subscription, signal) {
  const j = await post(`https://pubsub.googleapis.com/v1/${subscription}:pull`, { maxMessages: 20 }, account, { signal });
  const received = j.receivedMessages || [];
  if (received.length) {
    await post(`https://pubsub.googleapis.com/v1/${subscription}:acknowledge`, { ackIds: received.map(m => m.ackId) }, account);
  }
  return received.map(m => JSON.parse(Buffer.from(m.message.data, 'base64').toString('utf8'))); // { emailAddress, historyId }
}

// ---- Calendar ----

// Events from `back` days ago to `ahead` days out, so recent past meetings can be flagged for notes.
// Pages through results, so a multi-year look-back returns everything.
export async function eventsAround(account, { back = 14, ahead = 14 } = {}) {
  const now = Date.now();
  const items = [];
  let pageToken;
  do {
    const j = await get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      timeMin: new Date(now - back * 86400000).toISOString(), timeMax: new Date(now + ahead * 86400000).toISOString(),
      singleEvents: 'true', orderBy: 'startTime', maxResults: '250', pageToken,
    }, account);
    items.push(...(j.items || []));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return items.filter(e => e.status !== 'cancelled');
}

// `mine` holds all connected accounts, so your other address never shows up as a contact.
export function otherAttendees(event, mine = []) {
  return (event.attendees || [])
    .filter(a => !a.self && !a.resource && a.responseStatus !== 'declined' && a.email && !mine.includes(a.email.toLowerCase()))
    .map(a => ({ email: a.email.toLowerCase(), name: a.displayName || null }));
}

// ---- Gmail ----

const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com',
  'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'live.com', 'aol.com']);

export function companyDomain(email) {
  const d = email.split('@')[1];
  return d && !FREE_MAIL.has(d) ? d : null;
}

function header(msg, name) {
  return msg.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function plainText(part) {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf8');
  }
  for (const p of part.parts || []) {
    const t = plainText(p);
    if (t) return t;
  }
  return '';
}

// Drop quoted replies so each message contributes only what was newly said.
function stripQuoted(text) {
  const lines = text.split(/\r?\n/);
  const cut = lines.findIndex(l => /^On .+wrote:$/.test(l.trim()) || /^-{2,}\s*Original Message/i.test(l));
  return (cut >= 0 ? lines.slice(0, cut) : lines).filter(l => !l.startsWith('>')).join('\n').trim();
}

function addressOf(from) {
  return (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();
}

// Finds Boardy's sending address from your inbox, so it does not have to be hard-coded.
// Only accepts a sender whose address is actually at boardy.ai, not anything that merely mentions Boardy.
export async function detectBoardyAddress(account) {
  const list = await get('https://gmail.googleapis.com/gmail/v1/users/me/messages', { q: 'from:boardy.ai', maxResults: '5' }, account);
  for (const { id } of list.messages || []) {
    const m = await get(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`, { format: 'metadata', metadataHeaders: 'From' }, account);
    const from = addressOf(header(m, 'From'));
    if (from.endsWith('@boardy.ai')) return from;
  }
  return null;
}

// Every Gmail read goes through here and is pinned to the Boardy address.
export async function boardyThreads(account, boardy, { mentioning = null, max = 10 } = {}) {
  if (!boardy) throw new Error('Boardy address not set');
  const terms = mentioning?.filter(Boolean).map(t => `"${t.replace(/"/g, '')}"`);
  const q = `(from:${boardy} OR to:${boardy})` + (terms?.length ? ` (${terms.join(' OR ')})` : '');
  return threads(account, q, max);
}

async function threads(account, q, max) {
  const list = await get('https://gmail.googleapis.com/gmail/v1/users/me/threads', { q, maxResults: String(max) }, account);
  const out = [];
  for (const t of list.threads || []) out.push(await thread(account, t.id));
  return out;
}

// One thread by id. Used to check a specific "Ask Boardy" thread for a reply.
export async function thread(account, id) {
  const full = await get(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}`, { format: 'full' }, account);
  const messages = (full.messages || []).map(m => ({
    from: header(m, 'From'),
    fromAddress: addressOf(header(m, 'From')),
    messageId: header(m, 'Message-ID'), // needed to reply in the same thread
    date: new Date(Number(m.internalDate)).toISOString(),
    // Boardy's answers run long; 1500 characters cut off its later sections.
    text: stripQuoted(plainText(m.payload) || m.snippet || '').slice(0, 10000),
  }));
  return {
    id,
    subject: header(full.messages?.[0] || {}, 'Subject') || '(no subject)',
    last_date: messages.at(-1)?.date,
    messages,
  };
}

// The inbox list for the Boardy tab: light metadata only, so it loads quickly. Full text is fetched on open.
export async function boardyThreadList(account, boardy, max = 25) {
  const list = await get('https://gmail.googleapis.com/gmail/v1/users/me/threads',
    { q: `from:${boardy} OR to:${boardy}`, maxResults: String(max) }, account);
  const out = [];
  for (const t of list.threads || []) {
    const j = await get(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}`,
      { format: 'metadata', metadataHeaders: ['Subject', 'From'] }, account);
    const msgs = j.messages || [];
    const last = msgs.at(-1) || {};
    out.push({
      inbox: account, id: t.id,
      subject: header(msgs[0] || {}, 'Subject') || '(no subject)',
      snippet: (last.snippet || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
      lastFrom: addressOf(header(last, 'From')),
      date: new Date(Number(last.internalDate || 0)).toISOString(),
      count: msgs.length,
    });
  }
  return out;
}

// The only write. The recipient is always the stored Boardy address; callers cannot choose it.
// With `threadId` + `inReplyTo` the message is a reply in that existing thread.
export async function sendToBoardy(account, boardy, subject, text, { threadId, inReplyTo } = {}) {
  if (!boardy) throw new Error('Boardy address not set');
  if (!account) throw new Error('No sending account chosen');
  const mime = [
    `To: ${boardy}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text).toString('base64'),
  ].join('\r\n');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(account)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(mime).toString('base64url'), ...(threadId ? { threadId } : {}) }),
  });
  if (!r.ok) throw new Error(`Gmail send ${r.status}: ${await r.text()}`);
  return r.json(); // { id, threadId }
}
