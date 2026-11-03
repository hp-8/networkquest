// Local-only UI server. Binds to 127.0.0.1 and rejects cross-site requests.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { accounts, eventsAround, otherAttendees, companyDomain, boardyThreads, boardyThreadList, detectBoardyAddress, sendToBoardy, thread } from './google.js';
import { startLive, isBoardy } from './live.js';
import { guard } from './webauth.js';
import { PUBLIC_URL } from './paths.js';
import { collect as collectAskAll, collectRoster } from './askall.js';
import { collectRequests, autoPrep, goingQuiet, requestPrep, requestFollowups, prepRequested, pendingFollow } from './requests.js';
import * as db from './db.js';

const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'index.html');

// Open pages subscribe here (Server-Sent Events) and reload when a Boardy email arrives.
const listeners = new Set();
function broadcast(event) {
  for (const res of listeners) res.write(`data: ${JSON.stringify(event)}\n\n`);
}

const threadBody = t => t.messages.map(m => `${m.date.slice(0, 10)} ${m.from}:\n${m.text}`).join('\n\n');

// Boardy threads are kept per person as source material (collapsed in the UI).
// Separately, a Boardy message that reads like a recap fills that meeting's brief.
export function storeBoardyThread(email, inbox, t, { eventRef = null, isAnswer = false } = {}) {
  const ref_id = `${inbox}:${t.id}`;
  db.putEntry({ email, kind: 'boardy', ref_id, occurred_at: t.last_date, title: t.subject, body: threadBody(t) });
  fillBrief(email, t, { eventRef, isAnswer });
}

// The brief is one per meeting. It takes Boardy's latest message after the meeting started, if that message is an
// answer to Ask Boardy, uses the headings, or is long enough to be a recap (short "how did it go?" nudges are skipped).
// A brief you pasted or edited yourself is never overwritten.
// Calendar times carry an offset ("...-04:00") and Gmail's are UTC ("...Z"), so compare as dates, never as strings.
const ms = s => Date.parse(s);

export function fillBrief(email, t, { eventRef, isAnswer }) {
  const meetings = db.getPerson(email).entries.filter(e => e.kind === 'meeting').sort((a, b) => ms(a.occurred_at) - ms(b.occurred_at));
  const boardyMsgs = t.messages.filter(m => isBoardy(m.fromAddress));
  for (const m of boardyMsgs.reverse()) {
    const meeting = eventRef
      ? meetings.find(e => e.ref_id === eventRef)
      : meetings.filter(e => ms(e.occurred_at) <= ms(m.date)).at(-1);
    if (!meeting || ms(m.date) < ms(meeting.occurred_at)) continue;
    // A reply covering several people ("=== a@x ===", "=== b@y ===") is never one person's brief, whichever
    // thread it arrives in. askall.js splits those per person and passes only that person's part here.
    if ((m.text.match(/^\s*===\s*.+?\s*===\s*$/gm) || []).length >= 2) continue;
    const fields = parseProfile(m.text);
    // A reply that uses our headings is an answer even when the Ask predates thread tracking.
    if (!isAnswer && !fields && m.text.length < 300) continue;
    // Only a LINKEDIN heading counts: intro emails often carry both people's links, including yours.
    const linkedin = linkedinFrom(fields?.linkedin);
    if (linkedin) db.setLinkedin(email, linkedin);
    // Current role is kept on the person (shown under their name and on their card), not as a brief section.
    const title = fields?.title?.split('\n')[0].replace(/^[-*\s]+/, '').trim();
    if (title && title.length <= 120) db.setTitle(email, title);
    if (fields?.opps) db.addOpportunities(email, fields.opps, 'boardy');
    const prev = db.getEntry(email, 'brief', meeting.ref_id);
    if (prev?.source === 'manual') return;
    const body = fields
      ? PROFILE_FIELDS.filter(f => fields[f.key] && !f.link).map(f => `${f.label}: ${fields[f.key]}`).join('\n\n')
      : m.text;
    // Threads arrive in any order, so keep the best message: one using our headings beats free text,
    // and between two of the same kind the newer one wins.
    if (prev) {
      const prevStructured = PROFILE_FIELDS.filter(f => !f.link && prev.body.includes(`${f.label}:`)).length >= 2;
      // ">=": the same message re-read (e.g. with more of its text) still updates the brief.
      const better = (!!fields !== prevStructured) ? !!fields : ms(m.date) >= ms(prev.source_at || 0);
      if (!better || prev.body === body) return;
    }
    db.putEntry({
      email, kind: 'brief', ref_id: meeting.ref_id, occurred_at: meeting.occurred_at, title: meeting.title,
      body, source: 'boardy', source_at: m.date, unread: 1,
    });
    return;
  }
}

// Each "Ask Boardy" email remembers its Gmail thread; a later message from Boardy in it is the answer.
async function checkAsks() {
  let replies = 0;
  for (const ask of db.openAsks()) {
    const [inbox, threadId] = ask.ref_id.replace('ask-thread-', '').split('|');
    const t = await thread(inbox, threadId);
    if (!t.messages.some(m => isBoardy(m.fromAddress) && ms(m.date) > ms(ask.occurred_at))) continue;
    storeBoardyThread(ask.email, inbox, t, { eventRef: ask.event_ref, isAnswer: true });
    db.putEntry({ email: ask.email, kind: 'ask', ref_id: ask.ref_id, done: 1 });
    replies++;
  }
  // The one-off emails from `node src/cli.js ask-all`: first Boardy's list of people, then details on all of them.
  const roster = await collectRoster();
  if (roster) console.log(`Boardy sent its list: ${roster.added} new people, ${roster.updated} already known. Run "node src/cli.js ask-all" for details on everyone.`);
  // Prep notes, follow-up ideas and reconnect picks (requests.js).
  replies += await collectRequests();
  const all = await collectAskAll();
  if (all) {
    replies += all.matched.length;
    console.log(`Boardy answered the ask-all email: ${all.matched.length} people filled${all.missing.length ? `, not found in the reply: ${all.missing.join(', ')}` : ''}.`);
  }
  return replies;
}

// Boardy titles look like "Boardy Intro: Alex + Sam" or "Alex Rivera and Sam Lee — Intro Call".
// Pick the name in the title that matches the attendee's email, e.g. "Peter Kuperman" for pkuperman@.
function nameFromTitle(title = '', email) {
  const local = email.split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
  const core = title.replace(/^[^:]*:\s*/, '').replace(/\s+[—–-]\s+.*$/, '');
  const parts = core.split(/\s+(?:\+|&|and|x)\s+/i).map(s => s.trim()).filter(Boolean);
  return parts.find(p => p.split(/\s+/).some(w => w.length >= 3 && local.includes(w.toLowerCase().replace(/[^a-z]/g, '')))) || null;
}

// `back` = days of calendar history to read; the UI uses 14, `ask-all` reaches back years.
// `boardyOnly` keeps just events Boardy is on, so a long look-back doesn't import every class and appointment.
export async function sync({ back = 14, boardyOnly = false } = {}) {
  const mine = await accounts();
  if (!mine.length) throw new Error('No Google account connected. Run: node src/cli.js auth');

  // The account Boardy actually emails is the one notes are sent from.
  let boardy = db.setting('boardy');
  let sendFrom = db.setting('send_from');
  if (!sendFrom || !mine.includes(sendFrom)) {
    for (const acc of mine) {
      const found = await detectBoardyAddress(acc);
      if (found) { boardy = boardy || found; sendFrom = acc; break; }
    }
    if (boardy) db.setting('boardy', boardy);
    if (sendFrom) db.setting('send_from', sendFrom);
  }

  // Boardy sits on every invite it books; it is the matchmaker, not a contact.
  const people = ev => otherAttendees(ev, mine).filter(a => !a.email.endsWith('@boardy.ai') && a.email !== boardy);

  let meetings = 0;
  for (const acc of mine) {
    const byBoardy = e => [...(e.attendees || []), e.organizer || {}, e.creator || {}].some(a => isBoardy((a.email || '').toLowerCase()));
    const events = (await eventsAround(acc, { back })).filter(e => people(e).length && (!boardyOnly || byBoardy(e)));
    meetings += events.length;
    for (const ev of events) {
      for (const a of people(ev)) {
        db.upsertPerson({ email: a.email, name: a.name || nameFromTitle(ev.summary, a.email), company: companyDomain(a.email) });
        db.putEntry({
          email: a.email, kind: 'meeting', ref_id: ev.iCalUID || ev.id,
          occurred_at: ev.start.dateTime || ev.start.date, title: ev.summary || '(untitled)', body: ev.description || null,
        });
        if (!boardy) continue;
        // Only Boardy threads that mention this person by email or name, from every connected inbox.
        for (const inbox of mine) {
          for (const t of await boardyThreads(inbox, boardy, { mentioning: [a.email, a.name], max: 5 })) {
            // The ask-all emails cover everyone at once; askall.js splits them per person, so never file them whole.
            if (sharedThreadIds().has(t.id)) continue;
            storeBoardyThread(a.email, inbox, t);
          }
        }
      }
    }
  }
  const replies = await checkAsks();
  // Ask Boardy to prep you for any meeting in the next 2 days that hasn't been prepped yet.
  await autoPrep().catch(e => console.error(`Prep request failed: ${e.message}`));
  return { accounts: mine, boardy, sendFrom, meetings, replies };
}

// Threads of the multi-person emails sent by `ask-all` (Boardy's list, and details on everyone),
// plus free-form messages from the Boardy tab. None of these belong to one person.
export function sharedThreadIds() {
  const ids = ['roster', 'askall'].map(k => JSON.parse(db.setting(k) || 'null')?.threadId);
  const history = JSON.parse(db.setting('shared_threads') || '[]');
  return new Set([...ids, ...history, ...chats().map(c => c.threadId)].filter(Boolean));
}

// Free-form conversations started from the Boardy tab: [{ inbox, threadId, subject, sentAt }].
const chats = () => JSON.parse(db.setting('chats') || '[]');

// Boardy tab inbox: every thread with Boardy across connected accounts, newest first.
// "Unread" is local to this app (Gmail access is read-only for mail state): new since you last opened it here.
async function boardyInbox() {
  const boardy = db.setting('boardy');
  if (!boardy) return [];
  const seen = JSON.parse(db.setting('seen_threads') || '{}');
  const all = [];
  for (const acc of await accounts()) {
    try { all.push(...await boardyThreadList(acc, boardy)); } catch (e) { console.error(`Inbox ${acc}: ${e.message}`); }
  }
  return all
    .map(t => ({ ...t, fromBoardy: isBoardy(t.lastFrom), unread: isBoardy(t.lastFrom) && seen[t.id] !== t.date }))
    .sort((a, b) => ms(b.date) - ms(a.date));
}

async function openThread(inbox, id) {
  const t = await thread(inbox, id);
  const seen = JSON.parse(db.setting('seen_threads') || '{}');
  seen[id] = t.messages.length ? new Date(ms(t.messages.at(-1).date)).toISOString() : null;
  db.setting('seen_threads', JSON.stringify(seen));
  return { inbox, id, subject: t.subject, messages: t.messages.map(m => ({ mine: !isBoardy(m.fromAddress), from: m.from, date: m.date, text: m.text })) };
}

// Runs when Pub/Sub reports a Boardy email; syncs and tells open pages.
let syncing = null;
async function onBoardyEmail(account) {
  if (syncing) return syncing;
  syncing = sync()
    .then(r => { console.log(`New Boardy email in ${account}.`); broadcast({ type: 'boardy', account, replies: r.replies }); })
    .catch(e => console.error(`Sync after Boardy email failed: ${e.message}`))
    .finally(() => { syncing = null; });
  return syncing;
}

async function state() {
  const now = new Date().toISOString();
  const people = db.listPeople();
  const meetings = [];
  for (const p of people) {
    // Undated meetings (people from Boardy's list) live on the person page and in Network, not on the dashboard.
    for (const e of db.getPerson(p.email).entries.filter(e => e.kind === 'meeting' && e.occurred_at)) {
      meetings.push({
        eventId: e.ref_id, title: e.title, start: e.occurred_at, email: p.email, name: p.name,
        past: e.occurred_at < now,
        hasNote: db.getPerson(p.email).entries.some(n => n.kind === 'note' && n.event_ref === e.ref_id),
        hasBrief: !!db.getEntry(p.email, 'brief', e.ref_id),
        goal: db.getEntry(p.email, 'goal', e.ref_id)?.body ?? '',
        prep: db.getEntry(p.email, 'prep', e.ref_id)?.body ?? null,
        prepRequested: prepRequested(e.ref_id),
      });
    }
  }
  meetings.sort((a, b) => a.start.localeCompare(b.start));
  return {
    accounts: await accounts(), boardy: db.setting('boardy'), sendFrom: db.setting('send_from'), hosted: !!PUBLIC_URL,
    live: live.enabled, unread: db.unreadByPerson(),
    quiet: goingQuiet(), pending: { followup: pendingFollow('followup'), reconnect: pendingFollow('reconnect') }, waiting: db.openAsks().map(a => a.email),
    meetings, people, nextSteps: db.openNextSteps(),
  };
}

// One of my notes, as an email to Boardy.
function noteEmail(id) {
  const n = db.getEntryById(id);
  const p = db.getPerson(n.email);
  const meeting = n.event_ref ? db.getEntry(n.email, 'meeting', n.event_ref) : null;
  const who = p.name ? `${p.name} (${n.email})` : n.email;
  return {
    subject: `Notes: ${p.name || n.email}`,
    text: [
      `Hi Boardy, here are my notes on ${who}${meeting ? ` from our meeting on ${meeting.occurred_at.slice(0, 10)}` : ''}.`,
      '', n.body,
      ...(n.next_step ? ['', `Next step: ${n.next_step}`] : []),
    ].join('\n'),
  };
}

// Names the person and their email so Boardy's reply lands in a thread Sync can match to them.
function askEmail(email, eventId) {
  const p = db.getPerson(email);
  const meeting = eventId ? db.getEntry(email, 'meeting', eventId) : p.entries.filter(e => e.kind === 'meeting').at(-1);
  const who = p.name ? `${p.name} (${email})` : email;
  const when = meeting ? ` on ${meeting.occurred_at.slice(0, 10)} ("${meeting.title}")` : '';
  return {
    subject: `Details on ${p.name || email}`,
    text: [
      'Hi Boardy,',
      '',
      `Could you send me notes on ${who}, who you introduced me to${when}? Please include their LinkedIn profile link too.`,
      '',
      'Please reply using these headings, each on its own line. Leave out any heading you have nothing for:',
      '',
      ...PROFILE_FIELDS.map(f => `${f.heading}:`),
      '',
      'Thanks!',
    ].join('\n'),
  };
}

// The format Ask Boardy requests. Intro calls rarely have more than this, so every field is optional.
// `link: true` fields are saved on the person, not shown as brief sections.
export const PROFILE_FIELDS = [
  { key: 'who', heading: 'WHO THEY ARE', label: 'Who they are' },
  { key: 'working_on', heading: "WHAT THEY'RE WORKING ON", label: "What they're working on" },
  { key: 'why_matched', heading: 'WHY WE WERE MATCHED', label: 'Why Boardy matched you' },
  { key: 'follow_up', heading: 'WORTH FOLLOWING UP ON', label: 'Worth following up on' },
  { key: 'title', heading: 'CURRENT ROLE', label: 'Current role', link: true }, // e.g. "Head of Engineering at Clover Labs"
  { key: 'opps', heading: 'OPPORTUNITIES', label: 'Opportunities', link: true }, // roles, projects, events; one per line
  { key: 'linkedin', heading: 'LINKEDIN', label: 'LinkedIn', link: true },
];

const LINKEDIN_URL = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+\/?/i;
export const linkedinFrom = text => (text || '').match(LINKEDIN_URL)?.[0] || (text || '').match(/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+\/?/i)?.[0]?.replace(/^/, 'https://') || null;

// Reads the latest Boardy message that uses the headings. Returns null if Boardy replied in free text.
function parseProfile(text) {
  const norm = s => s.toUpperCase().replace(/[’']/g, "'").replace(/[^A-Z' ]/g, '').trim();
  const out = {};
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*\**\s*([A-Za-z’' &]+?)\s*\**\s*:\s*\**\s*(.*)$/);
    const field = m && PROFILE_FIELDS.find(f => norm(f.heading) === norm(m[1]));
    if (field) { current = field.key; out[current] = m[2].trim(); continue; }
    if (current && line.trim()) out[current] = `${out[current]}\n${line.trim()}`.trim();
  }
  // The last field otherwise swallows the sign-off ("Cheers", "Thanks, Boardy").
  const signOff = /^(cheers|thanks|thank you|best|talk soon|good luck|[-—–]*\s*boardy)\b[\s\S]{0,20}$/i;
  if (current && out[current]) {
    const lines = out[current].split('\n');
    while (lines.length > 1 && signOff.test(lines.at(-1))) lines.pop();
    out[current] = lines.join('\n');
  }
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return Object.keys(out).length >= 2 ? out : null;
}

// ---- Export: one person or everyone, as Markdown (readable) or CSV (spreadsheet). ----
// Includes what you'd want to keep: profile, meetings, Boardy's brief and your notes. Raw source emails are left out.
function exportData(email) {
  const people = email ? [db.getPerson(email)].filter(Boolean) : db.listPeople().map(p => db.getPerson(p.email));
  return people.map(p => {
    const meetings = p.entries.filter(e => e.kind === 'meeting').sort((a, b) => (ms(a.occurred_at) || 0) - (ms(b.occurred_at) || 0));
    const lastMet = meetings.filter(m => m.occurred_at && ms(m.occurred_at) < Date.now()).at(-1);
    const brief = lastMet ? db.getEntry(p.email, 'brief', lastMet.ref_id) : p.entries.find(e => e.kind === 'brief');
    const sections = {};
    for (const f of PROFILE_FIELDS.filter(f => !f.link)) {
      const m = brief?.body.match(new RegExp(`(?:^|\\n)${f.label.replace(/[.*+?^${}()|[\]\\']/g, '\\$&')}:\\s*([\\s\\S]*?)(?=\\n\\n(?:${PROFILE_FIELDS.map(x => x.label.replace(/[.*+?^${}()|[\]\\']/g, '\\$&')).join('|')}):|$)`));
      if (m) sections[f.label] = m[1].trim();
    }
    return {
      ...p, meetings, brief, sections,
      noEmail: p.email.endsWith('@no-email.boardy'),
      notes: p.entries.filter(e => e.kind === 'note').sort((a, b) => ms(a.occurred_at) - ms(b.occurred_at)),
      lastMet: lastMet?.occurred_at || null,
    };
  });
}

const day = d => (d ? d.slice(0, 10) : 'date unknown');

function exportMarkdown(email) {
  const out = exportData(email).map(p => [
    `# ${p.name || p.email}`,
    '',
    ...[!p.noEmail && `- Email: ${p.email}`, p.company && `- Company: ${p.company}`, p.linkedin && `- LinkedIn: ${p.linkedin}`].filter(Boolean),
    '',
    '## Meetings',
    ...(p.meetings.length ? p.meetings.map(m => `- ${day(m.occurred_at)}: ${m.title}`) : ['- None']),
    ...(p.brief ? ['', "## Boardy's brief", '',
      ...(Object.keys(p.sections).length >= 2
        ? Object.entries(p.sections).flatMap(([k, v]) => [`### ${k}`, v, ''])
        : [p.brief.body, ''])] : []),
    ...(p.notes.length ? ['', '## My notes', '', ...p.notes.flatMap(n => [
      `**${day(n.occurred_at)}**`, n.body, ...(n.next_step ? [`- [${n.done ? 'x' : ' '}] Next step: ${n.next_step}`] : []), ''])] : []),
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim());
  return out.join('\n\n---\n\n') + '\n';
}

function exportCsv(email) {
  const cell = v => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const cols = ['Name', 'Email', 'Company', 'LinkedIn', 'Last met', 'Meetings', ...PROFILE_FIELDS.filter(f => !f.link).map(f => f.label), 'Open next steps', 'Latest note'];
  const rows = exportData(email).map(p => [
    p.name, p.noEmail ? '' : p.email, p.company, p.linkedin, p.lastMet ? day(p.lastMet) : '', p.meetings.length,
    ...PROFILE_FIELDS.filter(f => !f.link).map(f => p.sections[f.label] || ''),
    p.notes.filter(n => n.next_step && !n.done).map(n => n.next_step).join('; '),
    p.notes.at(-1)?.body || '',
  ]);
  // Leading BOM so Excel opens it as UTF-8.
  return '﻿' + [cols, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const routes = {
  'GET /api/export': (_, q) => {
    const email = q.get('email') || null;
    const csv = q.get('format') === 'csv';
    const p = email && db.getPerson(email);
    const base = p ? (p.name || p.email).replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') : `networkquest-${new Date().toISOString().slice(0, 10)}`;
    return { filename: `${base}.${csv ? 'csv' : 'md'}`, type: csv ? 'text/csv' : 'text/markdown', content: csv ? exportCsv(email) : exportMarkdown(email) };
  },
  'GET /api/state': () => state(),
  'POST /api/sync': () => sync({}),
  // Opening a person shows their new briefs, so they are marked read here (the response still carries the flags).
  'GET /api/person': (_, q) => {
    const p = db.getPerson(q.get('email'));
    if (p) db.markRead(q.get('email'));
    return p;
  },
  // The Boardy tab: a free-form message, sent as a new email to Boardy only when you press Send.
  'GET /api/inbox': () => boardyInbox(),
  'GET /api/thread': (_, q) => openThread(q.get('inbox'), q.get('id')),
  // Reply in an existing Boardy thread, from the inbox that holds it. Still only ever addressed to Boardy.
  'POST /api/reply': async b => {
    const text = b.text?.trim();
    if (!text) throw new Error('Type a reply first');
    if (!(await accounts()).includes(b.inbox)) throw new Error('That inbox is not connected');
    const t = await thread(b.inbox, b.id);
    const last = t.messages.at(-1);
    const subject = /^re:/i.test(t.subject) ? t.subject : `Re: ${t.subject}`;
    await sendToBoardy(b.inbox, db.setting('boardy'), subject, text, { threadId: b.id, inReplyTo: last?.messageId });
    return { ok: true };
  },
  'POST /api/boardy-message': async b => {
    const text = b.text?.trim();
    if (!text) throw new Error('Type a message first');
    const from = db.setting('send_from');
    const subject = b.subject?.trim() || text.replace(/^hi boardy,?\s*/i, '').split(/\n/).find(Boolean)?.slice(0, 70) || 'Hello';
    const sent = await sendToBoardy(from, db.setting('boardy'), subject, text);
    db.setting('chats', JSON.stringify([...chats(), { inbox: from, threadId: sent.threadId, subject, sentAt: new Date().toISOString() }]));
    return { ok: true, inbox: from, id: sent.threadId };
  },
  'POST /api/settings': async b => {
    if (b.boardy) db.setting('boardy', b.boardy.trim().toLowerCase());
    if (b.sendFrom) {
      if (!(await accounts()).includes(b.sendFrom)) throw new Error('That account is not connected');
      db.setting('send_from', b.sendFrom);
    }
    return { ok: true };
  },
  'POST /api/goal': b => { db.putEntry({ email: b.email, kind: 'goal', ref_id: b.eventId, occurred_at: new Date().toISOString(), body: b.goal }); return { ok: true }; },
  // My notes: one list per person. eventRef (which meeting) and next_step are optional.
  'POST /api/note': b => {
    if (!b.body?.trim()) throw new Error('The note is empty');
    if (b.id) db.updateNote(b.id, { body: b.body.trim(), next_step: b.next_step?.trim(), event_ref: b.eventRef });
    else db.putEntry({
      email: b.email, kind: 'note', occurred_at: new Date().toISOString(),
      body: b.body.trim(), next_step: b.next_step?.trim() || null, event_ref: b.eventRef || null,
    });
    return { ok: true };
  },
  'POST /api/note-delete': b => { db.deleteEntry(b.id, ['note']); return { ok: true }; },
  // Boardy prep for one upcoming meeting (also sent automatically 2 days ahead).
  'POST /api/prep': async b => { await requestPrep(b.email, b.eventId); return { ok: true }; },
  // type: 'followup' (ideas for people going quiet) or 'reconnect' (Boardy picks up to 3 for this month).
  'POST /api/followups': async b => {
    if (!['followup', 'reconnect'].includes(b.type)) throw new Error('Unknown request');
    return { ok: true, count: await requestFollowups(b.type) };
  },
  'POST /api/opp': b => { if (!b.text?.trim()) throw new Error('Type an opportunity first'); db.addOpportunities(b.email, b.text.trim(), 'you'); return { ok: true }; },
  'POST /api/opp-delete': b => { db.deleteEntry(b.id, ['opp']); return { ok: true }; },
  'POST /api/linkedin': b => {
    const url = b.url?.trim() ? linkedinFrom(b.url) : null;
    if (b.url?.trim() && !url) throw new Error('That does not look like a LinkedIn profile link (linkedin.com/in/...)');
    db.setLinkedin(b.email, url);
    return { ok: true, url };
  },
  // Boardy's recap of one meeting. Filled from email automatically; pasting or editing here marks it 'manual'
  // so later emails never overwrite it. An empty body deletes it.
  'POST /api/brief': b => {
    if (!b.body?.trim()) {
      const e = db.getEntry(b.email, 'brief', b.eventId);
      if (e) db.deleteEntry(e.id, ['brief']);
    } else {
      const meeting = db.getEntry(b.email, 'meeting', b.eventId);
      db.putEntry({
        email: b.email, kind: 'brief', ref_id: b.eventId, occurred_at: meeting?.occurred_at ?? new Date().toISOString(),
        title: meeting?.title ?? 'Meeting brief', body: b.body.trim(), source: 'manual', unread: 0,
      });
    }
    return { ok: true };
  },
  'GET /api/note-email': (_, q) => noteEmail(Number(q.get('id'))),
  'GET /api/ask-email': (_, q) => askEmail(q.get('email'), q.get('eventId')),
  // Sends only after the user has seen and confirmed the preview in the UI.
  'POST /api/send': async b => {
    const from = db.setting('send_from');
    const sent = await sendToBoardy(from, db.setting('boardy'), b.subject, b.text);
    const kind = b.kind === 'ask' ? 'ask' : 'sent';
    // Asks keep the sending inbox and thread id so the reply can be found exactly.
    const ref_id = kind === 'ask' ? `ask-thread-${from}|${sent.threadId}` : `sent-${Date.now()}`;
    // An ask remembers its meeting so the answer fills that meeting's brief.
    const event_ref = kind === 'ask'
      ? (b.eventId || db.getPerson(b.email).entries.filter(e => e.kind === 'meeting' && e.occurred_at < new Date().toISOString()).at(-1)?.ref_id || null)
      : null;
    db.putEntry({ email: b.email, kind, ref_id, occurred_at: new Date().toISOString(), title: b.subject, body: b.text, event_ref });
    return { ok: true };
  },
  'POST /api/done': b => { db.setDone(b.id, b.done); return { ok: true }; },
  'POST /api/forget': b => ({ ok: db.forgetPerson(b.email) }),
};

let live = { enabled: false };

// After connecting an account in the browser: start live notifications if this account brought Pub/Sub access,
// then sync so its meetings and Boardy mail show up right away.
async function onAccountConnected(account) {
  console.log(`Connected ${account}.`);
  if (!live.enabled) live = await startLive(onBoardyEmail).catch(() => live);
  sync({}).catch(e => console.error(`Sync after connecting failed: ${e.message}`));
}

// Locally: 127.0.0.1 only, no login (only your computer can reach it).
// Hosted (NQ_PUBLIC_URL set): listens on all interfaces behind Google sign-in (webauth.js).
export function serve(port = Number(process.env.PORT) || 3000) {
  const hosted = !!PUBLIC_URL;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (hosted) {
      // Security headers for a public site.
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'same-origin');
      if (url.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
      try {
        if (await guard(req, res, url, { onConnected: account => onAccountConnected(account) })) return;
      } catch (e) {
        res.writeHead(500); return res.end('Server error');
      }
    }
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(PAGE));
    }
    // EventSource cannot send custom headers. This stream only says "something changed"
    // and has no CORS headers, so other sites cannot read it.
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      listeners.add(res);
      req.on('close', () => listeners.delete(res));
      return;
    }
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) { res.writeHead(404); return res.end(); }
    // A custom header forces a CORS preflight that we never answer, so other sites cannot call this API.
    if (req.headers['x-nq'] !== '1') { res.writeHead(403); return res.end(); }
    try {
      let body = {};
      if (req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        body = raw ? JSON.parse(raw) : {};
      }
      const out = await route(body, url.searchParams);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out ?? null));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
  server.listen(port, hosted ? '0.0.0.0' : '127.0.0.1', async () => {
    console.log(hosted ? `NetworkQuest running at ${PUBLIC_URL} (sign-in required)` : `NetworkQuest running at http://127.0.0.1:${port}`);
    try { live = await startLive(onBoardyEmail); } catch (e) { console.error(`Live notifications failed to start: ${e.message}`); }
    autoPrep().catch(e => console.error(`Prep request failed: ${e.message}`));
  });
}
