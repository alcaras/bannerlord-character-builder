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
const MAX_SKILL = 330;

const state = {
  level: 1,
  attr: Object.fromEntries(ATTRS.map(a => [a.id, 0])),
  focus: Object.fromEntries(SKILLS.map(s => [s.id, 0])),
  skill: Object.fromEntries(SKILLS.map(s => [s.id, 0])),
  perks: new Set(),
  sel: SKILLS[0].id,
  hover: null,
};

/* ---------------- game rules ---------------- */
const attrBudget = lv => Math.floor((lv - 1) / C.levelsPerAttributePoint) + C.attributePointsAtStart;
const focusBudget = lv => (lv - 1) * C.focusPointsPerLevel + C.focusPointsAtStart;
const attrSpent = () => ATTRS.reduce((n, a) => n + state.attr[a.id], 0);
const focusSpent = () => SKILLS.reduce((n, s) => n + state.focus[s.id], 0);
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

Format 2 (current): 2.<dataVer>.<level b36>.<attrs>.<focus>.<skills>.<perkBits>
Format 1 (legacy):  1.<level b36>.<attrs>.<focus>.<skills>.<perkBits>

Indices and the perk bitmap are meaningful only against the orderings of the
data version that minted the link, so v2 carries a 4-hex data-version key and
the page embeds VER.entries — every ordering any past build used (owtt-style
versionMaps). Decoding remaps by StringId into the current arrays and drops
ids that no longer exist. v1 links predate the key and decode against the
ordering registered as VER.v1. */
const B36 = n => n.toString(36);
function encode() {
  const a = ATTRS.map(x => B36(state.attr[x.id])).join('');
  const f = SKILLS.map(s => B36(state.focus[s.id])).join('');
  const sk = SKILLS.map(s => B36(state.skill[s.id]).padStart(2, '0')).join('');
  const bits = new Uint8Array(Math.ceil(PERKS.length / 8));
  for (const id of state.perks) {
    const i = PERK_INDEX.get(id);
    if (i !== undefined) bits[i >> 3] |= 1 << (i & 7);
  }
  let bin = ''; bits.forEach(b => bin += String.fromCharCode(b));
  const p = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `2.${VER.cur}.${B36(state.level)}.${a}.${f}.${sk}.${p}`;
}

function decode(hash) {
  try {
    const parts = hash.split('.');
    let ord, rest;
    if (parts[0] === '2') {
      ord = VER.entries[parts[1]];
      rest = parts.slice(2);
      if (!ord) {           // link minted by a newer build than this page
        ord = VER.entries[VER.cur];
        toast('Link uses a newer data version — loading best-effort');
      }
    } else if (parts[0] === '1') {
      ord = VER.entries[VER.v1];
      rest = parts.slice(1);
    } else return false;
    if (!ord) return false;
    const [lv, a, f, sk, p] = rest;
    state.level = clamp(parseInt(lv, 36) || 1, 1, C.maxCharacterLevel);
    // Everything below maps by StringId: position i in the minting version's
    // ordering -> id -> current slot. Unknown ids are dropped, missing stay 0.
    ATTRS.forEach(x => state.attr[x.id] = 0);
    ord.a.forEach((id, i) => {
      if (id in state.attr)
        state.attr[id] = clamp(parseInt(a[i], 36) || 0, 0, C.maxAttribute);
    });
    SKILLS.forEach(s => { state.focus[s.id] = 0; state.skill[s.id] = 0; });
    ord.s.forEach((id, i) => {
      if (!(id in state.focus)) return;
      state.focus[id] = clamp(parseInt(f[i], 36) || 0, 0, C.maxFocusPerSkill);
      state.skill[id] = clamp(parseInt(sk.slice(i * 2, i * 2 + 2), 36) || 0, 0, MAX_SKILL);
    });
    state.perks.clear();
    if (p) {
      const bin = atob(p.replace(/-/g, '+').replace(/_/g, '/'));
      ord.p.forEach((id, i) => {
        if ((bin.charCodeAt(i >> 3) & (1 << (i & 7))) && PERK_INDEX.has(id))
          state.perks.add(id);
      });
    }
    return true;
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
    dec.disabled = state.attr[a.id] <= 0;
    inc.disabled = state.attr[a.id] >= C.maxAttribute || attrCapped;
    dec.onclick = () => { state.attr[a.id]--; commit(); };
    inc.onclick = () => { state.attr[a.id]++; commit(); };
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
      const cur = state.focus[s.id], next = cur === i ? i - 1 : i;
      if (next > cur && focusSpent() + (next - cur) > focusBudget(state.level)) return;
      state.focus[s.id] = next; commit();
    };
    fx.append(dot);
  }
  f2.append(fx); ctl.append(f2);

  ctl.append(el('div', 'rate' + (rate === 0 ? ' zero' : ''),
    `x ${rate.toFixed(2)}<small>learning rate</small>`));
  d.append(ctl);

  const ts = el('div', 'trackscroll'); ts.append(perkTrack(s, val, lim)); d.append(ts);

  // hovered / selected perk readout
  const info = el('div', 'perkinfo');
  const p = state.hover ? PERKS.find(x => x.id === state.hover) : null;
  if (p) {
    info.append(el('h4', null, esc(p.name)));
    const d1 = perkDesc(p, 0), d2 = perkDesc(p, 1);
    if (d1) info.append(el('p', null, d1));
    if (d2) info.append(el('p', null, d2));
    info.append(el('div', 'req', `requires ${p.skill} ${p.requiredSkill}` +
      (perkUnlocked(p) ? '' : ` — locked (you have ${val})`)));
  } else {
    info.className = 'perkinfo empty';
    info.textContent = 'Hover a perk to see what it does · click to choose';
  }
  d.append(info);

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
      const line = el('span', null, `${esc(p.name)} <small style="color:#6b5c44">${p.requiredSkill}</small>`);
      line.title = 'Show in track';
      line.onclick = () => { state.sel = sk.id; render(); };
      g.append(line);
    }
    grid.append(g);
  }
  box.append(grid);
  return box;
}

const xOf = v => clamp(v / TRACK_MAX, 0, 1) * 100;

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
      b.disabled = !perkUnlocked(p);
      b.onmouseenter = () => { state.hover = p.id; renderDetail(); };
      b.onmouseleave = () => { state.hover = null; renderDetail(); };
      b.onclick = () => {
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

/* drop perks a lowered skill no longer unlocks */
function pruneAll() {
  for (const s of SKILLS) for (const p of PERKS_BY_SKILL[s.id]) if (!perkUnlocked(p)) state.perks.delete(p.id);
}
function commit() { pruneAll(); render(); syncHash(); }

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
  try { await navigator.clipboard.writeText(location.href); toast('Link copied'); }
  catch { toast('Copy failed — the URL bar holds your build'); }
};
function toast(m) {
  const t = document.getElementById('toast');
  t.textContent = m; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800);
}

if (location.hash.length > 1) decode(location.hash.slice(1));
render();
