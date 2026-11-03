// All private state lives outside the project folder so the repo can be shared safely.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const base = process.env.NQ_HOME
  || (process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'networkquest')
    : path.join(os.homedir(), '.networkquest'));

fs.mkdirSync(base, { recursive: true });

export const HOME = base;
export const CLIENT_FILE = path.join(base, 'client_secret.json'); // OAuth Desktop client from Google Cloud
export const TOKEN_FILE = path.join(base, 'token.json'); // legacy single-account token, migrated on first use
export const TOKENS_DIR = path.join(base, 'tokens');      // one <email>.json per connected Google account
fs.mkdirSync(TOKENS_DIR, { recursive: true });
export const DB_FILE = path.join(base, 'network.db');

// Hosted mode. Set NQ_PUBLIC_URL (e.g. https://networkquest.fly.dev) and the app listens publicly,
// requires Google sign-in, and only lets in NQ_ALLOWED_EMAILS. Unset = the local, 127.0.0.1-only app.
export const PUBLIC_URL = (process.env.NQ_PUBLIC_URL || '').replace(/\/$/, '');
export const ALLOWED_EMAILS = (process.env.NQ_ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
export const SESSION_SECRET = process.env.NQ_SESSION_SECRET || '';
if (PUBLIC_URL && (!ALLOWED_EMAILS.length || SESSION_SECRET.length < 32)) {
  throw new Error('Hosted mode needs NQ_ALLOWED_EMAILS and an NQ_SESSION_SECRET of at least 32 characters.');
}
