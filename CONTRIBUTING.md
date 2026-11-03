# Contributing

Thanks for helping out. NetworkQuest is small on purpose, so a few ground rules keep it that way.

## Setup

1. Install Node 22.13 or newer. There are no npm dependencies.
2. Follow "One-time setup" in the [README](README.md) to create your own Google OAuth client.
3. Run `npm run nq -- ui` and open http://127.0.0.1:3000.

## Rules

- **No new dependencies** unless there's no reasonable way around it. Node's built-ins (including `node:sqlite`) cover most needs.
- **Keep the Google boundaries.** Calendar stays read-only. Gmail reads stay filtered to Boardy. Gmail sends go only to the Boardy address and only after a preview. A PR that widens any of these needs a strong reason.
- **Never commit secrets** or personal data: OAuth client files, tokens, `.db` files, real names or emails.
- Run `npm run check` before opening a PR.

## Pull requests

- One change per PR, with a short note on what and why.
- For anything big, open an issue first so we can agree on the approach.
