// "Ask Boardy about everyone", in two emails:
//   1. roster:  Boardy lists every person it introduced you to and you met; each becomes a person here.
//   2. details: one email about all of them; the reply is split back into each person's brief.
import { sendToBoardy, thread, companyDomain } from './google.js';
import { isBoardy } from './live.js';
import { fillBrief, linkedinFrom, PROFILE_FIELDS } from './server.js';
import * as db from './db.js';

const ms = s => Date.parse(s);
const marker = email => `=== ${email} ===`;

// People Boardy lists without an email get a stand-in address, so they still have a record and a brief.
const NO_EMAIL = '@no-email.boardy';
export const hasRealEmail = email => !email.endsWith(NO_EMAIL);
const who = p => (p.name ? (hasRealEmail(p.email) ? `${p.name} (${p.email})` : p.name) : p.email);

async function latestReply(pending) {
  const t = await thread(pending.inbox, pending.threadId);
  return { t, replies: t.messages.filter(m => isBoardy(m.fromAddress) && ms(m.date) > ms(pending.sentAt)) };
}

// ---- 1. roster ----

export function rosterDraft() {
  return {
    subject: 'Everyone you have introduced me to',
    text: [
      'Hi Boardy,',
      '',
      "Could you send me a list of every person you've introduced me to that I've actually met, going back to the start?",
      '',
      'One person per line, in this format:',
      'Name | email | date we met (YYYY-MM-DD) | LinkedIn profile link',
      '',
      'Leave a field blank if you don\'t have it, but keep the | separators.',
      '',
      'Thanks!',
    ].join('\n'),
  };
}

export async function sendRoster(subject, text) {
  const from = db.setting('send_from');
  const sent = await sendToBoardy(from, db.setting('boardy'), subject, text);
  db.setting('roster', JSON.stringify({ inbox: from, threadId: sent.threadId, sentAt: new Date().toISOString(), done: false }));
}

export const rosterState = () => JSON.parse(db.setting('roster') || 'null');

// Reads lines like "Jane Doe | jane@x.com | 2026-03-04 | linkedin.com/in/jane". Lenient about missing fields and bullets.
export function parseRoster(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim();
    if (!line.includes('|')) continue;
    const parts = line.split('|').map(s => s.trim());
    if (/^name$/i.test(parts[0])) continue; // echoed header row
    const email = (line.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0]?.toLowerCase() || null;
    const date = (line.match(/\b(20\d{2}-\d{2}-\d{2})\b/) || [])[1] || null;
    const name = parts[0] && !parts[0].includes('@') ? parts[0] : null;
    if (!name && !email) continue;
    if (email && isBoardy(email)) continue;
    out.push({ name, email, date, linkedin: linkedinFrom(line) });
  }
  return out;
}

// Returns null while waiting, otherwise { added, updated } counts. Each person gets a meeting dated when you met,
// unless the calendar already has one.
export async function collectRoster() {
  const pending = rosterState();
  if (!pending || pending.done) return null;
  const { replies } = await latestReply(pending);
  if (!replies.length) return null;
  const rows = replies.flatMap(m => parseRoster(m.text));
  let added = 0, updated = 0;
  const known = db.listPeople();
  for (const r of rows) {
    // Match by email first, then by name, so a person from the calendar isn't duplicated.
    const match = (r.email && known.find(p => p.email === r.email))
      || (r.name && known.find(p => p.name && p.name.toLowerCase() === r.name.toLowerCase()));
    const email = match?.email || r.email || `${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')}${NO_EMAIL}`;
    match ? updated++ : added++;
    db.upsertPerson({ email, name: r.name, company: r.email ? companyDomain(r.email) : null });
    if (r.linkedin) db.setLinkedin(email, r.linkedin);
    const hasMeeting = db.getPerson(email).entries.some(e => e.kind === 'meeting');
    if (!hasMeeting) {
      // No date from Boardy means no date here: a made-up one would show up as a recent meeting.
      db.putEntry({
        email, kind: 'meeting', ref_id: `roster-${email}`,
        occurred_at: r.date ? `${r.date}T12:00:00Z` : null,
        title: r.date ? 'Boardy intro' : 'Met through Boardy (date not on record)',
      });
    }
  }
  db.setting('roster', JSON.stringify({ ...pending, done: true, count: rows.length }));
  return { added, updated, total: rows.length };
}

// ---- 2. details ----

// Every person with at least one meeting that has already happened (or has no date), and their latest such meeting.
export function pastMeetings() {
  const now = Date.now();
  const when = e => (e.occurred_at ? ms(e.occurred_at) : 0); // undated meetings sort first
  const out = [];
  for (const p of db.listPeople()) {
    const last = db.getPerson(p.email).entries
      .filter(e => e.kind === 'meeting' && (!e.occurred_at || ms(e.occurred_at) < now))
      .sort((a, b) => when(a) - when(b)).at(-1);
    if (last) out.push({ email: p.email, name: p.name, eventRef: last.ref_id, title: last.title, at: last.occurred_at });
  }
  return out.sort((a, b) => (a.at ? ms(a.at) : 0) - (b.at ? ms(b.at) : 0));
}

export function draft(people) {
  return {
    subject: `Notes on ${people.length} of my Boardy intros`,
    text: [
      'Hi Boardy,',
      '',
      `Could you send me notes on each of the ${people.length} people you've introduced me to and I've already met, including each person's LinkedIn profile link?`,
      '',
      // Dates taken from an intro email aren't confirmed meetings, so say so.
      ...people.map(p => `- ${who(p)}${p.at ? `: ${/^Introduced by Boardy/.test(p.title || '') ? 'introduced' : 'met'} ${p.at.slice(0, 10)}` : ''}`),
      '',
      'Please start each person with a line like this, using their email exactly (or their name if you have no email):',
      marker('their@email.com'),
      '',
      'and under it use these headings, each on its own line. Leave out any heading you have nothing for:',
      '',
      ...PROFILE_FIELDS.map(f => `${f.heading}:`),
      '',
      'Thanks!',
    ].join('\n'),
  };
}

export async function send(people, subject, text) {
  const from = db.setting('send_from');
  const boardy = db.setting('boardy');
  const sent = await sendToBoardy(from, boardy, subject, text);
  // Every multi-person thread is remembered, so Sync never files an old one whole under one person.
  const prev = JSON.parse(db.setting('askall') || 'null');
  const history = JSON.parse(db.setting('shared_threads') || '[]');
  db.setting('shared_threads', JSON.stringify([...new Set([...history, prev?.threadId, sent.threadId].filter(Boolean))]));
  // Saved so the reply can be picked up later, by Sync, a live notification, or `ask-all collect`.
  db.setting('askall', JSON.stringify({ inbox: from, threadId: sent.threadId, sentAt: new Date().toISOString(), people, done: false }));
  for (const p of people) {
    db.putEntry({ email: p.email, kind: 'sent', ref_id: `askall-${sent.threadId}`, occurred_at: new Date().toISOString(), title: subject, body: text });
  }
  return { from, boardy };
}

// Splits Boardy's reply into one chunk per person. Uses our "=== email ===" markers; if Boardy dropped them,
// falls back to any line that names the person by email or full name.
export function split(text, people) {
  const lines = text.split(/\r?\n/);
  const starts = [];
  lines.forEach((line, i) => {
    const l = line.toLowerCase();
    const found = people.find(p => hasRealEmail(p.email) && l.includes(p.email.toLowerCase()))
      || people.find(p => p.name && l.includes(p.name.toLowerCase()) && line.trim().length < p.name.length + 25
        && (p.name.includes(' ') || /^\W*(===|\*\*|#)/.test(line)));
    if (found && !starts.some(s => s.p === found)) starts.push({ i, p: found });
  });
  return starts.map((s, k) => ({ person: s.p, text: lines.slice(s.i + 1, starts[k + 1]?.i ?? lines.length).join('\n').trim() }))
    .filter(c => c.text);
}

// Returns null while still waiting, otherwise { matched, missing } with people's emails.
// `force` re-reads a reply that was already collected (used to rebuild briefs).
export async function collect({ force = false } = {}) {
  const pending = JSON.parse(db.setting('askall') || 'null');
  if (!pending || (pending.done && !force)) return null;
  const { t, replies } = await latestReply(pending);
  if (!replies.length) return null;

  // Boardy may answer across several messages; read them all, latest last so it wins.
  const matched = new Set();
  for (const m of replies) {
    for (const c of split(m.text, pending.people)) {
      db.putEntry({
        email: c.person.email, kind: 'boardy', ref_id: `${pending.inbox}:${t.id}`,
        occurred_at: m.date, title: t.subject, body: `${m.date.slice(0, 10)} ${m.from}:\n${c.text}`,
      });
      fillBrief(c.person.email, { messages: [{ ...m, text: c.text }] }, { eventRef: c.person.eventRef, isAnswer: true });
      matched.add(c.person.email);
    }
  }
  db.setting('askall', JSON.stringify({ ...pending, done: true }));
  return { matched: [...matched], missing: pending.people.map(p => p.email).filter(e => !matched.has(e)) };
}
