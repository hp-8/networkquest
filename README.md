# NetworkQuest

[![CI](https://github.com/hp-8/networkquest/actions/workflows/ci.yml/badge.svg)](https://github.com/hp-8/networkquest/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) ![Node 22.13+](https://img.shields.io/badge/node-%3E%3D22.13-green.svg) ![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)

A local UI that sits next to Boardy. Boardy sets up the meetings. NetworkQuest shows them, keeps your notes on each person, and sends the notes back to Boardy.

Requires Node 22.13+. It has no npm dependencies and no AI API keys.

## One-time setup

1. Go to https://console.cloud.google.com/ and create a project.
2. Enable the **Google Calendar API** and the **Gmail API**.
3. Go to **OAuth consent screen**, choose External, and add yourself as a test user.
4. Go to **Credentials**, then Create credentials, then OAuth client ID, then **Desktop app**. Download the JSON.
5. Save the file as `client_secret.json` in the data folder. To find that folder, run `npm run nq -- where`. On Windows it's `%APPDATA%\networkquest\`.
6. Run `npm run nq -- auth` and approve in the browser.

## Use

```
npm run nq -- ui      then open http://127.0.0.1:3000
```

- **Sync** pulls meetings from the past and next 14 days, plus any Boardy emails that mention each attendee.
- **Meetings:** "Needs notes" (past meetings you haven't written up), "Upcoming" (with a goal box), and "Done."
- **Notes:** paste your notes, then fill in what you learned, the value each way, and the agreed next step.
- **Send notes to Boardy** opens an editable preview. Nothing is sent until you press Send.
- **Network:** everyone you've met, with a timeline per person and a delete button.
- **Next steps:** every agreed next step in one checklist.

## Live Boardy notifications (optional)

Gmail publishes inbox changes to a Pub/Sub topic. While the UI runs, it waits on that topic, so a Boardy reply shows up immediately with a desktop notification. In the Google Cloud project that holds your OAuth client:

1. Enable the **Cloud Pub/Sub API**.
2. Create a topic with the ID `networkquest-gmail`. Untick "Add a default subscription."
3. On the topic, choose **Permissions**, then **Add principal**. Add `gmail-api-push@system.gserviceaccount.com` with the role **Pub/Sub Publisher**.
4. Create a subscription with the ID `networkquest-gmail-sub` on that topic. Set the delivery type to **Pull**.
5. Run `node src/cli.js auth --pubsub` and pick the Google account that owns the project.

The UI header shows **● Live** once it's working. Gmail's watch expires after 7 days, so the app renews it on start and once a day.

## Hosting it on Fly.io (optional)

The same app can run online, behind Google sign-in that only lets in the emails you allow. Locally nothing changes. Hosted mode switches on when `NQ_PUBLIC_URL` is set.

**1. Install Fly and sign in** (PowerShell). Fly asks for a card; the always-on 256 MB machine is roughly $2–5 a month.

```
iwr https://fly.io/install.ps1 -useb | iex
fly auth login
```

**2. Create the app and its disk.** Pick a unique name and use it everywhere `APP` appears below.

```
fly launch --no-deploy --copy-config --name APP --region yyz
fly volumes create nq_data --region yyz --size 1
```

**3. Make a web sign-in client in Google Cloud.** Use the same project as before.

- Go to **Credentials**, then **Create credentials**, then **OAuth client ID**, and choose **Web application**.
- Under **Authorized redirect URIs**, add both of these:
  - `https://APP.fly.dev/oauth/login`
  - `https://APP.fly.dev/oauth/connect`
- Download the JSON, for example as `client_web.json`. Keep it out of this folder.
- In **OAuth consent screen**, click **Publish app** so it shows as *In production*. In *Testing*, Google expires logins every 7 days. Google shows an "unverified app" warning when you sign in; that's expected for your own app.

**4. Set the secrets** (PowerShell, from this folder):

```
$secret = [Convert]::ToBase64String((1..48 | % { Get-Random -Max 256 }))
fly secrets set NQ_PUBLIC_URL=https://APP.fly.dev NQ_ALLOWED_EMAILS=you@example.com NQ_SESSION_SECRET=$secret --stage
"GOOGLE_CLIENT_JSON=$((Get-Content C:\path\to\client_web.json -Raw) -replace '\s','')" | fly secrets import --stage
```

**5. Deploy:** `fly deploy`

**6. Bring your existing data** (optional; otherwise start fresh and Sync):

```
fly ssh sftp shell
put C:\Users\Owner\AppData\Roaming\networkquest\network.db /data/network.db
```

Press Ctrl+D to leave the shell, then run `fly apps restart APP`.

**7. Sign in and connect Gmail.** Open `https://APP.fly.dev` and sign in, then go to **Accounts & Boardy**:

- **+ Connect a Google account** for each account.
- **+ Connect with live notifications** for the account that owns the Google Cloud project.

Logins made by the local app don't carry over, because they belong to the desktop client.

**8. Stop the local app.** If both run at once, they compete for the same notifications and could each send a prep request.

To run the ask-all script on the server: `fly ssh console -C "node src/cli.js ask-all"`.

## Boundaries

- **Calendar** is read-only.
- **Gmail reads** are always filtered to emails from or to Boardy's address. Nothing else in your inbox is searched.
- **Gmail sends** go only to the stored Boardy address. The recipient is fixed in code, and each send needs you to confirm a preview first. The tool uses the `gmail.send` permission, which can send email but not read or delete it.
- **Local.** The OAuth client, the token and the SQLite database live in the data folder, outside this project. The UI listens only on 127.0.0.1 and rejects requests from other websites.
- **Hosted.** Every page and API call needs a Google sign-in from an allowed email. Sessions are signed cookies (HttpOnly, Secure, SameSite=Lax) that last 30 days, and the site sends standard security headers. Data sits on your Fly volume, and secrets live in Fly's secret storage, never in this repo.

## Contributing

Issues and PRs are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Report security issues privately; see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
