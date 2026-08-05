# Full context: the real app, the real game, the real assets

This design system recreates the **character developer screen from Mount &
Blade II: Bannerlord** as a web app (a character build planner). Everything in
this folder is real: actual screenshots of the game UI being imitated, actual
screenshots of the current web app, the game's actual icon art, and the
complete extracted game data. Design with these, not with placeholders.

## Reference screenshots

**The game (the target aesthetic — match this):**

- `game-skill-screen-full.jpg` — the whole in-game screen: skills grid on the
  left (6 attribute rows × 3 skill tiles), perk track on the right with the
  **green trainable window**, gold = chosen perks, black = rejected
  alternatives, silver = not yet reached. Note the value pin (top) and cap pin
  (bottom) flanking the track.
- `game-skill-screen-level25.jpg` — same screen for a level-25 character; all
  perks still silver (none chosen). Good reference for tile typography:
  amber skill values, orange values when a skill is over its learning cap.
- `game-perk-states-smithing.jpg` — Smithing selected: two gold (chosen) and
  two black (rejected) perks at the far left, then silver. This is the
  chosen/rejected/unreached color language the app must keep.
- `game-naval-skills-row.jpg` — the War Sails DLC adds a 7th row: three naval
  skills (Mariner, Boatswain, Shipmaster) that each key off TWO attributes;
  they sit in their own bottom row spanning the grid.

**The current web app (what we're polishing):**

- `app-full.png` — the live page today: origin bar on top, skills grid left,
  detail pane (perk track + info box) right, chosen-perks summary below.
- `app-origin-bar.png`, `app-skill-grid.png`, `app-detail-pane.png`,
  `app-summary.png` — section crops of the same.

## Real icon art (usable in designs)

The actual game icons ship here as two sprite sheets plus a coordinate index:

- `icons.png` — 1056×836 **luminance+alpha mask sheet**: flat perk/attribute
  silhouettes. Render with CSS masking so state can tint them:
  `mask-image: url(icons.png); mask-position: -Xpx -Ypx; mask-size: 1056px 836px;`
  with `background-color: currentColor` on the element.
- `icons_color.png` — 1056×176 **RGBA color sheet**: the 21 skill mosaic
  paintings. Render as `background-image` with `background-position: -X -Y`
  and `background-size: 1056px 176px` (masking these gives blank squares —
  they're opaque art).
- `icons.json` — `{w, h, cw, ch, index}`; `index` maps keys like
  `"perk:OneHandedWrappedHandles"` / `"skill:OneHanded"` to
  `[x, y, cellSize, kind]` where kind `"m"` = mask sheet, `"c"` = color sheet.
  Cells are 44px; scale by `desiredSize / cellSize`.

The kit's `SkillTile`/`PerkShield` icon props are ReactNodes — pass a span
styled as above to show real art in a design.

## Real game data (use real names and numbers)

- `data.json` — the complete extracted ruleset:
  - `attributes`: 6 (Vigor, Control, Endurance, Cunning, Social, Intelligence),
    with abbreviations VIG/CTR/END/CNG/SOC/INT and descriptions.
  - `skills`: 21 — 18 base (3 per attribute) + 3 naval (`attributes` array has
    two entries for those, e.g. Mariner = endurance + cunning).
  - `perks`: all 436, each with `name`, `skill`, `tier`, `requiredSkill`
    (25/50/75/…/300), `descriptions`, and `effects` tagged by role
    (Personal / Party Leader / Captain / Governor / Quartermaster / …).
    Perks at the same tier are either/or pairs — choosing one rejects the other.
  - `skillPointsRequiredForLevel`, `xpRequiredForSkillLevel` — progression curves.
- `origin.json` — character-creation stages (culture, family, childhood,
  education, youth, adulthood, story/age) with every option's label,
  description, and grants. This feeds the origin bar's dropdowns.

When mocking content, pull real rows from these files — e.g. One Handed tier-1
pair is "Wrapped Handles" vs "Basher"; a populated tile might be
One Handed 61 with 4 focus pips.

## Game rules that constrain layout

- Skill value cap comes from focus + attribute (the green window's right edge);
  values past the cap render orange and learn at a heavy penalty.
- Focus is 0–5 pips per skill; attributes are 0–10ish; unspent points show in
  the two circled counters at the panel header (left = attributes, right = focus).
- Perk columns sit at their `requiredSkill` positions along the track; a
  column can hold 1 (centered) or 2 (stacked either/or) shields.
- The summary groups chosen perks by role (Personal, Party Leader, Captain,
  Governor, …) and lists concrete effect lines, not just perk names.
