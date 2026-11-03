# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: people who already use Boardy (the AI that books networking intros over email) and have a steady flow of intro calls. They need one place to prep before each call and write things up after it. They're comfortable cloning a repo and running a Node command.

Secondary: people evaluating the author, Harsh Patadia (founders, peers, recruiters). They read the project as evidence of how he builds.

## Product Purpose

NetworkQuest sits next to Boardy. Boardy sets up the meetings. NetworkQuest shows them, keeps notes on each person, and sends the notes back to Boardy. Success means no call goes unprepared and no follow-up goes unwritten.

## Positioning

- Not affiliated with Boardy. It's an independent, open source side project, built out of personal need by someone who likes Boardy's work.
- Strict, inspectable Google boundaries: Calendar is read-only, Gmail reads only Boardy threads, and Gmail sends only to Boardy, and only after you confirm a preview.
- Zero npm dependencies and no AI API keys. It runs locally on 127.0.0.1 or on your own Fly.io machine.

## Operating Context

The cycle is: sync (past and next 14 days of meetings plus matching Boardy emails), set a goal for upcoming calls, write notes after past ones (what you learned, value each way, the agreed next step), then send them to Boardy. Views: Meetings (Needs notes / Upcoming / Done), Network (timeline per person), Next steps (one checklist). Optional live Boardy notifications through Gmail and Pub/Sub.

## Capabilities and Constraints

- Node 22.13+, built-in SQLite, a plain HTML UI in `public/index.html`, and a server in `src/server.js`.
- Hosted mode (Fly.io) puts every app page behind Google sign-in with an email allow-list. The landing page must be public and served by the same Fly app before sign-in.
- The hosted instance is private to the author. Visitors can't try it; they self-host from GitHub.
- Repo: https://github.com/hp-8/networkquest. License: MIT. Current release: v0.1.0.

## Brand Commitments

- Name: NetworkQuest.
- The "not affiliated with Boardy" statement must stay visible wherever the product is presented.
- Voice: plain, short, practical, first person where personal. No hype.

## Evidence on Hand

No users, testimonials, metrics or screenshots exist yet. Don't invent any of them.

## Product Principles

1. Never send anything without the person seeing it first.
2. Touch as little of someone's Google account as possible, and say exactly what is touched.
3. Small and dependency-free beats feature-rich.
4. Be honest about what it is: one person's tool, shared openly.
