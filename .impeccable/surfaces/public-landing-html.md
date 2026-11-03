---
version: 1
slug: "public-landing-html"
primary_target: "public/landing.html"
related_targets: []
---

# Landing page (public/landing.html)

Scope: the public front door of the hosted app at networkquest-harsh.fly.dev/ for signed-out visitors, also served locally at /welcome. Mode: Persuade. One viewport, no scroll at any size.

Audience: Boardy users who could self-host it, first; people evaluating the author, second. Action: View on GitHub. Owner sign-in is a quiet secondary link. Proof: the product's real mechanism (a 28-day window, notes behind, goals ahead), shown with synthetic data labelled as sample. Constraint: the "not affiliated with Boardy" line is always visible.

## Direction contract

THESIS: The page is the sync window itself, 14 days back and 14 ahead with today in the middle, not a headline over feature cards.
OWN-WORLD: The app's world: warm neutral ground #f3f1ec, card #fffdf9, ink #23221f, amber #b4681f for needs-notes, indigo #4f5bd5 for goals and the action, Inter, rounded day cells with a hairline border, app-matched dark mode.
STORY: The visitor sees past intros waiting for notes and upcoming ones with goals, understands the loop, reads the boundaries line, and goes to GitHub.
FIRST VIEWPORT: Wordmark, a one-line pitch and the GitHub button across the top third. A full-width strip of 28 day columns below it, with a dark rule at today, an amber Needs-notes label to its left and an indigo Goals-ahead label to its right. A detail line under the strip, and the footer with the boundaries, MIT and not-affiliated note.
FORM: The 28-day strip, my ranked position 6 of 7. seed:2a68c7ac22781bc8. Signature interaction: hovering or focusing a meeting chip fills the detail line with that sample meeting's note or goal. Motion: on load, chips settle outward from today with exponential ease-out from a visible default; reduced motion skips it.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
