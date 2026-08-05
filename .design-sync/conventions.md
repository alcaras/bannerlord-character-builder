# Bannerlord Builder UI — conventions

This kit recreates the Mount & Blade II: Bannerlord character-developer screen:
a dark parchment aesthetic — near-black brown backdrop, gold/amber accents,
serif type. Every design built with it should read as game UI, not as a web
dashboard.

## Non-negotiables

- **Wrap every screen in `Root`.** It provides the `--bg` backdrop, the serif
  type stack, and the token scope. Nothing renders correctly outside it.
- **Stay on the token palette.** All 17 tokens, verbatim: surfaces `--bg`,
  `--panel`, `--tile`, `--tile2`; borders `--edge` (bright bevel), `--line`,
  `--line2`; text `--ink` (body), `--dim` (secondary), `--faint` (disabled);
  accents `--gold`, `--gold2` (hover/bright), `--amber` (big numeric values);
  `--green`/`--green2` (trainable range); `--red` (over budget / errors);
  `--serif` (the type stack). Do not introduce new colors — blues, purples,
  and pure grays break the theme instantly.
- **Fonts are the system-serif stack in `--serif` by design.** There are no
  webfonts to load; do not add any.
- **Icon slots are intentionally empty.** The real game art is injected by the
  host page and is not part of this kit. Leave `SkillTile`/`PerkShield` icon
  areas as the components render them — never substitute emoji, external
  images, or icon fonts.

## Composition patterns (how the real page uses these parts)

- The skill screen's row unit is `AttributeRow`: one `AttributeTab` (attribute
  abbreviation, big value, `Stepper`) beside three `SkillTile`s sharing that
  attribute. Dual-attribute (naval) skills sit in an extra bottom row.
- `SkillTile` = name bar + icon slot + big amber value + `FocusPips`. States:
  `selected`, `overCap` (value exceeds the focus/attribute cap), `zero`.
- `PerkTrack` is the horizontal perk band for one skill: parchment strip,
  green trainable window up to the cap, tier columns of `PerkShield`s, and
  value/cap pins. Shield states: default silver, `selected` gold, `rejected`
  black (the alternative you gave up), `locked` dim.
- `Panel` sections a screen; its header centers a title with left/right slots —
  `PointCounter` (unspent attribute/focus points, `over` turns red) belongs in
  those slots.
- `InfoBox` is a fixed-height hover readout — it must never grow and push
  layout around (that was a real bug in the original page).
- `SummaryList` groups chosen perks by role with effect lines; `SelectField`
  is the origin bar's field unit; `Toast` is bottom-center feedback; `Button`
  is parchment chrome with a `primary` variant.

## Density

This is game UI: compact, information-dense, hover-driven. Prefer tightening
spacing over enlarging cards, and keep big numerals (`--amber`, `--serif`) as
the visual anchors of each tile.
