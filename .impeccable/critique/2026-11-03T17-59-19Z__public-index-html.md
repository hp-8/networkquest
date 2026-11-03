---
target: in-app UI
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\Owner\\Desktop\\Harsh\\NetworkQuest\\public\\index.html"
target_fingerprint: "sha256:8bfdbe01bec388131d72ce3ba5eab02664c442bcba106e7e26659fb451389ef0"
target_path: "C:\\Users\\Owner\\Desktop\\Harsh\\NetworkQuest\\public\\index.html"
timestamp: 2026-11-03T17-59-19Z
slug: public-index-html
---
# Critique: public/index.html (NetworkQuest app), Operate mode
Method: dual-agent. The detector overlay was skipped because no browser injection tool was available. Populated views were judged from the source, since the real app sends email when it starts.

Heuristics: 1 status 2 · 2 real world 3 · 3 control 2 · 4 consistency 2 · 5 error prevention 2 · 6 recognition 3 · 7 efficiency 2 · 8 minimalism 2 · 9 recovery 1 · 10 help 2. Total 21/40 (Acceptable).

Specificity: the content is product-specific; the shell is generic (stat bento, pill nav, pastel tints). It drifts from DESIGN.md: muted, hairline and amber still use the old values, the done green isn't in the system, the button radius is 9 instead of 12, there's white text on the dark indigo button (2.6:1), and Inter is never loaded.
Detector: 18 findings: 2 low-contrast warnings (white on #8f98ff, and its hover), plus 16 advisories (radius, font-size, color drift).

Priority issues:
- [P1] The misleading "restart the server" error on any 404 (line 269), and alert()-based feedback. Use a status region, a Retry button, and a real version check.
- [P1] The note's "Send to Boardy" is hidden until hover (.note-actions, line 162). Always show it, and mark notes sent or not sent.
- [P2] The dashboard repeats its counts and hides Needs notes below the fold (lines 521–531).
- [P2] Token drift from DESIGN.md and the dark-mode contrast failure (:root lines 10–19, line 45, lines 82/458).
- [P2] Click handlers on elements the keyboard can't reach; unnamed ‹ › buttons and checkboxes; radios without labels.

Personas: Alex has no tab shortcuts, no next-note flow, and instant deletes. Sam can't reach controls by keyboard, gets hover-only actions and color-only status. The Boardy regular can't see which notes were sent, and Compose skips the preview.
Minor: the new-from-Boardy stat goes to Network; first-name collisions on the calendar; uppercase eyebrows; glyph icons; the .quiet-list 420px min-width; the double meaning of the Brief button; the not-affiliated line is missing from the app.
