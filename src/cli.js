#!/usr/bin/env node
import { authorize, accounts, disconnect } from './google.js';
import { serve, sync } from './server.js';
import * as askAll from './askall.js';
import * as db from './db.js';
import readline from 'node:readline/promises';
import { HOME } from './paths.js';

const [cmd, ...args] = process.argv.slice(2);

const commands = {
  // Each run connects one more account; Google lets you pick which.
  // `auth --pubsub` also grants Pub/Sub access; use it for the account that owns the Google Cloud project.
  auth: async () => {
    const account = await authorize({ pubsub: args.includes('--pubsub') });
    console.log(`Connected ${account}. Connected accounts: ${(await accounts()).join(', ')}`);
  },
  accounts: async () => console.log((await accounts()).join('\n') || 'None connected.'),
  disconnect: async () => { disconnect(args[0]?.toLowerCase()); console.log(`Removed ${args[0]} from this computer.`); },
  // Port: the argument, else PORT (set by the host), else 3000.
  ui: () => serve(Number(args[0]) || undefined),

  // ask-all: run it, wait for Boardy, run it again. Each run does the next step:
  //   1. reads your whole calendar for Boardy meetings, then asks Boardy for its list of everyone you've met
  //   2. once that list is in, asks Boardy for details on all of them; the reply fills each person's brief
  // Every email is shown first and only sent after you type y. --dry-run previews; --days N limits the look-back.
  'ask-all': async () => {
    const dry = args.includes('--dry-run');
    const days = Number(args[args.indexOf('--days') + 1]) || 3650;
    const from = db.setting('send_from'), boardy = db.setting('boardy');
    if (!dry && (!from || !boardy)) return console.log('Set the Boardy address and sending account in the UI first (Accounts & Boardy).');

    const confirmSend = async ({ subject, text }) => {
      console.log(`\nFrom: ${from}\nTo: ${boardy}\nSubject: ${subject}\n\n${text}\n`);
      if (dry) { console.log('(dry run, nothing sent)'); return false; }
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ok = (await rl.question(`Send this to ${boardy}? (y/N) `)).trim().toLowerCase() === 'y';
      rl.close();
      if (!ok) console.log('Not sent.');
      return ok;
    };

    // Pick up any replies that have arrived since the last run.
    const roster = await askAll.collectRoster();
    if (roster) console.log(`Boardy's list arrived: ${roster.total} people (${roster.added} new, ${roster.updated} already here).`);
    const answered = await askAll.collect();
    if (answered) {
      console.log(`Boardy's details arrived: filled briefs for ${answered.matched.length} people.`);
      if (answered.missing.length) console.log(`Not covered in the reply: ${answered.missing.join(', ')}`);
    }

    console.log(`Reading your calendar for Boardy meetings (last ${Math.round(days / 365)} years)...`);
    await sync({ back: days, boardyOnly: true });
    const people = askAll.pastMeetings();
    console.log(`${people.length} people you've met are on record.`);

    // Step 1: Boardy's list.
    const r = askAll.rosterState();
    if (!r) {
      if (await confirmSend(askAll.rosterDraft())) {
        await askAll.sendRoster(askAll.rosterDraft().subject, askAll.rosterDraft().text);
        console.log('Sent. Once Boardy replies, run "node src/cli.js ask-all" again (the UI also imports the list on Sync).');
      }
      return;
    }
    if (!r.done) return console.log('Still waiting for Boardy\'s list. Run this again once it replies.');

    // Step 2: details, only for people who don't have a brief yet (so re-running after new intros asks about just those).
    const details = JSON.parse(db.setting('askall') || 'null');
    if (details && !details.done) return console.log('Still waiting for Boardy\'s details. Run this again once it replies, or just Sync in the UI.');
    const needed = people.filter(p => !db.getEntry(p.email, 'brief', p.eventRef));
    if (!needed.length) return console.log('Done: everyone you\'ve met has a brief.');
    console.log(`${needed.length} of them have no brief yet.`);
    const d = askAll.draft(needed);
    if (await confirmSend(d)) {
      await askAll.send(needed, d.subject, d.text);
      console.log("Sent. When Boardy replies, each person's brief fills in on its own (live, or on your next Sync).");
    }
  },
  where: () => console.log(HOME),
};

const run = commands[cmd];
if (!run) {
  console.log(`Usage: node src/cli.js <command>
  auth                 Connect a Google account (run again to add another)
  auth --pubsub        Same, plus Pub/Sub access for live Boardy notifications
  accounts             List connected accounts
  disconnect <email>   Remove an account's saved login
  ui                   Start the local UI at http://127.0.0.1:3000
  ask-all              Get everyone you've met through Boardy, then details on all of them.
                       Run it, wait for Boardy's reply, run it again. Asks before every send; --dry-run to preview.
  where                Show where private data is stored`);
} else {
  try { await run(); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
