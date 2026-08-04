/* Bannerlord character builder.
   Layout mirrors the in-game Skills screen: attribute rows of three skill tiles
   on the left, selected-skill detail with a horizontal perk track on the right.
   Every rule is a port of the shipped model; see notes/06-character-builder.md. */

const C = DATA.constants;
const SKILLS = DATA.skills;
const ATTRS = DATA.attributes;
const PERKS = DATA.perks;
const PERK_INDEX = new Map(PERKS.map((p, i) => [p.id, i]));
const PERKS_BY_SKILL = {};
for (const p of PERKS) (PERKS_BY_SKILL[p.skill] ||= []).push(p);
for (const k in PERKS_BY_SKILL) PERKS_BY_SKILL[k].sort((a, b) => a.tier - b.tier);

const REQ = C.tierSkillRequirements;
const TRACK_MAX = REQ[REQ.length - 1];      // 300
// The game's parchment band begins at the first perk tier, not at zero —
// values below it put the marker on dark background, not on an empty strip.
const TRACK_MIN = REQ[0] - 13;              // 12
const MAX_SKILL = 330;

const state = {
  level: 1,
  attr: Object.fromEntries(ATTRS.map(a => [a.id, 0])),
  focus: Object.fromEntries(SKILLS.map(s => [s.id, 0])),
  skill: Object.fromEntries(SKILLS.map(s => [s.id, 0])),
  perks: new Set(),
  sel: SKILLS[0].id,
  // Origin (campaign/sandbox character creation). mode 'player' models the
  // real player path: base 2 per attribute + free stage grants + level-ups.
  // mode 'npc' is the old 15/5 wanderer model.
  mode: ORIGIN ? 'campaign' : 'npc',
  culture: ORIGIN ? ORIGIN.cultures[2] || ORIGIN.cultures[0] : null,   // empire default
  origin: ORIGIN ? ORIGIN.stages.map(() => null) : [],
};

/* ---------------- game rules ---------------- */
/* Origin helpers. 'campaign' (story) and 'sandbox' both use the player path;
   they differ in which stages exist: sandbox has Starting Age (unspent-point
   grants), campaign instead has the Story Background stage and starts at 20. */
const isPlayer = () => state.mode === 'campaign' || state.mode === 'sandbox';
const stageActive = st => !st.modes || st.modes.includes(state.mode);
function chosenOptions() {
  if (!isPlayer() || !ORIGIN) return [];
  return ORIGIN.stages.map((st, i) => stageActive(st)
    ? (st.options.find(o => o.id === state.origin[i]) || null) : null)
    .filter(Boolean);
}
function ageGrants() {
  let a = 0, f = 0;
  for (const o of chosenOptions()) { a += o.unspentAttr || 0; f += o.unspentFocus || 0; }
  return { a, f };
}
/* Free floor under each attribute: base 2 + stage grants (player mode). */
function attrFloor(id) {
  if (!isPlayer()) return 0;
  let n = ORIGIN.grants.baseAttribute;
  for (const o of chosenOptions()) if (o.attr === id) n += ORIGIN.grants.attribute;
  return n;
}
function focusFloor(skillId) {
  if (!isPlayer()) return 0;
  let n = 0;
  for (const o of chosenOptions())
    if ((o.skills || []).includes(skillId)) n += ORIGIN.grants.focus;
  return Math.min(n, C.maxFocusPerSkill);
}
function skillFloor(skillId) {
  if (!isPlayer()) return 0;
  let n = 0;
  for (const o of chosenOptions())
    if ((o.skills || []).includes(skillId)) n += ORIGIN.grants.skillLevel;
  return n;
}
const attrBudget = lv => isPlayer()
  ? Math.floor((lv - 1) / C.levelsPerAttributePoint) + ageGrants().a
  : Math.floor((lv - 1) / C.levelsPerAttributePoint) + C.attributePointsAtStart;
const focusBudget = lv => isPlayer()
  ? (lv - 1) * C.focusPointsPerLevel + ageGrants().f
  : (lv - 1) * C.focusPointsPerLevel + C.focusPointsAtStart;
/* Spent = what came out of the budget, i.e. value above the free floor. */
const attrSpent = () => ATTRS.reduce((n, a) => n + Math.max(0, state.attr[a.id] - attrFloor(a.id)), 0);
const focusSpent = () => SKILLS.reduce((n, s) => n + Math.max(0, state.focus[s.id] - focusFloor(s.id)), 0);
/* Origin floors are hard minima; commit() re-asserts them after any change. */
function applyFloors() {
  if (!isPlayer()) return;
  for (const a of ATTRS) state.attr[a.id] = Math.max(state.attr[a.id], attrFloor(a.id));
  for (const sk of SKILLS) {
    state.focus[sk.id] = Math.max(state.focus[sk.id], focusFloor(sk.id));
    state.skill[sk.id] = Math.max(state.skill[sk.id], skillFloor(sk.id));
  }
}

/* Changing origin/mode/culture must not leave residue: the old floors' share
   of each value is swapped for the new floors', keeping only what the user
   added on top. Without this, browsing options ratchets values upward and the
   ghost points eat the budget ("calc should have no more than what I put in"). */
function withFloorSwap(change) {
  const oldA = Object.fromEntries(ATTRS.map(a => [a.id, attrFloor(a.id)]));
  const oldF = Object.fromEntries(SKILLS.map(k => [k.id, focusFloor(k.id)]));
  const oldS = Object.fromEntries(SKILLS.map(k => [k.id, skillFloor(k.id)]));
  change();
  for (const a of ATTRS)
    state.attr[a.id] = attrFloor(a.id) + Math.max(0, state.attr[a.id] - oldA[a.id]);
  for (const k of SKILLS) {
    state.focus[k.id] = Math.min(C.maxFocusPerSkill,
      focusFloor(k.id) + Math.max(0, state.focus[k.id] - oldF[k.id]));
    state.skill[k.id] = Math.min(MAX_SKILL,
      skillFloor(k.id) + Math.max(0, state.skill[k.id] - oldS[k.id]));
  }
  commit();
}
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const skillById = id => SKILLS.find(s => s.id === id);

function attrAvg(skill) {
  const v = skill.attributes.map(a => state.attr[a] ?? 0);
  return v.reduce((x, y) => x + y, 0) / v.length;
}
// CalculateLearningLimit
const learningLimit = s => Math.max(0, (attrAvg(s) - 1) * 10) + state.focus[s.id] * 30;
// CalculateLearningRate — ExplainedNumber: base + base*sumFactors, floored at 0
function learningRate(s) {
  let f = 0.4 * attrAvg(s) + state.focus[s.id];
  const lim = Math.round(learningLimit(s));
  const v = state.skill[s.id];
  if (v > lim) f += -1 - 0.1 * (v - lim);
  return Math.max(0, C.baseLearningRate * (1 + f));
}
const perkUnlocked = p => state.skill[p.skill] >= p.requiredSkill;

/* ---------------- share link ----------------

Format 4 (current): 4.<dataVer>.<payload>
The payload is a byte array, base64url encoded, with ALL TRAILING ZERO BYTES
TRIMMED (the decoder zero-fills), so empty sections cost nothing:

    [0]  mode: 0 npc, 1 campaign, 2 sandbox
    [1]  level
    [2]  cultureIdx+1 (0 = none)
    [3..3+S)      per-stage option idx+1 (0 = none), S = stages in the
                  minting version's registry entry
    then 3 bytes  6 attribute nibbles (hi,lo per byte)
    then 9 bytes  18 focus nibbles
    then 36 bytes 18 skills as u16 LE (values reach 330)
    then 47 bytes perk bitmap over the minting version's perk ordering

Only format 4 decodes (the dotted b36 formats 1-3 were retired before anyone
linked to them; layouts in git history). Indices resolve through
VER.entries[dataVer] and remap by StringId, so links survive data reorders
across game patches. */
const b64url = u8 => btoa(String.fromCharCode(...u8))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = str => {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};

function encode() {
  const S = ORIGIN ? ORIGIN.stages.length : 0;
  const buf = new Uint8Array(3 + S + 3 + 9 + 36 + Math.ceil(PERKS.length / 8));
  buf[0] = state.mode === 'campaign' ? 1 : state.mode === 'sandbox' ? 2 : 0;
  buf[1] = state.level;
  buf[2] = ORIGIN ? ORIGIN.cultures.indexOf(state.culture) + 1 : 0;
  for (let i = 0; i < S; i++) {
    const oi = ORIGIN.stages[i].options.findIndex(o => o.id === state.origin[i]);
    buf[3 + i] = oi + 1;
  }
  let o = 3 + S;
  ATTRS.forEach((a, i) => {
    if (i % 2 === 0) buf[o + (i >> 1)] = state.attr[a.id] << 4;
    else buf[o + (i >> 1)] |= state.attr[a.id];
  });
  o += 3;
  SKILLS.forEach((sk, i) => {
    if (i % 2 === 0) buf[o + (i >> 1)] = state.focus[sk.id] << 4;
    else buf[o + (i >> 1)] |= state.focus[sk.id];
  });
  o += 9;
  SKILLS.forEach((sk, i) => {
    const v = state.skill[sk.id];
    buf[o + i * 2] = v & 0xff; buf[o + i * 2 + 1] = v >> 8;
  });
  o += 36;
  for (const id of state.perks) {
    const i = PERK_INDEX.get(id);
    if (i !== undefined) buf[o + (i >> 3)] |= 1 << (i & 7);
  }
  let end = buf.length;
  while (end > 0 && buf[end - 1] === 0) end--;
  return `4.${VER.cur}.${b64url(buf.slice(0, end))}`;
}

function applyOrdered(ord, lv, attrs, focus, skills, perkBit) {
  state.level = clamp(lv || 1, 1, C.maxCharacterLevel);
  ATTRS.forEach(x => state.attr[x.id] = 0);
  (ord.a || []).forEach((id, i) => {
    if (id in state.attr) state.attr[id] = clamp(attrs(i), 0, C.maxAttribute);
  });
  SKILLS.forEach(s => { state.focus[s.id] = 0; state.skill[s.id] = 0; });
  (ord.s || []).forEach((id, i) => {
    if (!(id in state.focus)) return;
    state.focus[id] = clamp(focus(i), 0, C.maxFocusPerSkill);
    state.skill[id] = clamp(skills(i), 0, MAX_SKILL);
  });
  state.perks.clear();
  (ord.p || []).forEach((id, i) => {
    if (perkBit(i) && PERK_INDEX.has(id)) state.perks.add(id);
  });
}

function applyOrigin(ord, modeVal, cultIdx, optIdx) {
  state.mode = modeVal;
  if (!isPlayer() || !ORIGIN) return;
  const cid = (ord.c || ORIGIN.cultures)[cultIdx];
  state.culture = ORIGIN.cultures.includes(cid) ? cid : ORIGIN.cultures[0];
  const g = ord.g || ORIGIN.stages.map(st => st.options.map(o => o.id));
  state.origin = ORIGIN.stages.map((st, i) => {
    const oi = optIdx(i);
    if (oi == null) return null;
    const id = (g[i] || [])[oi];
    return st.options.some(o => o.id === id) ? id : null;
  });
}

function decode(hash) {
  try {
    const parts = hash.split('.');
    const v = parts[0];
    let ord = VER.entries[parts[1]];
    if ((v === '4' || v === '3' || v === '2') && !ord) {
      ord = VER.entries[VER.cur];
      toast('Link uses a newer data version — loading best-effort');
    }
    if (v === '4') {
      const S = (ord.g || []).length;
      const need = 3 + S + 3 + 9 + 36 + Math.ceil((ord.p || []).length / 8);
      const raw = parts[2] ? unb64url(parts[2]) : new Uint8Array(0);
      const buf = new Uint8Array(need); buf.set(raw.slice(0, need));
      const o = 3 + S;
      applyOrigin(ord, buf[0] === 1 ? 'campaign' : buf[0] === 2 ? 'sandbox' : 'npc',
        buf[2] - 1, i => buf[3 + i] ? buf[3 + i] - 1 : null);
      applyOrdered(ord, buf[1],
        i => (buf[o + (i >> 1)] >> (i % 2 === 0 ? 4 : 0)) & 0xf,
        i => (buf[o + 3 + (i >> 1)] >> (i % 2 === 0 ? 4 : 0)) & 0xf,
        i => buf[o + 12 + i * 2] | (buf[o + 12 + i * 2 + 1] << 8),
        i => buf[o + 48 + (i >> 3)] & (1 << (i & 7)));
      return true;
    }
    return false;
  } catch { return false; }
}
const syncHash = () => history.replaceState(null, '', '#' + encode());

/* ---------------- dom helpers ---------------- */
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Mirrors SkillHelper.GetEffectDescriptionForSkillLevel: AddFactor is shown x100
   and the description supplies its own '%', so substitute the bare number. */
function perkDesc(p, which = 0) {
  const d = (p.descriptions || [])[which] || '';
  const v = p.effects && p.effects[which];
  if (!d) return '';
  if (!v) return esc(d.replace(/\{VALUE\}\s*/g, ''));
  const n = v.type === 'AddFactor' ? v.value * 100 : v.value;
  return esc(d.replace(/\{VALUE\}/g, Number.isInteger(n) ? String(n) : n.toFixed(1)));
}

/* Build a masked sprite element for an extracted icon, or null if absent. */
function iconEl(key, size) {
  if (!ICONS || !ICONS.index[key]) return null;
  const [cx, cy, cell, kind] = ICONS.index[key];
  const scale = size / cell;
  if (kind === 'c') {
    // full-colour artwork (skill mosaics): draw the sheet as a background
    const n = el('span', 'ic-img');
    n.style.width = n.style.height = size + 'px';
    n.style.backgroundImage = 'var(--iconsc)';
    n.style.backgroundPosition = `-${cx * scale}px -${cy * scale}px`;
    n.style.backgroundSize = `${ICONS.cw * scale}px ${ICONS.ch * scale}px`;
    n.style.backgroundRepeat = 'no-repeat';
    return n;
  }
  // flat silhouette (perks): alpha mask tinted by currentColor
  const n = el('span', 'ic-sprite');
  n.style.width = n.style.height = size + 'px';
  n.style.webkitMaskPosition = n.style.maskPosition =
    `-${cx * scale}px -${cy * scale}px`;
  n.style.webkitMaskSize = n.style.maskSize =
    `${ICONS.w * scale}px ${ICONS.h * scale}px`;
  return n;
}

/* ---------------- origin bar ---------------- */
function renderOrigin() {
  const bar = document.getElementById('originbar');
  if (!bar) return;
  bar.innerHTML = '';
  if (!ORIGIN) return;
  const wrap = el('div', 'origin');

  const mode = el('select', 'osel');
  mode.append(new Option('Campaign (story)', 'campaign'),
              new Option('Sandbox', 'sandbox'),
              new Option('Wanderer / NPC (15 + 5 start)', 'npc'));
  mode.value = state.mode;
  mode.onchange = () => withFloorSwap(() => { state.mode = mode.value; });
  wrap.append(field('Mode', mode));

  if (isPlayer()) {
    const cult = el('select', 'osel');
    for (const c of ORIGIN.cultures)
      cult.append(new Option(c[0].toUpperCase() + c.slice(1), c));
    cult.value = state.culture;
    cult.onchange = () => withFloorSwap(() => {
      state.culture = cult.value;
      // culture change invalidates culture-gated picks
      ORIGIN.stages.forEach((st, i) => {
        const o = st.options.find(x => x.id === state.origin[i]);
        if (o && o.cultures && !o.cultures.includes(state.culture)) state.origin[i] = null;
      });
    });
    wrap.append(field('Culture', cult));

    ORIGIN.stages.forEach((st, i) => {
      if (!stageActive(st)) return;
      const sel = el('select', 'osel');
      sel.append(new Option('—', ''));
      for (const o of st.options) {
        if (o.cultures && !o.cultures.includes(state.culture)) continue;
        const sk = (o.skills || []).map(x => SKILLS.find(s2 => s2.id === x)?.name || x).join(', ');
        const extra = o.attr ? ` — +1 ${o.attr.slice(0,3).toUpperCase()}${sk ? ' · ' + sk : ''}`
          : (o.unspentAttr ? ` — +${o.unspentAttr} attr, +${o.unspentFocus} focus` : '');
        sel.append(new Option(o.label + extra, o.id));
      }
      sel.value = state.origin[i] || '';
      sel.onchange = () => withFloorSwap(() => { state.origin[i] = sel.value || null; });
      sel.title = st.desc;
      wrap.append(field(st.title, sel));
    });

    // summary chips: traits + renown from origin
    const opts = chosenOptions();
    const traits = opts.flatMap(o => (o.traits || []).map(t => t));
    const renown = opts.reduce((n, o) => n + (o.renown || 0), 0);
    if (traits.length || renown) {
      wrap.append(el('span', 'ochips',
        [traits.length ? 'Traits: ' + traits.join(', ') : '',
         renown ? `Renown +${renown}` : ''].filter(Boolean).join(' · ')));
    }
  }
  bar.append(wrap);
}
function field(label, ctl) {
  const f = el('label', 'ofield');
  f.append(el('span', null, esc(label)), ctl);
  return f;
}

/* ---------------- render ---------------- */
function render() {
  const ab = attrBudget(state.level), fb = focusBudget(state.level);
  const as = attrSpent(), fs = focusSpent();

  // NB: must target .num, not the first <span> — that one is the icon.
  const ap = document.getElementById('attrPts');
  ap.querySelector('.num').textContent = `${ab - as}`;
  ap.classList.toggle('over', as > ab);
  ap.title = `Attribute points: ${as} spent of ${ab}`;
  const fp = document.getElementById('focusPts');
  fp.querySelector('.num').textContent = `${fb - fs}`;
  fp.classList.toggle('over', fs > fb);
  fp.title = `Focus points: ${fs} spent of ${fb}`;
  document.getElementById('level').value = state.level;

  renderOrigin();
  renderRows(as >= ab, fs >= fb);
  renderDetail(fs >= fb);
}

function renderRows(attrCapped, focusCapped) {
  const rows = document.getElementById('rows');
  rows.innerHTML = '';
  for (const a of ATTRS) {
    const row = el('div', 'arow');

    const tab = el('div', 'atab');
    tab.append(el('div', 'ab', esc(a.abbrev)), el('div', 'av', String(state.attr[a.id])));
    const ctl = el('div', 'ctl');
    const dec = el('button', null, '−'), inc = el('button', null, '+');
    dec.disabled = state.attr[a.id] <= attrFloor(a.id);
    inc.disabled = state.attr[a.id] >= C.maxAttribute;
    dec.onclick = () => { state.attr[a.id]--; commit(); };
    inc.onclick = () => {
      if (attrCapped) { denyPoints('attrPts', attrBudget(state.level) === 0
        ? 'No attribute points yet — raise Level; one is granted every 4 levels'
        : 'Out of attribute points — raise Level or free some elsewhere'); return; }
      state.attr[a.id]++; commit();
    };
    ctl.append(dec, inc); tab.append(ctl);
    tab.title = `${a.name} — ${a.description}`;
    row.append(tab);

    const tiles = el('div', 'tiles');
    for (const s of SKILLS.filter(s => s.attributes.includes(a.id))) {
      const lim = Math.round(learningLimit(s));
      const over = state.skill[s.id] > lim;
      const t = el('button', 'tile' + (state.sel === s.id ? ' sel' : '')
        + (over ? ' capped' : '') + (state.skill[s.id] === 0 ? ' zero' : ''));
      t.append(el('div', 'tname', esc(s.name)));
      const body = el('div', 'tbody');
      const ti = iconEl('skill:' + s.id, 34) || el('div', 'ticon');
      ti.classList.add('ticon');
      body.append(ti, el('div', 'tval', String(state.skill[s.id])));
      t.append(body);
      const fx = el('div', 'tfocus');
      for (let i = 1; i <= C.maxFocusPerSkill; i++) fx.append(el('i', i <= state.focus[s.id] ? 'on' : ''));
      t.append(fx);
      t.title = `${s.name} — cap ${lim}${over ? ` (${state.skill[s.id] - lim} over)` : ''}`;
      t.onclick = () => { state.sel = s.id; render(); };
      tiles.append(t);
    }
    row.append(tiles);
    rows.append(row);
  }
}

function renderDetail(focusCapped) {
  const s = skillById(state.sel);
  const d = document.getElementById('detail');
  d.innerHTML = '';

  const lim = Math.round(learningLimit(s));
  const val = state.skill[s.id];
  const rate = learningRate(s);

  // header
  const head = el('div', 'dhead');
  const hi = iconEl('skill:' + s.id, 64) || el('div', 'ticon');
  hi.classList.add('ticon');
  head.append(hi);
  const title = el('div', 'dtitle');
  title.append(el('h3', null, esc(s.name)));
  title.append(el('p', null, esc(s.description)));
  title.append(el('p', 'learn', `Skill cap <b>${lim}</b> · governed by <b>${esc(
    s.attributes.map(a => ATTRS.find(x => x.id === a).name).join(', '))}</b>`));
  head.append(title);
  d.append(head);

  // controls
  const ctl = el('div', 'dctl');
  const f1 = el('div', 'field');
  f1.append(el('label', null, 'Skill'));
  const inp = el('input'); inp.type = 'number'; inp.min = 0; inp.max = MAX_SKILL; inp.value = val;
  inp.onchange = () => { state.skill[s.id] = clamp(parseInt(inp.value) || 0, 0, MAX_SKILL); commit(); };
  f1.append(inp); ctl.append(f1);

  const f2 = el('div', 'field');
  f2.append(el('label', null, 'Focus'));
  const fx = el('div', 'dfocus');
  for (let i = 1; i <= C.maxFocusPerSkill; i++) {
    const dot = el('i', i <= state.focus[s.id] ? 'on' : '');
    dot.onclick = () => {
      const cur = state.focus[s.id];
      let next = cur === i ? i - 1 : i;
      if (next < cur && next < focusFloor(s.id)) { denyPoints('focusPts',
        'Those focus points come from your origin choices — they cannot be removed'); return; }
      next = Math.max(next, focusFloor(s.id));
      if (next > cur && focusSpent() + (next - cur) > focusBudget(state.level)) {
        denyPoints('focusPts', focusBudget(state.level) === 0
          ? 'No focus points yet — raise Level (top right); each level grants one'
          : 'Out of focus points — raise Level or free some elsewhere');
        return;
      }
      state.focus[s.id] = next; commit();
    };
    fx.append(dot);
  }
  f2.append(fx); ctl.append(f2);

  ctl.append(el('div', 'rate' + (rate === 0 ? ' zero' : ''),
    `x ${rate.toFixed(2)}<small>learning rate</small>`));
  d.append(ctl);

  const ts = el('div', 'trackscroll'); ts.append(perkTrack(s, val, lim)); d.append(ts);

  // Hover readout: a persistent box the shields write into directly, so a
  // hover never rebuilds the panel (that full re-render was the jank).
  infoBox = el('div', 'perkinfo');
  updateInfo(null);
  d.append(infoBox);

  d.append(el('div', 'hint',
    'Perks unlock at the skill values marked under the track. One choice per tier. ' +
    'Training past the cap is allowed but the learning rate falls by 1 + 0.1 per point over, to zero.'));

  d.append(summary());
}

/* Every perk chosen across the whole build — the thing you actually want to
   read back when planning, and it fills the panel below the track. */
function summary() {
  const box = el('div', 'summary');
  box.append(el('h4', null, `Chosen perks <em>${state.perks.size} selected</em>`));
  if (!state.perks.size) {
    box.append(el('div', 'none', 'None yet. Raise a skill to 25 or more, then pick from the track above.'));
    return box;
  }
  const grid = el('div', 'sgrid');
  for (const sk of SKILLS) {
    const chosen = PERKS_BY_SKILL[sk.id].filter(p => state.perks.has(p.id));
    if (!chosen.length) continue;
    const g = el('div', 'sgroup');
    g.append(el('b', null, `${esc(sk.name)} · ${chosen.length}`));
    for (const p of chosen) {
      const item = el('div', 'sperk');
      item.title = 'Show in track';
      item.onclick = () => { state.sel = sk.id; render(); };
      const head = el('span', 'sname',
        `${esc(p.name)} <small>${p.requiredSkill}</small>`);
      item.append(head);
      // the actual effects, same substitution as the hover readout
      const d1 = perkDesc(p, 0), d2 = perkDesc(p, 1);
      if (d1) item.append(el('span', 'seffect', d1));
      if (d2) item.append(el('span', 'seffect', d2));
      g.append(item);
    }
    grid.append(g);
  }
  box.append(grid);

  // By role: the grouping that answers "what does this build DO" — each
  // effect filed under the role it applies to (a perk can serve several).
  const ROLE_LABEL = r => r.replace(/([a-z])([A-Z])/g, '$1 $2');
  const byRole = new Map();
  for (const p of PERKS) {
    if (!state.perks.has(p.id)) continue;
    (p.effects || []).forEach((e, i) => {
      const line = perkDesc(p, i);
      if (!line) return;
      if (!byRole.has(e.role)) byRole.set(e.role, []);
      byRole.get(e.role).push({ p, line });
    });
  }
  if (byRole.size) {
    box.append(el('h4', null, `By role <em>where each effect applies</em>`));
    const rgrid = el('div', 'sgrid');
    const order = ['Personal', 'PartyLeader', 'Captain', 'Governor', 'ClanLeader',
      'Quartermaster', 'Scout', 'Surgeon', 'Engineer', 'ArmyCommander', 'PartyMember'];
    const roles = [...byRole.keys()].sort((a, b) =>
      (order.indexOf(a) + 99 * (order.indexOf(a) < 0)) -
      (order.indexOf(b) + 99 * (order.indexOf(b) < 0)));
    for (const role of roles) {
      const g = el('div', 'sgroup');
      g.append(el('b', null, `${esc(ROLE_LABEL(role))} · ${byRole.get(role).length}`));
      for (const { p, line } of byRole.get(role)) {
        const item = el('div', 'sperk');
        item.title = 'Show in track';
        item.onclick = () => { state.sel = p.skill; render(); };
        item.append(el('span', 'sname', `${esc(p.name)} <small>${esc(p.skill)} ${p.requiredSkill}</small>`));
        item.append(el('span', 'seffect', line));
        g.append(item);
      }
      rgrid.append(g);
    }
    box.append(rgrid);
  }
  return box;
}

const xOf = v => clamp((v - TRACK_MIN) / (TRACK_MAX - TRACK_MIN), 0, 1) * 100;

function perkTrack(s, val, lim) {
  const wrap = el('div', 'trackwrap');
  const band = el('div', 'band');

  // green = headroom you can still train efficiently; red = past the cap
  if (val < lim) {
    const z = el('div', 'zone ok');
    z.style.left = xOf(val) + '%'; z.style.width = (xOf(Math.min(lim, TRACK_MAX)) - xOf(val)) + '%';
    band.append(z);
  }
  // No over-cap zone: the game paints only the trainable window green and
  // leaves the rest of the band parchment.

  const cols = el('div', 'cols');
  const tiers = [...new Set(PERKS_BY_SKILL[s.id].map(p => p.tier))].sort((a, b) => a - b);
  for (const t of tiers) {
    const opts = PERKS_BY_SKILL[s.id].filter(p => p.tier === t);
    const req = REQ[t - 1];
    const col = el('div', 'col');
    col.style.left = xOf(req) + '%';
    const pairChosen = opts.some(o => state.perks.has(o.id));
    for (const p of opts) {
      // Game shield states: silver = not taken, gold = chosen, black = the
      // alternative you passed over when choosing its pair.
      const stateCls = state.perks.has(p.id) ? ' sel'
        : (pairChosen ? ' alt' : '');
      const b = el('button', 'shield' + stateCls + (opts.length === 1 ? ' solo' : ''));
      // With real icons present the shield shows art only, as in game; the name
      // lives in the tooltip and the hover readout below the track.
      const ic = iconEl('perk:' + p.id, 34);
      if (ic) b.append(ic);
      else b.append(el('span', 'pname', esc(p.name.length > 13 ? p.name.slice(0, 12) + '…' : p.name)));
      b.title = p.name;
      if (!perkUnlocked(p)) b.classList.add('locked');
      b.onmouseenter = () => updateInfo(p);   // sticky: no clear on leave
      b.onclick = () => {
        // Clicking a locked perk raises the skill to its requirement — no
        // typing the number first.
        if (!perkUnlocked(p))
          state.skill[p.skill] = Math.max(state.skill[p.skill], p.requiredSkill);
        if (state.perks.has(p.id)) state.perks.delete(p.id);
        else { for (const o of opts) state.perks.delete(o.id); state.perks.add(p.id); }
        commit();
      };
      col.append(b);
    }
    cols.append(col);
  }
  band.append(cols);

  // tier requirement ticks
  const ticks = el('div', 'tickrow');
  for (const t of tiers) {
    const tk = el('div', 'tick', String(REQ[t - 1]));
    tk.style.left = xOf(REQ[t - 1]) + '%';
    ticks.append(tk);
  }
  band.append(ticks);
  wrap.append(band);

  // current-value pin (top) and cap pin (bottom)
  // Labels are centred on their x; at 0% / 100% half the label would hang
  // outside the scroll container and get clipped, so keep pins inside a
  // small margin. The dot drifts a hair at the extremes, which is fine.
  const pinX = v => clamp(xOf(v), 2.5, 97.5);
  const cur = el('div', 'pin cur', `<div class="lab">${val}</div><div class="stem"></div><div class="dot"></div>`);
  cur.style.left = pinX(val) + '%';
  wrap.append(cur);
  if (lim <= TRACK_MAX) {
    const cap = el('div', 'pin cap', `<div class="dot"></div><div class="stem"></div><div class="lab">cap ${lim}</div>`);
    cap.style.left = pinX(lim) + '%';
    wrap.append(cap);
  }
  return wrap;
}

let infoBox = null;
function updateInfo(p) {
  if (!infoBox) return;
  infoBox.innerHTML = '';
  if (!p) {
    infoBox.className = 'perkinfo empty';
    infoBox.textContent = 'Hover a perk to see what it does · click to take it';
    return;
  }
  infoBox.className = 'perkinfo';
  infoBox.append(el('h4', null, esc(p.name)));
  const d1 = perkDesc(p, 0), d2 = perkDesc(p, 1);
  if (d1) infoBox.append(el('p', null, d1));
  if (d2) infoBox.append(el('p', null, d2));
  infoBox.append(el('div', 'req', `requires ${p.skill} ${p.requiredSkill}` +
    (perkUnlocked(p) ? '' : ` — click to take it (sets skill to ${p.requiredSkill})`)));
}

/* drop perks a lowered skill no longer unlocks */
function pruneAll() {
  for (const s of SKILLS) for (const p of PERKS_BY_SKILL[s.id]) if (!perkUnlocked(p)) state.perks.delete(p.id);
}
function commit() { applyFloors(); pruneAll(); render(); syncHash(); }

/* ---------------- wiring ---------------- */
document.getElementById('level').oninput = e => {
  state.level = clamp(parseInt(e.target.value) || 1, 1, C.maxCharacterLevel); commit();
};
document.getElementById('reset').onclick = () => {
  ATTRS.forEach(a => state.attr[a.id] = 0);
  SKILLS.forEach(s => { state.focus[s.id] = 0; state.skill[s.id] = 0; });
  state.perks.clear(); state.level = 1; commit();
};
document.getElementById('share').onclick = async () => {
  syncHash();
  const btn = document.getElementById('share');
  try {
    await navigator.clipboard.writeText(location.href);
    // feedback ON the button — a toast at the bottom of the screen is too far
    // from where the user is looking
    btn.classList.add('copied');
    btn.textContent = '✓ Copied';
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      btn.classList.remove('copied'); btn.textContent = 'Copy share link';
    }, 1600);
  } catch { toast('Copy failed — the URL bar holds your build'); }
};
/* Rejected spend: pulse the relevant counter and explain why, right away —
   a silent no-op reads as "the button is broken". */
function denyPoints(counterId, msg) {
  const n = document.getElementById(counterId);
  n.classList.remove('deny'); void n.offsetWidth;   // restart animation
  n.classList.add('deny');
  toast(msg);
}

function toast(m) {
  const t = document.getElementById('toast');
  t.textContent = m; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800);
}

if (location.hash.length > 1) decode(location.hash.slice(1));
applyFloors();   // player mode starts from the base-2 seeding even with no origin picked
render();
