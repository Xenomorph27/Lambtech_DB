# Design spec — the dark operations-desk system

Everything needed to reproduce this look in another project. Tailwind 4 CSS-first
(`@theme`, no `tailwind.config.js`), but every value is plain CSS and ports to
anything.

Copy order: **1. tokens → 2. base layer → 3. screen tinting → 4. texture → 5. the
`--screen` setter in the shell.** Steps 3 and 4 do nothing until step 5 exists.

---

## 1. The idea in one paragraph

Flat dark interfaces read as dead plastic: nothing catches light, so every
surface looks like the same sheet of card. This system fixes that with three
systemic touches (grain, atmosphere, lift) rather than ornament per component,
and it keeps colour *meaningful*: **hue carries information, never decoration.**
Blue is reserved for interaction, warm hues for urgency, and each screen owns a
hue that appears **only in the furniture** — sidebar, header, hover tints — and
**never inside a data cell**. Because the two never land in the same place, a
coloured thing is never ambiguous.

One more rule that does a lot of work: **chrome sits *below* the content in
value.** The sidebar and header are darker than the panel, so the data reads as
the lit surface you are working on instead of everything floating at one level.

---

## 2. Tokens

```css
@theme {
  /* Surfaces. Deeper ground and wider steps between levels than a flat dark
     theme: that separation stops a dense screen reading as one grey slab.
     Hued blue rather than tinted black, so it never looks muddy. */
  --color-ground:      #060910;   /* page behind everything */
  --color-panel:       #0d121b;   /* the working surface */
  --color-raised:      #161e2c;   /* cards, hover on chrome */
  --color-raised-2:    #212b3c;   /* inputs, nested cards */
  --color-rule:        #2c3849;   /* hairlines */
  --color-rule-strong: #40506a;   /* scrollbar thumb, strong dividers */

  /* Chrome — DARKER than the panel. This is the inversion that matters. */
  --color-chrome:      #03050a;   /* sidebar */
  --color-chrome-2:    #080c14;   /* page header base */

  /* Text. Primary is 17.6:1 on the panel; both secondaries clear the 4.5:1
     body-text floor, so nothing is decorative-only grey. */
  --color-ink:   #f4f8ff;
  --color-ink-2: #b4c4dc;
  --color-ink-3: #8093b0;

  /* Interaction. Blue appears in NO status ramp, so anything blue is actionable. */
  --color-accent:       #3d9bff;
  --color-accent-hover: #6ab4ff;
  --color-accent-ink:   #04121f;  /* text on an accent fill */
  --color-accent-wash:  #10294a;  /* selection, subtle fills */

  /* Ordinal data reads as ONE heat ramp, not five unrelated colours: loud
     solid fill at the top, cooling through orange and gold, receding to a
     bare outline. Crimson→orange measures deltaE 10.6 under deuteranopia. */
  --color-heat-1: #ff2d55;
  --color-heat-2: #ff8a3d;
  --color-heat-3: #ffc61a;
  --color-heat-4: #a3b8d6;
  --color-heat-5: #5c6b85;

  /* Text on the solid heat-1 fill. Near-black, not white: white measured only
     3.65:1 at chip size. This reads 5.2:1 and lets the fill stay full strength
     instead of being darkened to rescue the text. */
  --color-heat-1-ink: #2b0008;

  /* Binary outcomes */
  --color-won:  #00e093;
  --color-lost: #77879f;

  --font-sans: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;

  /* Dense scale. 13px body is the default; rows land 34-36px. */
  --text-2xs: 0.6875rem;  --text-2xs--line-height: 1rem;
  --text-xs:  0.75rem;    --text-xs--line-height:  1.125rem;
  --text-sm:  0.8125rem;  --text-sm--line-height:  1.25rem;
  --text-base:0.875rem;   --text-base--line-height:1.375rem;

  --radius-control: 5px;  /* buttons, chips, rows */
  --radius-panel:   8px;  /* cards, drawers */
}
```

**Why the steps are wide.** `#060910 → #0d121b → #161e2c → #212b3c` is a large
jump per level on purpose. Narrow steps are what make a dense dark screen
collapse into one grey slab.

---

## 3. Base layer

```css
@layer base {
  html { color-scheme: dark; }

  body {
    background-color: var(--color-ground);
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    line-height: var(--text-sm--line-height);
    -webkit-font-smoothing: antialiased;
  }

  /* Numbers in a column must align digit-to-digit to be scannable. */
  .tnum {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-feature-settings: "zero" 1;
  }

  /* One visible focus treatment everywhere. Dense dark UI is the easiest place
     to lose a keyboard user, so this is never removed. */
  :focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: 3px;
  }

  ::selection { background: var(--color-accent-wash); color: var(--color-ink); }

  /* Scrollbars belong to the app, not the OS. */
  * { scrollbar-width: thin; scrollbar-color: var(--color-rule-strong) transparent; }
  *::-webkit-scrollbar { width: 10px; height: 10px; }
  *::-webkit-scrollbar-thumb {
    background: var(--color-rule-strong);
    border: 3px solid var(--color-ground);   /* inset trick: fakes a track gap */
    border-radius: 999px;
  }
  *::-webkit-scrollbar-thumb:hover { background: var(--color-ink-3); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 4. Screen tinting — the per-route hue

`--screen` is declared **once** on the app shell from the current route and
inherited by everything beneath it, so the whole interface re-tints on
navigation with **no prop threading**.

```jsx
// AppShell.jsx
const theme = screenTheme(pathname)

<div
  className="flex h-screen overflow-hidden bg-ground transition-colors duration-200"
  style={{ '--screen': theme.accent }}
  data-screen={theme.key}
>
```

The `transition-colors duration-200` on the shell, the header and the panel is
what keeps navigation from being a hard colour cut. `data-screen` is there for
per-screen CSS escapes if you ever need one.

```css
/* The working surface, barely inflected by the screen's hue. */
.surface-screen {
  background-color: color-mix(in oklab, var(--screen, #3d9bff) 3%, var(--color-panel));
}

/* The page header, tinted harder than the panel so the top announces where you are. */
.header-screen {
  background-color:  color-mix(in oklab, var(--screen, #3d9bff)  9%, var(--color-chrome-2));
  border-bottom-color: color-mix(in oklab, var(--screen, #3d9bff) 22%, var(--color-rule));
}

/* Row and card hover - the screen hue, not a neutral grey, so the pointer
   feels like it belongs to this screen. */
.hover-screen:hover {
  background-color: color-mix(in oklab, var(--screen, #3d9bff) 11%, transparent);
}

/* Selected row: same hue, held at a strength that survives next to hover. */
.selected-screen {
  background-color: color-mix(in oklab, var(--screen, #3d9bff) 20%, transparent);
  box-shadow: inset 2px 0 0 0 var(--screen, #3d9bff);
}

/* Column hover - board columns and table headers. Weaker than row hover, so
   crossing a cell reads as "row" first. */
.hover-column:hover {
  background-color: color-mix(in oklab, var(--screen, #3d9bff) 5%, transparent);
}

/* A hairline under the header: the one place the identity is at full strength. */
.rule-screen { background-color: var(--screen, #3d9bff); }
```

**The percentage ladder is the whole spec.** Learn these numbers and the system
is portable:

| Use | Strength | Why |
|---|---|---|
| Working surface | **3 %** | present, not noticeable |
| Column hover | **5 %** | weaker than row hover on purpose |
| Header fill | **9 %** | furniture may be tinted; data may not |
| Row hover | **11 %** | the loudest transient state |
| Selected row / count badge / active nav | **20–22 %** | the loudest persistent state |
| Header hairline, nav edge bar | **100 %** | ~2 px only, stated once |

`color-mix(in oklab, …, transparent)` mixes in *perceptual* space, so 11 % of
yellow and 11 % of violet feel equally strong. sRGB mixing does not — the yellow
would shout. And mixing against `transparent` rather than a surface colour means
the same class works over panel, card and raised without variants.

### The hue map

```js
const SCREENS = {
  '/':              { key: 'overview',      label: 'Overview',      accent: '#3d9bff' },
  '/todo':          { key: 'todo',          label: 'Todo',          accent: '#ff6f59' },
  '/leads':         { key: 'leads',         label: 'Leads',         accent: '#17c8d4' },
  '/orders':        { key: 'orders',        label: 'Orders',        accent: '#55d94f' },
  '/returns':       { key: 'returns',       label: 'Returns',       accent: '#2f9e4f' },
  '/logistics':     { key: 'logistics',     label: 'Logistics',     accent: '#9b6dff' },
  '/inventory':     { key: 'inventory',     label: 'Inventory',     accent: '#e8d44a' },
  '/customers':     { key: 'customers',     label: 'Customers',     accent: '#2fd08a' },
  '/organisations': { key: 'organisations', label: 'Organisations', accent: '#7b85ff' },
  '/emails':        { key: 'emails',        label: 'Emails',        accent: '#d96bff' },
  '/campaigns':     { key: 'campaigns',     label: 'Campaigns',     accent: '#ff7eb6' },
  '/insights':      { key: 'insights',      label: 'Insights',      accent: '#e863d9' },
  '/statistics':    { key: 'statistics',    label: 'Statistics',    accent: '#ffb03a' },
  '/users':         { key: 'people',        label: 'People',        accent: '#a8d94a' },
}
const FALLBACK = { key: 'other', label: '', accent: '#8093b0' }
```

**Rules for picking hues in a new project**

1. Every accent clears **7:1 against chrome** (`#03050a`), because it is used for
   text and icons, not only fills.
2. Separation only matters for **screens adjacent in the sidebar** — they are the
   only ones ever seen together. Those pairs clear **49°** here. Non-adjacent
   screens sit as little as 24° apart and it is invisible, because exactly one
   is on screen at a time and its name is written next to it.
3. Two screens that are **the same data inverted** should share a hue as a
   deeper step, not claim a new one. Orders `#55d94f` / Returns `#2f9e4f` are 20°
   apart deliberately, so the colour says "sibling".
4. The exception that bit me: Statistics and Insights share a sidebar group, so
   they *are* read side by side. At amber and yellow they were 16° apart —
   unreadable as distinct. Insights moved to magenta. **Check group-mates first.**

---

## 5. Surface texture — the three systemic touches

### 5.1 Grain

A fixed, non-interactive film of noise over everything. It breaks up large flat
fills and stops gradients banding on cheap panels. Generated inline, so it costs
no network request.

```css
body::after {
  content: "";
  position: fixed; inset: 0;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.035;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

`opacity: 0.035` is the number to tune — at 0.06 it reads as dirt, at 0.02 it
does nothing. `stitchTiles='stitch'` is required or the 160 px tile seams show.
`pointer-events: none` is non-negotiable at that z-index.

### 5.2 Atmosphere (the faint background light)

A wide, soft wash of the screen's hue bleeding down from the top of the working
surface — the light the header casts onto the desk. **This is the "faint
background light".**

```css
.glow-screen { position: relative; isolation: isolate; }
.glow-screen::before {
  content: "";
  position: absolute; inset: 0 0 auto 0;   /* top strip only */
  height: 220px;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(
    120% 100% at 50% 0%,
    color-mix(in oklab, var(--screen, #3d9bff) 13%, transparent) 0%,
    transparent 70%
  );
}
```

Three details carry it: `isolation: isolate` keeps `z-index: -1` from escaping
behind the page background; the ellipse is **120 % wide × 100 % tall anchored at
`50% 0%`**, so the falloff is lateral as well as vertical; and it stops at
`70%`, not `100%`, so the bottom two-thirds of the panel is genuinely neutral
and the tint never creeps under the data.

### 5.3 Lift

A one-pixel highlight along the top edge of raised things, as if a light source
sits above the desk, plus a shadow beneath to seat them. **This is what separates
a card from a rectangle.**

```css
.lift {
  box-shadow:
    inset 0 1px 0 0 rgba(255, 255, 255, 0.055),
    0 1px 2px 0 rgba(0, 0, 0, 0.45);
}
/* The same highlight where a shadow would be wrong, e.g. inside a panel. */
.lift-flat { box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.05); }
```

Note how small the shadow is — `0 1px 2px`. On a near-black ground a big soft
shadow is invisible; the **highlight** does the work, the shadow just seats the
edge. Resist the urge to scale it up.

---

## 6. Motion

Deliberately almost nothing. One orchestrated transition in the whole app, so
when something *does* move it means something.

```css
@keyframes drawer-in {
  from { transform: translateX(16px); opacity: 0.4; }
  to   { transform: translateX(0);    opacity: 1; }
}
@keyframes backdrop-in { from { opacity: 0; } to { opacity: 1; } }

.drawer-in   { animation: drawer-in 180ms cubic-bezier(0.22, 1, 0.36, 1); }
.backdrop-in { animation: backdrop-in 140ms linear; }
```

Everything else is `transition-colors duration-150/200`. `translateX(16px)` is a
short throw — the drawer is already nearly in place, it just settles.

---

## 7. Chrome specifics

**Sidebar** — `bg-chrome`, `border-r border-rule`, `w-[196px]` expanded /
`w-[52px]` collapsed, `transition-[width] duration-150`. Rows are `h-7`
(28 px), `rounded-control`, `gap-2`, 15 px icons.

Grouped by the job being done, not alphabetically — the grouping *is*
information. Group headings are `text-2xs text-ink-3`; when collapsed, each
heading becomes a `border-t border-rule` so the grouping survives.

Two touches worth stealing:

```jsx
/* Each nav row's ACTIVE state uses its own destination's hue, not the current
   screen's - so the palette teaches itself as you move around. */
style={({ isActive }) => isActive ? {
  backgroundColor: `color-mix(in oklab, ${accentFor(item.to)} 20%, transparent)`,
  boxShadow: `inset 2px 0 0 0 ${accentFor(item.to)}`,
} : undefined}

/* The brand mark carries --screen, so the logo doubles as a constant read-out
   of where you are. */
<span style={{ backgroundColor: 'var(--screen)' }}>C</span>
```

**Page header** — `header-screen h-11 border-b px-4`, title `text-base
font-medium tracking-tight`, then a `h-[2px] rule-screen` bar beneath it. The
live row count sits in the header in a 22 % `--screen` badge, because knowing
the size of the set is part of reading the screen.

**Panel** — `surface-screen glow-screen flex min-h-0 flex-1 flex-col`. Those two
classes together are the lit desk.

---

## 8. Table density

- `table-fixed border-separate border-spacing-0` — **`table-fixed` makes declared
  column widths authoritative.** With `auto`, the browser re-apportions by
  content and long cells steal space from short ones; two separate bugs here
  traced to that (emails truncating, every column collapsing to equal width).
- Header cells: `surface-screen hover-column border-b border-rule px-3 py-2
  text-xs`, sticky.
- Rows: `hover-screen`, or `selected-screen` when selected. Target **34–36 px**
  and never let a cell wrap — one wrapping cell silently doubles every row
  (a 54.8 px row height here traced to a "3 months ago" column squeezed to 80 px).
- Sort indicator: `inset 0 -2px 0 0 var(--screen)` on the active `<th>`.
  **One `style` object per element** — a second `style` prop silently replaces
  the first in React, which is how the column widths got dropped.
- Every numeric column gets `.tnum`.

---

## 9. Chart colour

Three different jobs, three different answers. Picking one at random is how a
page ends up all one blue.

| Data shape | Answer |
|---|---|
| **Ordinal** (status, priority, stage) | Reuse the app's own ramp, so a bar for "Processing" is the colour Processing already is everywhere else |
| **Categorical** (unrelated identities) | The validated set below, assigned in **fixed order, never cycled** |
| **Magnitude** (one measure, many rows) | **One hue.** Different colours per row would imply the rows are different *kinds* of thing rather than different *sizes* of the same thing |

```js
export const CATEGORICAL = [
  '#5b8ff9', // blue
  '#5ad8a6', // green
  '#f6bd16', // gold
  '#e8684a', // coral
  '#9270ca', // violet
  '#6dc8ec', // sky
]
const OVERFLOW = '#6b7a91'  // a 7th category folds into "Other", never wraps to slot 1
export const categorical = (i) => (i < CATEGORICAL.length ? CATEGORICAL[i] : OVERFLOW)

export const MAGNITUDE = '#ffb03a'                              // matches the Statistics hue
export const SERIES = { primary: '#5b8ff9', secondary: '#3fd4a2' } // deltaE 24
```

deltaE 12.0 at the closest pair under protanopia, 19.3 in normal vision —
measured with a palette validator, **not judged by eye**. Two palettes failed
review here before one passed, including one whose adjacent pair was only
deltaE 6.0 in *normal* vision.

Build one scale per page and share it, so a category is the same colour in every
chart on the screen:

```js
const categoryColour = useMemo(() => {
  const order = rows.map(r => r.key).filter(k => k !== 'Unattributed')
  const scale = new Map(order.map((k, i) => [k, categorical(i)]))
  return k => (k == null || k === 'Unattributed' ? '#6b7a91' : scale.get(k) ?? '#6b7a91')
}, [rows])
```

---

## 10. Non-obvious rules, learned the hard way

1. **Contrast is measured, not eyeballed.** A white-on-crimson chip measured
   3.65:1. The fix was a near-black ink token (5.2:1) — *not* dulling the fill.
   Dulling the fill would have cost the encoding.
2. **Fix contrast by changing the text, not the meaning.** Same point as a rule:
   the loud colour is carrying information. Protect it.
3. **Tailwind 4 skips git-ignored files.** An unanchored `lib/` in a root
   `.gitignore` (from a Python template) matched `src/lib/`, so every class
   defined only in that folder generated **no CSS at all** — half the heat ramp
   rendered as inherited body text. Anchor the rule (`/lib/`) *and* keep
   `@source "./**/*.{js,jsx}";` as a guard.
4. **Never let hue be the only channel.** Every chip carries a label and its own
   fill treatment (solid → tinted → outline) alongside its colour.
5. **One `style` prop per element** in React. A second one replaces the first.
6. **Serial numbers are rendered, not stored** — `filtered.indexOf(row) + 1`. A
   stored serial breaks the first time a row is deleted or the table re-sorted.

---

## 11. Porting checklist

1. Copy `@theme`, the `@layer base` block, screen tinting and texture into your
   stylesheet. In plain CSS, replace `@theme` with `:root` and the
   `bg-panel`-style utilities with your own classes.
2. Write the hue map for your routes. Check **sidebar group-mates** for ≥49°
   separation and ≥7:1 against your chrome colour; let non-adjacent screens sit
   as close as they like.
3. Set `--screen` once on the shell from the route, with
   `transition-colors duration-200`.
4. Put `surface-screen glow-screen` on the scrolling panel, `header-screen` plus
   a 2 px `rule-screen` on the header, `hover-screen` / `selected-screen` on
   rows, `hover-column` on headers and board columns.
5. Add `body::after` grain at `opacity: 0.035`, and `.lift` on cards.
6. Pick your ordinal ramps and run them through a CVD validator before you ship.
   Lightness must be monotonic along the ramp; that is what makes it survive
   greyscale and colour blindness both.

**If you only take three things:** chrome darker than content; `--screen`
inherited from one place; `color-mix` in **oklab** at the 3/9/11/20 ladder.
