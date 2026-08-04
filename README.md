# Bannerlord Character Builder

Plan a Mount & Blade II: Bannerlord character — attributes, focus points,
skills, and all 374 perks — with the exact rules of game version **v1.4.7**,
extracted from the shipped assemblies (not the wiki).

**Use it:** open `index.html` (or the hosted page). Everything runs client-side
in one self-contained file; the URL hash carries your whole build, so
**Copy share link** gives a permanent, shareable URL.

## Rules implemented

Two modes, because the game has two point models:

- **Campaign/Sandbox character** (default): the real player path — every
  attribute starts at 2 free (`SetMainHeroInitialStats`), each character-
  creation stage choice grants +1 attribute, +1 focus and +10 levels to its
  skills (all budget-exempt), the starting-age choice grants unspent points
  (20/30/40/50 → +1/+2/+3/+4 attr, +2/+4/+6/+8 focus), and level-ups add
  +1 focus per level, +1 attribute per 4 levels. Pick culture and the six
  stages in the top bar; the builder seeds everything exactly.
- **Wanderer/NPC**: 15 attribute points + 5 focus at start
  (`HeroDeveloper.SetupDefaultPoints`) — the model NPC heroes use.
- Skill cap: `max(0, (attribute − 1) × 10) + focus × 30`
- Learning rate: `1.25 × (1 + 0.4·attr + focus)`, collapsing by `1 + 0.1` per
  point over cap (`DefaultCharacterDevelopmentModel.CalculateLearningRate`)
- Perk tiers unlock at skill 25/50/…/300; one choice per exclusive pair
- Icons are the game's own sprites, extracted from its texture archives

## Share-link versioning

Links encode indices into the data arrays, so their meaning depends on the
data version that minted them. Format `2.<ver>.…` carries a 4-hex data-version
key; `versions.json` is an append-only registry of every ordering a build has
shipped, embedded into the page. Old links decode against their own version's
ordering and remap by stable id — a future game patch that adds or reorders
perks won't corrupt existing links. (Scheme borrowed from
[owtt](https://github.com/alcaras/owtt).)

## Rebuilding

`data.json`, `icons*.png`, and `icons.json` are generated from the game files
by the extraction scripts in the companion `bannerlord` analysis repo
(`sim/extract_builder_data.py`, `sim/extract_icons.py`). Then:

```
python3 build_page.py     # stitches app.js + app.css + data + icons -> index.html
```

`index.html` is committed so the repo works as a GitHub Pages site as-is.
