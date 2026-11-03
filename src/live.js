// Live Boardy notifications: Gmail publishes inbox changes to a Pub/Sub topic, and we wait on its subscription.
import fs from 'node:fs';
import { CLIENT_FILE } from './paths.js';
import { accounts, hasScope, PUBSUB_SCOPE, watchInbox, addedSince, senderOf, pullNotifications } from './google.js';
import * as db from './db.js';

export const TOPIC_ID = 'networkquest-gmail';
export const SUBSCRIPTION_ID = 'networkquest-gmail-sub';

function project() {
  return JSON.parse(fs.readFileSync(CLIENT_FILE, 'utf8')).installed?.project_id;
}

export const isBoardy = from => from.endsWith('@boardy.ai') || from === db.setting('boardy');

// Calls onBoardy(account) each time a Boardy email lands in a connected inbox.
export async function startLive(onBoardy) {
  const mine = await accounts();
  const listener = mine.find(a => hasScope(a, PUBSUB_SCOPE));
  if (!listener) {
    console.log('Live Boardy notifications are off. Run: node src/cli.js auth --pubsub (with the account that owns the Google Cloud project).');
    return { enabled: false };
  }
  const topic = `projects/${project()}/topics/${TOPIC_ID}`;
  const subscription = `projects/${project()}/subscriptions/${SUBSCRIPTION_ID}`;

  // A watch lasts 7 days; renewing once a day keeps it alive while the app runs.
  const renew = async () => {
    for (const acc of await accounts()) {
      try {
        const w = await watchInbox(acc, topic);
        if (!db.setting(`history:${acc}`)) db.setting(`history:${acc}`, String(w.historyId));
      } catch (e) { console.error(`Could not watch ${acc}: ${e.message}`); }
    }
  };
  await renew();
  setInterval(renew, 24 * 3600 * 1000).unref();

  const handle = async ({ emailAddress, historyId }) => {
    const acc = emailAddress.toLowerCase();
    const start = db.setting(`history:${acc}`);
    db.setting(`history:${acc}`, String(historyId));
    if (!start) return;
    let added;
    try { added = await addedSince(acc, start); }
    catch { return; } // history id too old (app was off a long time); the next Sync catches up
    for (const m of added) {
      if (isBoardy(await senderOf(acc, m.id))) { await onBoardy(acc); return; }
    }
  };

  (async function listen() {
    console.log(`Listening for Boardy emails (Pub/Sub via ${listener}).`);
    for (;;) {
      try {
        for (const n of await pullNotifications(listener, subscription)) await handle(n);
      } catch (e) {
        console.error(`Pub/Sub: ${e.message.slice(0, 300)}`);
        await new Promise(r => setTimeout(r, 30000)); // back off after an error, e.g. while offline
      }
    }
  })();
  return { enabled: true, listener };
}
