---
name: NetworkQuest
description: Prep for every Boardy intro, write it up after, and send the notes back.
colors:
  paper-ground: "#f3f1ec"
  card-paper: "#fffdf9"
  warm-ink: "#23221f"
  muted-ink: "#67635b"
  hairline: "#e2ddd2"
  past-ground: "#ebe8e1"
  indigo: "#4f5bd5"
  indigo-hover: "#3f4ac0"
  amber: "#9a5516"
  on-color: "#ffffff"
  done-stone: "#dcd7cc"
  done-ink: "#3a3833"
  night-ground: "#151513"
  night-card: "#1d1d1a"
  night-ink: "#ebe8e1"
  night-muted: "#a29d93"
  night-hairline: "#2e2d29"
  night-past: "#191917"
  night-indigo: "#8f98ff"
  night-indigo-ink: "#11132b"
  night-indigo-hover: "#a7aeff"
  night-amber: "#e0a464"
  night-amber-ink: "#2a1a08"
  night-done-stone: "#4a4840"
  night-done-ink: "#ece8df"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(40px, min(6.2vw, 10vh), 92px)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.04em"
    fontFeature: "\"cv11\", \"ss01\""
  headline:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(16px, min(1.6vw, 2.6vh), 22px)"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"cv11\", \"ss01\""
  body:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"cv11\", \"ss01\""
  title:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.2
    fontFeature: "\"tnum\""
  label:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.5
  chip:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.02em"
  caption:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.2
    fontFeature: "\"tnum\""
rounded:
  swatch: "3px"
  focus: "6px"
  chip: "7px"
  day: "10px"
  button: "12px"
  card: "16px"
  tile: "18px"
spacing:
  hair: "3px"
  cell-gap: "4px"
  cell-pad: "6px 3px"
  label-gap: "10px"
  action-gap: "18px"
  row-gap: "24px"
  column-gap: "48px"
components:
  button-primary:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.on-color}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "13px 20px"
  button-primary-hover:
    backgroundColor: "{colors.indigo-hover}"
    textColor: "{colors.on-color}"
  button-primary-night:
    backgroundColor: "{colors.night-indigo}"
    textColor: "{colors.night-indigo-ink}"
    rounded: "{rounded.button}"
    padding: "13px 20px"
  button-primary-night-hover:
    backgroundColor: "{colors.night-indigo-hover}"
    textColor: "{colors.night-indigo-ink}"
  link-quiet:
    textColor: "{colors.muted-ink}"
    typography: "{typography.label}"
  day-cell:
    backgroundColor: "{colors.card-paper}"
    textColor: "{colors.muted-ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.day}"
    padding: "{spacing.cell-pad}"
  day-cell-past:
    backgroundColor: "{colors.past-ground}"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.day}"
  chip-needs:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-color}"
    typography: "{typography.chip}"
    rounded: "{rounded.chip}"
    height: "clamp(34px, 12%, 64px)"
  chip-goal:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.on-color}"
    typography: "{typography.chip}"
    rounded: "{rounded.chip}"
    height: "clamp(34px, 12%, 64px)"
  chip-done:
    backgroundColor: "{colors.done-stone}"
    textColor: "{colors.done-ink}"
    typography: "{typography.chip}"
    rounded: "{rounded.chip}"
    height: "clamp(34px, 12%, 64px)"
  chip-needs-night:
    backgroundColor: "{colors.night-amber}"
    textColor: "{colors.night-amber-ink}"
    rounded: "{rounded.chip}"
  chip-goal-night:
    backgroundColor: "{colors.night-indigo}"
    textColor: "{colors.night-indigo-ink}"
    rounded: "{rounded.chip}"
  chip-done-night:
    backgroundColor: "{colors.night-done-stone}"
    textColor: "{colors.night-done-ink}"
    rounded: "{rounded.chip}"
  footer:
    textColor: "{colors.muted-ink}"
    typography: "{typography.label}"
    padding: "clamp(10px, 1.8vh, 16px) 0 0"
---

# Design System: NetworkQuest

## Overview

**Creative North Star: "The Desk Calendar"**

NetworkQuest looks like a well-kept paper calendar on a warm desk: off-white cards on a warm stone ground, dark warm ink, hairline rules, and two colored signals that say what you owe and what is coming. The landing page (`public/landing.html`) and the app (`public/index.html`) share this one world. The landing page shows the product's own mechanism, a 28-day window of day cells with meetings placed by hour, so the visual vocabulary is the app's vocabulary at a larger scale. It is not a separate marketing skin.

Density is calm and practical. Hierarchy comes from Inter's weight range (400 to 800) and from fill, not from extra hues, ornament or imagery. Depth is mostly tonal: cards lift off the ground through a lighter surface and a 1px hairline, with only a faint ambient shadow. Motion is short and settles with a long exponential ease-out, and it always turns off under reduced motion.

Dark mode is a first-class pair, not an inversion: a near-black warm ground, slightly raised cards, lighter indigo and amber, and dark ink on those fills.

**Key Characteristics:**
- Warm neutral ground and card, warm near-black ink; no cool greys.
- Exactly two signal hues: amber for "owed / behind", indigo for "ahead" and the one action.
- Rounded containers with a 1px hairline; radius grows with the container's size.
- One typeface, Inter, self-hosted, with weight carrying hierarchy and tabular numerals for dates and hours.
- Soft, ambient depth; a lift on hover, never a hard shadow.
- Light and dark mode both fully specified through the same custom-property names.

## Colors

A warm paper palette with one indigo and one amber, each paired with its own ink color.

### Primary
- **Calm Indigo** (`indigo`; night `night-indigo`): goals and upcoming meetings, the primary button, the accent half of the wordmark ("Quest"), focus rings and text selection (28% mix). It is the only color that means "do this" or "this is ahead". Hover deepens to `indigo-hover` in light mode and lightens to `night-indigo-hover` in dark.

### Secondary
- **Deep Amber** (`amber`; night `night-amber`): meetings that still need notes, the "Needs notes" legend and detail tag. It means work you owe. The landing value is deepened from the app's original so white chip text clears 4.5:1 (5.7:1 on `amber`, versus 4.25:1 on the app's value).

### Neutral
- **Warm Paper Ground** (`paper-ground` / `night-ground`): page background.
- **Card Paper** (`card-paper` / `night-card`): day cells, cards, tiles, the nav pill.
- **Past Ground** (`past-ground` / `night-past`): days already behind you, one step darker than a card so the past recedes.
- **Warm Ink** (`warm-ink` / `night-ink`): body text, day numerals, the today rule and today border, emphasized footer text.
- **Muted Ink** (`muted-ink` / `night-muted`): weekday letters, hour marks, the quiet sign-in link, footer copy. Deepened on the landing page to 5.3:1 on the ground (light) and 6.8:1 (dark).
- **Hairline** (`hairline` / `night-hairline`): 1px borders on cells and cards, the footer rule.
- **Done Stone** (`done-stone` with `done-ink`; night `night-done-stone` with `night-done-ink`): finished meetings. Done stays neutral on purpose, so only open work carries a hue.
- **On-Color White** (`on-color`): text on indigo and amber fills in light mode only.

### Named Rules
**The Two Signals Rule.** Amber means owed, indigo means ahead or act. Finished work goes neutral stone. Do not add a third status hue.

**The Paired Ink Rule.** Every colored fill has a paired ink token: white in light mode, and `night-indigo-ink` or `night-amber-ink` in dark. Never hard-code white text on a fill, because the dark-mode fills are light.

**The Contrast Floor Rule.** Amber and muted ink use the deepened landing values, which clear 4.5:1 as text and as chip grounds. Do not go back to the lighter originals for new surfaces.

## Typography

**Display Font:** Inter (self-hosted `/fonts/inter-latin.woff2`, weights 400 to 800, with system-ui, -apple-system, Segoe UI, sans-serif)
**Body Font:** Inter (same file)

**Character:** One humanist grotesk at several weights. Character variants `cv11` and `ss01` are on for the whole page, which gives a single-storey a and open digits. The wordmark is set heavy and tight; everything else is plain and readable.

### Hierarchy
- **Display** (800, clamp 40 to 92px, 0.95, -0.04em): the "NetworkQuest" wordmark on the landing page, with "Quest" in indigo. The app uses the same two-tone wordmark at 16px, 700.
- **Headline** (400, clamp 16 to 22px, 1.45, max 38ch, balanced wrap): the one-line pitch.
- **Body** (400, 16px, 1.5): landing copy and the detail line (clamp 14 to 16px, max 90ch, clamped to 2 lines, 3 on phones). The app body runs at 15px / 1.6.
- **Title** (600, 13px, tabular): day numerals inside day cells.
- **Label** (600, 13px): legend labels, the button (600 at clamp 15 to 17px), footer text (13px, 12px on phones, emphasis in 600 ink).
- **Chip** (700, 12px, 0.02em, line-height 1): initials inside meeting chips; on phones 10.5px, no tracking, showing the first name.
- **Caption** (400, 11px, tabular): weekday letters and the 9am / 5pm hour marks.

### Named Rules
**The One Face Rule.** Inter only, self-hosted, never a system display face. Weight, size and color create hierarchy.

**The Tabular Time Rule.** Dates, day numerals and hours use tabular numerals so columns line up.

## Layout

The landing page is a single viewport that never scrolls (`100dvh`, overflow hidden), laid out as a four-row grid: top bar, the day strip (which takes the leftover height), the detail line, the footer. Page padding scales with the viewport (clamp 20 to 64px top, 16 to 96px sides, 16 to 40px bottom), and row gaps are clamp 14 to 28px.

The day strip is 28 equal columns with a 4px gap, 14 days back and 14 ahead, with today in the middle. Chips are placed vertically by hour between 9am and 5pm. The legend sits directly over the strip, split at the center: amber "Needs notes" to the left of today, indigo "Goals ahead" to the right.

At 760px and below, the top bar stacks, the button goes full width, and the strip becomes 7 columns by 4 rows with a 3px gap. Today starts the third row and gets a horizontal ink rule across its week. Hour marks hide. Chips dock to the bottom of each cell. Below 560px tall on desktop, the pitch hides to protect the strip.

The app uses the same 7-column, 4px-gap calendar grid, plus a 4-column bento of tiles with a 12px gap.

## Elevation & Depth

The system is tonal first. Cards are lighter than the ground and carry a hairline; past days sit a step darker. Shadows are faint and ambient, and they get stronger only in response to interaction.

### Shadow Vocabulary
- **Ambient** (`box-shadow: 0 1px 2px rgba(40,35,25,.05), 0 6px 20px rgba(40,35,25,.06)`; dark `0 1px 2px rgba(0,0,0,.35)`): the primary button. The app's cards and tiles use a lighter version (`.04` / `0 4px 16px .05`; dark `.3`).
- **Lift** (`box-shadow: 0 6px 16px rgba(30,25,15,.18)` with `translateY(-2px)`): a chip on hover, focus or selection.
- **Overlay** (app: `0 12px 32px rgba(0,0,0,.14)` for menus, `0 24px 80px rgba(0,0,0,.25)` for dialogs): floating layers only.

### Named Rules
**The Flat-At-Rest Rule.** Surfaces rest flat on tone and hairline. A shadow that is stronger than ambient appears only for hover, focus, selection or a floating layer.

## Shapes

Every container is softly rounded, and the radius grows with the container: legend swatch 3px, focus ring 6px, chip 7px, day cell 10px, button 12px, app card 16px, tile 18px, dialog 22px. On phones, day cells drop to 8px and chips to 5px. Borders are always 1px hairlines; the only heavier line is the 2px today mark. Status in the app also uses full pills (99px) for tags.

## Components

### Buttons
Solid, quiet and confident: one filled indigo action per view.
- **Shape:** gently rounded (12px).
- **Primary:** indigo fill with its paired ink, 600 weight, 13px 20px padding, an optional 20px inline SVG icon with a 10px gap, ambient shadow.
- **Hover / Focus:** the fill moves to the hover token over 0.2s on the system ease; when pressed it drops 1px (`translateY(1px)`); focus shows a 2px indigo outline offset 3px.
- **Quiet link:** a muted 14px text link that turns ink on hover. It is used for the secondary action ("Sign in"), next to the primary button with an 18px gap.
- **App buttons:** the app's default button is a card-filled, hairline-bordered 13px button (9px radius) whose border tints toward indigo on hover. Its `primary` variant is the indigo fill.

### Chips
- **Style:** filled, borderless 7px rectangles with 700-weight 12px text, centered. Needs-notes uses an amber fill, goal an indigo fill and done a stone fill, each with its paired ink.
- **State:** hover, focus and `aria-pressed="true"` all lift 2px and add the Lift shadow. The selected chip fills the detail line with that meeting's note or goal.
- **Motion:** on load, chips settle from `opacity .75; translateY(12px)` over 0.9s on the system ease. Each chip waits 120ms plus 45ms per day of distance from today, so they ripple outward from today. Reduced motion removes both the animation and the transition.
- **App variant:** inside the app's month calendar and lists, chips use soft tinted grounds with colored text instead of solid fills. Same hues, same meanings.

### Day Cell (signature component)
- **Corner Style:** 10px (8px on phones).
- **Background:** card paper; past days use the past ground.
- **Border:** 1px hairline. Today's border becomes ink, and a 2px ink rule runs from above the legend line to the cell's foot, just left of today.
- **Content:** a muted narrow weekday letter over a 600-weight ink numeral, tabular, centered, 6px 3px padding.

### Footer
- **Style:** a hairline top rule, muted 13px text, the "Not affiliated with Boardy." statement in 600 ink, and a boundaries line separated by middots. It wraps into two columns with a 6px 32px gap, and long copy swaps to short copy on phones.

### Navigation (app)
- **Style:** a card-colored pill (11px radius, hairline, 3px padding) holding 14px muted tab buttons. The active tab gets the paper-ground fill, ink text and 600 weight. The sticky header uses an 85% ground mix with a 10px backdrop blur and a hairline bottom border.

### Inputs (app)
- **Style:** paper-ground fill, 1px hairline, 10px radius, 9px 11px padding, inherited Inter.

## Do's and Don'ts

### Do:
- **Do** take every color from the shared custom-property names (`--bg`, `--card`, `--ink`, `--muted`, `--line`, `--accent`, `--warn`) so light and dark mode stay paired.
- **Do** put text on a colored fill in that fill's ink token (white in light; `#11132b` on night indigo, `#2a1a08` on night amber).
- **Do** use the deepened amber (#9a5516) and muted ink (#67635b) on new surfaces.
- **Do** use the system ease `cubic-bezier(.16,1,.3,1)` for transitions (0.2s for buttons, 0.25s for chips), and disable motion under `prefers-reduced-motion`.
- **Do** draw icons as inline SVG in `currentColor`, sized 20px inside buttons.
- **Do** keep the "Not affiliated with Boardy." line visible in the footer of every presented surface.

### Don't:
- **Don't** add a third status hue; done is neutral stone.
- **Don't** hard-code `#fff` text on indigo or amber; in dark mode those fills are light and white fails contrast.
- **Don't** use hard offset shadows or heavy borders; depth is tone, hairline and soft ambient shadow.
- **Don't** introduce a second typeface or fall back to a system display face for the wordmark.
