# bannerlord-ui sync notes

- The DS lives in `ds/` INSIDE the char-builder app repo; it componentizes the
  live page's UI. Class names match `app.css` on purpose — designs built in
  Claude Design port back to the vanilla-JS page nearly 1:1.
- `ds/src/styles.css` is GENERATED from the app's `app.css` (page-level rules
  stripped, `.bl-root`/`.bl-panel` added). If `app.css` changes, re-run the
  extraction snippet in git history (commit that added ds/) or hand-port.
- Icons are deliberately slots (ReactNode) — the game-derived icon sheets stay
  in the app, out of the DS bundle.
- Converter runs with `--entry ./ds/dist/index.js --node-modules ./ds/node_modules`
  (package is not self-installed in node_modules).

## Known render warnings (accepted)

- `[FONT_MISSING]` "Iowan Old Style" / "Palatino Linotype" / Palatino / Georgia:
  the `--serif` stack is deliberately system fonts — no webfonts ship. Accepted,
  non-blocking; do not add `cfg.extraFonts`.
- Grid-overflow cards fixed via `cfg.overrides` (InfoBox/Panel/PerkTrack/Root/
  SummaryList = column cards; Toast = single card, primaryStory Visible).
  Keep those overrides when re-syncing.

## guidelines/ = full context for the design agent (manual assembly)

The project's `guidelines/` folder gives Claude Design the real game context:
game screenshots, live-app screenshots, the icon sprite sheets, and the full
data. The converter's `guidelinesGlob` only carries .md files, so after any
rebuild that wipes `ds-bundle/`, re-assemble before close-out:

1. `cp .design-sync/guidelines/* ds-bundle/guidelines/` (README + game shots)
2. `cp data.json origin.json icons.png icons_color.png icons.json ds-bundle/guidelines/`
3. `node .ds-sync/shot.mjs` (fresh live-app screenshots; durable copy at
   `.design-sync/shot.mjs` — run from `.ds-sync/` so playwright resolves)

Then upload `guidelines/**` and re-arm the sentinel. The remote set is the
16 files listed in `guidelines/README.md`.

## Re-sync risks

- All 15 previews are user-authored in `.design-sync/previews/` — the converter
  generates 0. Deleting that dir loses the preview scenes; grades live in
  `.design-sync/.cache/review/`.
- `readmeHeader` stitches `.design-sync/conventions.md` into the uploaded
  README — conventions name real classes/tokens; re-validate them if `ds/src`
  changes.
- `.ds-sync/` staging (incl. `lib/`, `preview-rebuild.mjs`, and its local
  `node_modules` with playwright 1.58.0) is gitignored; a fresh clone must
  re-stage from the skill dir and `npm i playwright@1.58.0` there.
- If `app.css` changes, regenerate `ds/src/styles.css` FIRST, rebuild `ds/`
  (`npm --prefix ds run build`), then run the resync driver — otherwise the
  DS drifts from the live page.
