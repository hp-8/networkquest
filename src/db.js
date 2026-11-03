// One record per person; every meeting, Boardy thread, goal, note and sent email hangs off it.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { DB_FILE } from './paths.js';

const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS people (
    email      TEXT PRIMARY KEY,
    name       TEXT,
    company    TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS entries (
    id          INTEGER PRIMARY KEY,
    email       TEXT NOT NULL REFERENCES people(email) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    ref_id      TEXT,
    occurred_at TEXT,
    title       TEXT,
    body        TEXT,
    learned     TEXT,
    value       TEXT,
    next_step   TEXT,
    done        INTEGER DEFAULT 0,
    UNIQUE (email, kind, ref_id)
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`);
// Columns added after v0.1:
//   unread    - Boardy emails or briefs you haven't looked at yet
//   source    - for briefs: 'boardy' (filled from email, may be refreshed) or 'manual' (pasted or edited by you, never overwritten)
//   event_ref - for notes and asks: the meeting they belong to, if any
const cols = db.prepare('PRAGMA table_info(entries)').all().map(c => c.name);
//   source_at - for briefs: when Boardy sent the message the brief was taken from
for (const [name, type] of [['unread', 'INTEGER DEFAULT 0'], ['source', 'TEXT'], ['event_ref', 'TEXT'], ['source_at', 'TEXT']]) {
  if (!cols.includes(name)) db.exec(`ALTER TABLE entries ADD COLUMN ${name} ${type}`);
}

// One-time move to "one list of my notes per person": old per-meeting notes keep their meeting tag and fold
// "learned" and "value each way" into the note text; old personal notes become ordinary notes.
db.exec(`
  UPDATE entries SET
    event_ref = COALESCE(event_ref, ref_id),
    body = TRIM(
      COALESCE(CASE WHEN COALESCE(learned, '') <> '' THEN 'What I learned: ' || learned || char(10) || char(10) END, '') ||
      COALESCE(CASE WHEN COALESCE(value, '') <> '' THEN 'Value each way: ' || value || char(10) || char(10) END, '') ||
      COALESCE(body, '')),
    ref_id = 'note-' || id, learned = NULL, value = NULL
  WHERE kind = 'note' AND ref_id NOT LIKE 'note-%';
  UPDATE entries SET kind = 'note' WHERE kind = 'personal';
`);

export function setting(key, value) {
  if (value === undefined) return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

// Added later: the person's LinkedIn profile URL (from Boardy, or set by hand in the UI).
if (!db.prepare('PRAGMA table_info(people)').all().some(c => c.name === 'linkedin')) {
  db.exec('ALTER TABLE people ADD COLUMN linkedin TEXT');
}

// Current job title and company, as Boardy describes it ("Head of Engineering at Clover Labs").
if (!db.prepare('PRAGMA table_info(people)').all().some(c => c.name === 'title')) {
  db.exec('ALTER TABLE people ADD COLUMN title TEXT');
}

// Opportunities (roles, projects, events) mentioned for a person. One per line of Boardy's OPPORTUNITIES
// section, or added by hand. The ref is a hash of the text, so the same line from Boardy is never added twice
// and re-reading a reply keeps your done ticks.
export function addOpportunities(email, text, source = 'boardy') {
  const lines = String(text || '').split(/\r?\n|(?:^|\s)[•·]\s/)
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(l => l.length > 3 && !/^(none|n\/a|nothing)\b/i.test(l));
  for (const body of lines) {
    const ref = 'opp-' + createHash('sha1').update(body.toLowerCase()).digest('hex').slice(0, 12);
    if (getEntry(email, 'opp', ref)) continue;
    putEntry({ email, kind: 'opp', ref_id: ref, occurred_at: new Date().toISOString(), title: source, body });
  }
  return lines.length;
}

export function setTitle(email, title) {
  db.prepare("UPDATE people SET title = ?, updated_at = datetime('now') WHERE email = ?").run(title || null, email);
}

export function setLinkedin(email, url) {
  db.prepare("UPDATE people SET linkedin = ?, updated_at = datetime('now') WHERE email = ?").run(url || null, email);
}

export function upsertPerson({ email, name, company }) {
  db.prepare(`
    INSERT INTO people (email, name, company) VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      -- Keep a name once we have one: re-syncs only guess from titles ("Mohamed"), Boardy's list has the full name.
      name = COALESCE(people.name, excluded.name),
      company = COALESCE(excluded.company, people.company),
      updated_at = datetime('now')
  `).run(email, name ?? null, company ?? null);
}

const FIELDS = ['occurred_at', 'title', 'body', 'learned', 'value', 'next_step', 'done', 'unread', 'source', 'event_ref', 'source_at'];

// ref_id makes re-syncing idempotent: the same meeting or thread updates in place.
// Only the fields passed are written, so a calendar re-sync never wipes your notes.
export function putEntry({ email, kind, ref_id = null, ...rest }) {
  const cols = FIELDS.filter(f => rest[f] !== undefined);
  const vals = cols.map(f => rest[f]);
  const ref = ref_id ?? `${kind}-${Date.now()}`;
  const update = cols.length ? cols.map(c => `${c} = excluded.${c}`).join(', ') : 'kind = excluded.kind';
  db.prepare(`
    INSERT INTO entries (email, kind, ref_id${cols.map(c => `, ${c}`).join('')})
    VALUES (?, ?, ?${cols.map(() => ', ?').join('')})
    ON CONFLICT(email, kind, ref_id) DO UPDATE SET ${update}
  `).run(email, kind, ref, ...vals);
}

export function getEntry(email, kind, ref_id) {
  return db.prepare('SELECT * FROM entries WHERE email = ? AND kind = ? AND ref_id = ?').get(email, kind, ref_id) ?? null;
}

export function getPerson(email) {
  const person = db.prepare('SELECT * FROM people WHERE email = ?').get(email);
  if (!person) return null;
  const entries = db.prepare('SELECT * FROM entries WHERE email = ? ORDER BY occurred_at').all(email);
  return { ...person, entries };
}

export function listPeople() {
  return db.prepare(`
    SELECT p.email, p.name, p.company, p.title,
      MAX(CASE WHEN e.kind = 'meeting' THEN e.occurred_at END) AS last_meeting,
      SUM(e.kind = 'meeting') AS meetings,
      SUM(e.kind = 'note') AS notes
    FROM people p LEFT JOIN entries e ON e.email = p.email
    GROUP BY p.email ORDER BY last_meeting IS NULL, last_meeting DESC, p.name
  `).all();
}

export function openNextSteps() {
  return db.prepare(`
    SELECT e.id, e.email, p.name, e.next_step, e.occurred_at, e.done FROM entries e JOIN people p ON p.email = e.email
    WHERE e.kind = 'note' AND COALESCE(e.next_step, '') <> '' ORDER BY e.done, e.occurred_at DESC
  `).all();
}

export function openAsks() {
  return db.prepare("SELECT * FROM entries WHERE kind = 'ask' AND done = 0 AND ref_id LIKE 'ask-thread-%'").all();
}

export function unreadByPerson() {
  return Object.fromEntries(db.prepare("SELECT email, COUNT(*) n FROM entries WHERE unread = 1 GROUP BY email").all().map(r => [r.email, Number(r.n)]));
}

export function markRead(email) {
  db.prepare('UPDATE entries SET unread = 0 WHERE email = ?').run(email);
}

export function getEntryById(id) {
  return db.prepare('SELECT * FROM entries WHERE id = ?').get(id) ?? null;
}

export function updateNote(id, { body, next_step, event_ref }) {
  db.prepare("UPDATE entries SET body = ?, next_step = ?, event_ref = ? WHERE id = ? AND kind = 'note'")
    .run(body, next_step || null, event_ref || null, id);
}

export function deleteEntry(id, kinds) {
  db.prepare(`DELETE FROM entries WHERE id = ? AND kind IN (${kinds.map(() => '?').join(',')})`).run(id, ...kinds);
}

export function setDone(id, done) {
  db.prepare('UPDATE entries SET done = ? WHERE id = ?').run(done ? 1 : 0, id);
}

export function forgetPerson(email) {
  return db.prepare('DELETE FROM people WHERE email = ?').run(email).changes > 0;
}
