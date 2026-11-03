// Things Boardy does for you, each as one email whose reply is read back in:
//   prep      - before an upcoming meeting: talking points and questions for that one person
//   followup  - for people going quiet: a specific reason to reach back out to each
//   reconnect - once a month: Boardy picks up to 3 people worth catching up with, and why now
import { sendToBoardy, thread } from './google.js';
import { isBoardy } from './live.js';
import { split, hasRealEmail } from './askall.js';
import { linkedinFrom } from './server.js';
import * as db from './db.js';

const ms = s => Date.parse(s);
const DAY = 86400000;
export const QUIET_DAYS = 14;    // no contact for this long = going quiet
export const PREP_HOURS = 48;    // prep is requested this far ahead of a meeting
const IDEA_FRESH_DAYS = 30;      // a follow-up idea older than this is asked for again

const requests = () => JSON.parse(db.setting('requests') || '[]');
const saveRequests = list => db.setting('requests', JSON.stringify(list));

// Every request thread is "shared" so Sync never files it whole under a person (see sharedThreadIds in server.js).
function remember(type, inbox, threadId, people) {
  saveRequests([...requests(), { type, inbox, threadId, sentAt: new Date().toISOString(), people, done: false }]);
  const shared = new Set(JSON.parse(db.setting('shared_threads') || '[]')).add(threadId);
  db.setting('shared_threads', JSON.stringify([...shared]));
}

const who = p => (p.name ? (hasRealEmail(p.email) ? `${p.name} (${p.email})` : p.name) : p.email);

// Headings this module asks for, with the labels used when storing the answer.
const PREP = [
  ['who', 'WHO THEY ARE', 'Who they are'],
  ['why', 'WHY WE WERE MATCHED', 'Why Boardy matched you'],
  ['talk', 'TALKING POINTS', 'Talking points'],
  ['ask', 'QUESTIONS TO ASK', 'Questions to ask'],
  ['opps', 'OPPORTUNITIES', null],
  ['title', 'CURRENT ROLE', null],
  ['linkedin', 'LINKEDIN', null],
];
const FOLLOW = [
  ['why', 'WHY NOW', 'Why now'],
  ['idea', 'FOLLOW-UP IDEA', 'Follow-up idea'],
  ['opps', 'OPPORTUNITIES', null],
];
export const PREP_LABELS = PREP.filter(h => h[2]).map(h => h[2]);
export const FOLLOW_LABELS = FOLLOW.filter(h => h[2]).map(h => h[2]);

// Lenient "HEADING: text" reader: headings may be bold, on their own line, or followed by text on the same line.
export function readHeadings(text, headings) {
  const norm = s => s.toUpperCase().replace(/[’']/g, "'").replace(/[^A-Z' -]/g, '').replace(/\s+/g, ' ').trim();
  const out = {};
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*[*#\s]*([A-Za-z’' -]{3,40}?)[*\s]*:[*\s]*(.*)$/);
    const h = m && headings.find(([, heading]) => norm(heading) === norm(m[1]));
    if (h) { cur = h[0]; out[cur] = m[2].trim(); continue; }
    if (cur && line.trim()) out[cur] = `${out[cur]}\n${line.trim()}`.trim();
  }
  const signOff = /^(cheers|thanks|thank you|best|talk soon|good luck|[-—–]*\s*boardy)\b[\s\S]{0,20}$/i;
  if (cur && out[cur]) {
    const lines = out[cur].split('\n');
    while (lines.length > 1 && signOff.test(lines.at(-1))) lines.pop();
    out[cur] = lines.join('\n');
  }
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return Object.keys(out).length ? out : null;
}

// Stores the person-level extras (role, LinkedIn, opportunities) and returns the "Label: text" body for display.
function absorb(email, fields, headings) {
  if (fields.linkedin && linkedinFrom(fields.linkedin)) db.setLinkedin(email, linkedinFrom(fields.linkedin));
  const title = fields.title?.split('\n')[0].trim();
  if (title && title.length <= 120) db.setTitle(email, title);
  if (fields.opps) db.addOpportunities(email, fields.opps, 'boardy');
  return headings.filter(([k, , label]) => label && fields[k]).map(([k, , label]) => `${label}: ${fields[k]}`).join('\n\n');
}

// ---- prep ----

function prepDraft(p, meeting) {
  return {
    subject: `Prep for my call with ${p.name || p.email}`,
    text: [
      'Hi Boardy,',
      '',
      `I'm meeting ${who(p)} on ${new Date(meeting.occurred_at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })} ("${meeting.title}"). Could you help me prepare?`,
      '',
      'Please reply using these headings, each on its own line. Leave out any heading you have nothing for:',
      '',
      ...PREP.map(([, h]) => `${h}:`),
      '',
      'For talking points and questions, a few short lines each is perfect. For opportunities, list any roles, projects or events worth asking about, one per line.',
      '',
      'Thanks!',
    ].join('\n'),
  };
}

export const prepRequested = eventRef => requests().some(r => r.type === 'prep' && r.people[0]?.eventRef === eventRef);

export async function requestPrep(email, eventRef) {
  const p = db.getPerson(email);
  const meeting = db.getEntry(email, 'meeting', eventRef);
  if (!p || !meeting) throw new Error('Meeting not found');
  const from = db.setting('send_from');
  const { subject, text } = prepDraft(p, meeting);
  const sent = await sendToBoardy(from, db.setting('boardy'), subject, text);
  remember('prep', from, sent.threadId, [{ email, name: p.name, eventRef }]);
}

// Asks for prep once per upcoming meeting, when it's within PREP_HOURS. Runs on start and after each Sync.
export async function autoPrep() {
  if (!db.setting('send_from') || !db.setting('boardy')) return 0;
  const now = Date.now();
  let n = 0;
  for (const p of db.listPeople()) {
    for (const m of db.getPerson(p.email).entries.filter(e => e.kind === 'meeting' && e.occurred_at)) {
      const t = ms(m.occurred_at);
      if (t > now && t - now <= PREP_HOURS * 3600000 && !prepRequested(m.ref_id) && !db.getEntry(p.email, 'prep', m.ref_id)) {
        await requestPrep(p.email, m.ref_id);
        console.log(`Asked Boardy to prep you for ${p.name || p.email}.`);
        n++;
      }
    }
  }
  return n;
}

// ---- going quiet ----

// People you've met, with no meeting coming up, and no contact (meeting, note, or email to Boardy about them)
// in QUIET_DAYS. Sorted longest-quiet first.
export function goingQuiet() {
  const now = Date.now();
  const out = [];
  for (const row of db.listPeople()) {
    const p = db.getPerson(row.email);
    const meetings = p.entries.filter(e => e.kind === 'meeting');
    if (!meetings.length || meetings.some(m => m.occurred_at && ms(m.occurred_at) > now)) continue;
    const touches = p.entries.filter(e => ['meeting', 'note', 'sent', 'ask'].includes(e.kind) && e.occurred_at).map(e => ms(e.occurred_at)).filter(t => t <= now);
    const last = touches.length ? Math.max(...touches) : null;
    const days = last ? Math.floor((now - last) / DAY) : null;
    if (days !== null && days < QUIET_DAYS) continue;
    const idea = p.entries.filter(e => e.kind === 'followup').sort((a, b) => ms(b.occurred_at) - ms(a.occurred_at))[0] || null;
    out.push({ email: p.email, name: p.name, title: p.title, days, idea: idea && { body: idea.body, type: idea.title, at: idea.occurred_at } });
  }
  return out.sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999));
}

function followDraft(type, people) {
  const intro = type === 'reconnect'
    ? [`Here's everyone I've met through you. Could you pick up to 3 who'd be most worth reconnecting with this month, based on what's changed for them or what they're working on? Only include the people you pick.`]
    : [`I haven't been in touch with these people for a while. For each, could you suggest one specific, natural reason to reach back out?`];
  return {
    subject: type === 'reconnect' ? 'Who should I reconnect with this month?' : `Follow-up ideas for ${people.length} people`,
    text: [
      'Hi Boardy,', '', ...intro, '',
      ...people.map(p => `- ${who(p)}`), '',
      'Please start each person with a line like this, using their email exactly (or their name if you have no email):',
      '=== their@email.com ===', '',
      'and under it use these headings, each on its own line. Leave out any heading you have nothing for:', '',
      ...FOLLOW.map(([, h]) => `${h}:`), '',
      'Thanks!',
    ].join('\n'),
  };
}

export const pendingFollow = type => requests().some(r => r.type === type && !r.done);

export async function requestFollowups(type) {
  let people;
  if (type === 'reconnect') {
    people = db.listPeople().filter(p => db.getPerson(p.email).entries.some(e => e.kind === 'meeting' && (!e.occurred_at || ms(e.occurred_at) < Date.now())));
  } else {
    people = goingQuiet().filter(q => !q.idea || Date.now() - ms(q.idea.at) > IDEA_FRESH_DAYS * DAY);
  }
  people = people.map(p => ({ email: p.email, name: p.name }));
  if (!people.length) throw new Error(type === 'reconnect' ? 'No one to ask about yet.' : 'Everyone going quiet already has a recent follow-up idea.');
  const from = db.setting('send_from');
  const { subject, text } = followDraft(type, people);
  const sent = await sendToBoardy(from, db.setting('boardy'), subject, text);
  remember(type, from, sent.threadId, people);
  return people.length;
}

// ---- reading replies (called from Sync / live notifications) ----

export async function collectRequests() {
  const list = requests();
  let filled = 0;
  for (const r of list.filter(r => !r.done)) {
    let t;
    try { t = await thread(r.inbox, r.threadId); } catch { continue; }
    const replies = t.messages.filter(m => isBoardy(m.fromAddress) && ms(m.date) > ms(r.sentAt));
    if (!replies.length) continue;
    for (const m of replies) {
      if (r.type === 'prep') {
        const p = r.people[0];
        const fields = readHeadings(m.text, PREP);
        const body = fields ? absorb(p.email, fields, PREP) : m.text.trim();
        if (body) db.putEntry({ email: p.email, kind: 'prep', ref_id: p.eventRef, occurred_at: m.date, title: t.subject, body, unread: 1 });
        filled++;
      } else {
        for (const c of split(m.text, r.people)) {
          const fields = readHeadings(c.text, FOLLOW);
          const body = fields ? absorb(c.person.email, fields, FOLLOW) : c.text.trim();
          if (!body) continue;
          db.putEntry({ email: c.person.email, kind: 'followup', ref_id: `${r.type}-${r.threadId}`, occurred_at: m.date, title: r.type, body, unread: 1 });
          filled++;
        }
      }
    }
    r.done = true;
  }
  saveRequests(list);
  return filled;
}
