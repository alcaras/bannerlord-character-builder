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
// The game has no fixed skill ceiling below its 1024-entry XP table
// (DefaultCharacterDevelopmentModel.MaxSkillLevels); the real limit is where
// the learning rate hits zero, which grant-stacked builds can push past 400.
const MAX_SKILL = 1024;
// Spending stops at 5 focus (the game's gate), but unchecked grants — child
// education stages, the "Lord Needs a Tutor" quest, the smithy Weapon Master
// perk — stack on top with no clamp. 8 covers realistic grant stacking.
const MAX_FOCUS = 8;

/* Default starting point: a sensible, popular sandbox build so the page is
   immediately usable — level 25, Vlandia, merchant/social-INT background,
   age 40 (+3 unspent attributes, +6 unspent focus). All changeable. */
const DEFAULT_ORIGIN = {
  mode: 'sandbox', culture: 'vlandia', level: 25,
  picks: {
    narrative_parent_menu: ['vlandia_merchant_option'],
    narrative_childhood_menu: ['childhood_leader_option'],
    narrative_education_menu: ['education_tutor_option'],
    // the garrison option id varies by culture; first valid one wins
    narrative_youth_menu: ['youth_guard_high_register_option',
      'youth_guard_empire_register_option', 'youth_guard_low_register_option',
      'youth_guard_garrisons_register_option'],
    narrative_adulthood_menu: ['adulthood_nice_person_option'],
    narrative_age_selection_menu: ['age_selection_middle_age_option'],
  },
};

function applyDefaultOrigin() {
  if (!ORIGIN) { state.mode = 'npc'; return; }
  state.mode = DEFAULT_ORIGIN.mode;
  state.culture = DEFAULT_ORIGIN.culture;
  ORIGIN.stages.forEach((st, i) => {
    const cands = DEFAULT_ORIGIN.picks[st.id] || [];
    const hit = cands.map(id => st.options.find(o => o.id === id &&
      (!o.cultures || o.cultures.includes(state.culture)))).find(Boolean);
    state.origin[i] = hit ? hit.id : null;
  });
}

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
  let n = perkAttrGrant(id);
  if (!isPlayer()) return n;
  n += ORIGIN.grants.baseAttribute;
  for (const o of chosenOptions()) if (o.attr === id) n += ORIGIN.grants.attribute;
  return n;
}
function focusFloor(skillId) {
  // No 5-clamp: the game's AddFocus never clamps, so grants (Weapon Master
  // on a maxed skill) legitimately push focus past MaxFocusPerSkill.
  let n = perkFocusGrant(skillId);
  if (!isPlayer()) return n;
  for (const o of chosenOptions())
    if ((o.skills || []).includes(skillId)) n += ORIGIN.grants.focus;
  return n;
}
function skillFloor(skillId) {
  if (!isPlayer()) return 0;
  let n = 0;
  for (const o of chosenOptions())
    if ((o.skills || []).includes(skillId)) n += ORIGIN.grants.skillLevel;
  return n;
}
/* Player level-up income counts from level ZERO: ClearHero() zeroes
   Hero.Level at creation, and OnGainLevel fires on every ++ including 0->1,
   so a level-L player has earned L focus points and floor(L/4) attribute
   points (verified against a real save: 12 origin + 25 levels = 37 focus at
   level 25, to the point). NPCs use SetupDefaultPoints' (L-1)-based formula. */
const attrBudget = lv => isPlayer()
  ? Math.floor(lv / C.levelsPerAttributePoint) + ageGrants().a
  : Math.floor((lv - 1) / C.levelsPerAttributePoint) + C.attributePointsAtStart;
const focusBudget = lv => isPlayer()
  ? lv * C.focusPointsPerLevel + ageGrants().f
  : (lv - 1) * C.focusPointsPerLevel + C.focusPointsAtStart;
/* Spent = what came out of the budget, i.e. value above the free floor.
   Focus above 5 never comes from the budget (the game's spend gate stops at
   MaxFocusPerSkill; higher values exist only via unchecked grants), so only
   the first-five band counts as spent. */
const attrSpent = () => ATTRS.reduce((n, a) => n + Math.max(0, state.attr[a.id] - attrFloor(a.id)), 0);
const focusSpentOf = (f, floor) =>
  Math.max(0, Math.min(f, C.maxFocusPerSkill) - Math.min(floor, C.maxFocusPerSkill));
const focusSpent = () => SKILLS.reduce((n, s) =>
  n + focusSpentOf(state.focus[s.id], focusFloor(s.id)), 0);
/* Origin floors are hard minima; commit() re-asserts them after any change.
   Attributes clamp at 10 — HeroDeveloper.AddAttribute refuses past MaxAttribute
   even for unchecked grants, so a grant landing on a maxed attribute is lost.
   Focus does NOT clamp (AddFocus has no max check), so grant floors may exceed 5. */
function applyFloors() {
  // No player-mode gate: the floor functions are mode-aware, and perk grants
  // (the only NPC-mode floors) apply to wanderers exactly as to players.
  for (const a of ATTRS)
    state.attr[a.id] = Math.min(C.maxAttribute, Math.max(state.attr[a.id], attrFloor(a.id)));
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
    state.attr[a.id] = Math.min(C.maxAttribute,
      attrFloor(a.id) + Math.max(0, state.attr[a.id] - oldA[a.id]));
  for (const k of SKILLS) {
    state.focus[k.id] = Math.min(MAX_FOCUS,
      focusFloor(k.id) + Math.max(0, state.focus[k.id] - oldF[k.id]));
    state.skill[k.id] = Math.min(MAX_SKILL,
      skillFloor(k.id) + Math.max(0, state.skill[k.id] - oldS[k.id]));
  }
  commit();
  // If the change shrank a budget below what's already spent (e.g. leaving a
  // Starting Age whose unspent points were used), say so — the red negative
  // counter alone reads like a bug.
  const overF = focusSpent() - focusBudget(state.level);
  const overA = attrSpent() - attrBudget(state.level);
  if (overF > 0) denyPoints('focusPts',
    `That change removed focus-point income — you are ${overF} over budget; unspend some focus`);
  else if (overA > 0) denyPoints('attrPts',
    `That change removed attribute-point income — you are ${overA} over budget; unspend some attributes`);
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
/* Where the learning rate reaches exactly zero — the highest value this
   attr/focus combination can ever grind to. Solving rate = 0:
   over = 10 * (0.4*attr + focus), so max = limit + 4*attr + 10*focus. */
const maxReachable = s =>
  Math.round(learningLimit(s) + 4 * attrAvg(s) + 10 * state.focus[s.id]);

const perkUnlocked = p => state.skill[p.skill] >= p.requiredSkill;

/* Perks that permanently grant points when taken
   (PerkActivationHandlerCampaignBehavior) — they raise the free floors.
   Defined by skill+property and resolved to StringIds at load: perk ids are
   StringIds, which for Crafting do NOT carry the skill prefix ("VigorousSmith",
   not "CraftingVigorousSmith") — hardcoded ids silently missed all four
   smithing grants. */
const GRANT_DEFS = {
  'Crafting.VigorousSmith': { attr: 'vigor' },
  'Crafting.StrongSmith': { attr: 'control' },
  'Crafting.EnduringSmith': { attr: 'endurance' },
  'Crafting.WeaponMasterSmith': { focus: ['OneHanded', 'TwoHanded'] },
  'Athletics.Durable': { attr: 'endurance' },
  'Athletics.Steady': { attr: 'control' },
  'Athletics.Strong': { attr: 'vigor' },
};
/* prop may be a backing-field fallback (_athleticsWalkItOff); normalize. */
const propOf = p => {
  let x = p.prop || '';
  if (x[0] === '_') {
    const lc = p.skill[0].toLowerCase() + p.skill.slice(1);
    x = x.slice(1);
    if (x.startsWith(lc)) x = x.slice(lc.length);
  }
  return x;
};
const PERK_GRANTS = {};
for (const p of PERKS) {
  const g = GRANT_DEFS[p.skill + '.' + propOf(p)];
  if (g) PERK_GRANTS[p.id] = g;
}
function perkAttrGrant(id) {
  let n = 0;
  for (const pid of state.perks)
    if (PERK_GRANTS[pid] && PERK_GRANTS[pid].attr === id) n++;
  return n;
}
function perkFocusGrant(skillId) {
  let n = 0;
  for (const pid of state.perks)
    if ((PERK_GRANTS[pid] && PERK_GRANTS[pid].focus || []).includes(skillId)) n++;
  return n;
}

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
  const FB = Math.ceil(SKILLS.length / 2), SB = SKILLS.length * 2;
  const buf = new Uint8Array(3 + S + 3 + FB + SB + Math.ceil(PERKS.length / 8));
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
  o += FB;
  SKILLS.forEach((sk, i) => {
    const v = state.skill[sk.id];
    buf[o + i * 2] = v & 0xff; buf[o + i * 2 + 1] = v >> 8;
  });
  o += SB;
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
      // Section sizes derive from the MINTING version's orderings, so links
      // from the 18-skill era decode correctly next to 21-skill ones.
      const S = (ord.g || []).length;
      const NS = (ord.s || []).length;
      const FB = Math.ceil(NS / 2), SB = NS * 2;
      const need = 3 + S + 3 + FB + SB + Math.ceil((ord.p || []).length / 8);
      const raw = parts[2] ? unb64url(parts[2]) : new Uint8Array(0);
      const buf = new Uint8Array(need); buf.set(raw.slice(0, need));
      const o = 3 + S;
      applyOrigin(ord, buf[0] === 1 ? 'campaign' : buf[0] === 2 ? 'sandbox' : 'npc',
        buf[2] - 1, i => buf[3 + i] ? buf[3 + i] - 1 : null);
      applyOrdered(ord, buf[1],
        i => (buf[o + (i >> 1)] >> (i % 2 === 0 ? 4 : 0)) & 0xf,
        i => (buf[o + 3 + (i >> 1)] >> (i % 2 === 0 ? 4 : 0)) & 0xf,
        i => buf[o + 3 + FB + i * 2] | (buf[o + 3 + FB + i * 2 + 1] << 8),
        i => buf[o + 3 + FB + SB + (i >> 3)] & (1 << (i & 7)));
      return true;
    }
    return false;
  } catch { return false; }
}
const syncHash = () => history.replaceState(null, '', '#' + encode());

/* ---------------- dom helpers ---------------- */
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* "PartyLeader" -> "Party Leader", as the game prints it in tooltips. */
const ROLE_LABEL = r => r ? r.replace(/([a-z])([A-Z])/g, '$1 $2') : '';

/* Mirrors StringHelpers.SetEffectIncrementTypeTextVariable exactly: AddFactor
   is shown x100 (the description supplies its own '%'), the number is rounded
   to one decimal ("{0:0.#}"), and positive bonuses get a leading '+'. */
function fmtEffectValue(value, type) {
  const n = Math.round((type === 'AddFactor' ? value * 100 : value) * 10) / 10;
  return (value > 0 ? '+' : '') + n;
}
function perkDesc(p, which = 0) {
  const d = (p.descriptions || [])[which] || '';
  const v = p.effects && p.effects[which];
  if (!d) return '';
  if (!v) return esc(d.replace(/\{VALUE\}\s*/g, ''));
  return esc(d.replace(/\{VALUE\}/g, fmtEffectValue(v.value, v.type)));
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

/* ---------------- origin: summary bar + edit modal ---------------- */
const cap1 = s => s ? s[0].toUpperCase() + s.slice(1) : s;

function originSummaryText() {
  if (!isPlayer()) return 'Wanderer / NPC — 15 attribute + 5 focus points at start';
  const parts = [state.mode === 'campaign' ? 'Campaign' : 'Sandbox', cap1(state.culture)];
  ORIGIN.stages.forEach((st, i) => {
    if (!stageActive(st)) return;
    const o = st.options.find(x => x.id === state.origin[i]);
    if (o) parts.push(st.id.includes('age') ? 'age ' + o.label : o.label);
  });
  return parts.join(' · ');
}

function originChipsText() {
  const opts = chosenOptions();
  const traits = opts.flatMap(o => (o.traits || []).map(t => t));
  const renown = opts.reduce((n, o) => n + (o.renown || 0), 0);
  return [traits.length ? 'Traits: ' + traits.join(', ') : '',
          renown ? `Renown +${renown}` : ''].filter(Boolean).join(' · ');
}

/* Transient: the description of the stage option last touched in the modal. */
let originDescText = '';

function renderOrigin() {
  const bar = document.getElementById('originbar');
  if (!bar || !ORIGIN) return;
  bar.innerHTML = '';
  const wrap = el('div', 'originline');
  wrap.append(el('span', 'olabel', 'Origin'));
  const sum = el('span', 'osummary', esc(originSummaryText()));
  sum.title = originSummaryText();
  wrap.append(sum);
  const edit = el('button', 'btn', 'Edit origin');
  edit.onclick = () => { document.getElementById('originModal').hidden = false; };
  wrap.append(edit);
  bar.append(wrap);
  renderOriginFields();
}

function renderOriginFields() {
  const box = document.getElementById('originFields');
  if (!box || !ORIGIN) return;
  box.innerHTML = '';

  const mode = el('select', 'osel');
  mode.append(new Option('Campaign (story)', 'campaign'),
              new Option('Sandbox', 'sandbox'),
              new Option('Wanderer / NPC (15 + 5 start)', 'npc'));
  mode.value = state.mode;
  mode.onchange = () => withFloorSwap(() => { state.mode = mode.value; });
  box.append(field('Mode', mode));

  if (isPlayer()) {
    const cult = el('select', 'osel');
    for (const c of ORIGIN.cultures)
      cult.append(new Option(cap1(c), c));
    cult.value = state.culture;
    cult.onchange = () => withFloorSwap(() => {
      state.culture = cult.value;
      // culture change invalidates culture-gated picks
      ORIGIN.stages.forEach((st, i) => {
        const o = st.options.find(x => x.id === state.origin[i]);
        if (o && o.cultures && !o.cultures.includes(state.culture)) state.origin[i] = null;
      });
    });
    box.append(field('Culture', cult));

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
      sel.onchange = () => {
        const o = st.options.find(x => x.id === sel.value);
        originDescText = o && o.desc || '';
        withFloorSwap(() => { state.origin[i] = sel.value || null; });
      };
      sel.title = st.desc;
      box.append(field(st.title, sel));
    });
  }

  document.getElementById('originChips').textContent = originChipsText();
  document.getElementById('originDesc').textContent = originDescText ||
    'Pick each stage of your backstory — every choice grants skill focus, skill ' +
    'levels, and usually +1 to an attribute, exactly as in character creation.';
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
  renderChosen();
  renderSearch();
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
    // Single-attribute skills sit in their attribute's row; the naval
    // two-attribute skills get their own bottom row, like the game's screen.
    for (const s of SKILLS.filter(s => s.attributes.length === 1 && s.attributes[0] === a.id))
      tiles.append(skillTile(s));
    row.append(tiles);
    rows.append(row);
  }

  const naval = SKILLS.filter(s => s.attributes.length > 1);
  if (naval.length && state.naval !== false) {
    const row = el('div', 'arow');
    const tab = el('div', 'atab naval');
    tab.append(el('div', 'ab', '⚓'), el('div', 'avn', 'Naval'));
    tab.title = 'War Sails skills — each governed by two attributes; ' +
      'the skill cap uses the average of both';
    row.append(tab);
    const tiles = el('div', 'tiles');
    for (const s of naval) tiles.append(skillTile(s));
    row.append(tiles);
    rows.append(row);
  }
}

function skillTile(s) {
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
  const nPips = Math.max(C.maxFocusPerSkill, state.focus[s.id]);
  for (let i = 1; i <= nPips; i++)
    fx.append(el('i', (i <= state.focus[s.id] ? 'on' : '')
      + (i > C.maxFocusPerSkill ? ' bonus' : '')));
  t.append(fx);
  t.title = `${s.name} — cap ${lim}${over ? ` (${state.skill[s.id] - lim} over)` : ''}`;
  t.onclick = () => { state.sel = s.id; render(); };
  return t;
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
  title.append(el('p', 'learn', `Skill cap <b>${lim}</b> · max reachable <b>${maxReachable(s)}</b>` +
    ` · governed by <b>${esc(
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
  for (let i = 1; i <= MAX_FOCUS; i++) {
    const bonus = i > C.maxFocusPerSkill;
    const dot = el('i', (i <= state.focus[s.id] ? 'on' : '') + (bonus ? ' bonus' : ''));
    if (bonus) dot.title = 'Beyond the 5-point spending cap — in game this is only ' +
      'reachable through grants (childhood education stages, the "Lord Needs a Tutor" ' +
      'quest, the smithy Weapon Master perk). Costs no focus points here.';
    dot.onclick = () => {
      const cur = state.focus[s.id];
      let next = cur === i ? i - 1 : i;
      if (next < cur && next < focusFloor(s.id)) { denyPoints('focusPts',
        'Those focus points come from your origin choices — they cannot be removed'); return; }
      next = Math.max(next, focusFloor(s.id));
      // Only the first-five band draws on the budget; grant pips are free.
      const delta = focusSpentOf(next, focusFloor(s.id)) - focusSpentOf(cur, focusFloor(s.id));
      if (delta > 0 && focusSpent() + delta > focusBudget(state.level)) {
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
}

/* Every perk chosen across the whole build — the thing you actually want to
   read back when planning. Lives in its own panel under the detail pane. */
function renderChosen() {
  const box = document.getElementById('chosen');
  const badge = document.getElementById('chosenBadge');
  if (!box) return;
  badge.textContent = `${state.perks.size} selected`;
  box.innerHTML = '';
  if (!state.perks.size) {
    box.append(el('div', 'none', 'None yet. Raise a skill to 25 or more, then pick from the track above.'));
    return;
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
      // the actual effects with their roles, same as the hover readout
      (p.effects || []).forEach((e, i) => {
        const d = perkDesc(p, i);
        if (d) item.append(el('span', 'seffect',
          (e.role ? `<span class="erole">(${esc(ROLE_LABEL(e.role))})</span> ` : '') + d));
      });
      g.append(item);
    }
    grid.append(g);
  }
  box.append(grid);

  // By role: the grouping that answers "what does this build DO". Effects
  // sharing the same description template stack, so show ONE line with the
  // summed value and list the contributing perks under it — "+3 loyalty
  // (A · B · C)" instead of three separate "+1 loyalty" rows.
  const byRole = new Map();
  for (const p of PERKS) {
    if (!state.perks.has(p.id)) continue;
    (p.effects || []).forEach((e, i) => {
      const tpl = (p.descriptions || [])[i];
      if (!tpl) return;
      if (!byRole.has(e.role)) byRole.set(e.role, new Map());
      const m = byRole.get(e.role);
      const key = tpl + '|' + (e.type || '');
      if (!m.has(key)) m.set(key, { tpl, type: e.type,
        hasVal: /\{VALUE\}/.test(tpl) && typeof e.value === 'number', sum: 0, perks: [] });
      const b = m.get(key);
      b.sum += (typeof e.value === 'number' ? e.value : 0);
      b.perks.push(p);
    });
  }
  if (byRole.size) {
    box.append(el('h4', null, `By role <em>where each effect applies — stacking effects totalled</em>`));
    const rgrid = el('div', 'sgrid');
    const order = ['Personal', 'PartyLeader', 'Captain', 'Governor', 'ClanLeader',
      'Quartermaster', 'Scout', 'Surgeon', 'Engineer', 'ArmyCommander', 'PartyMember'];
    const roles = [...byRole.keys()].sort((a, b) =>
      (order.indexOf(a) + 99 * (order.indexOf(a) < 0)) -
      (order.indexOf(b) + 99 * (order.indexOf(b) < 0)));
    for (const role of roles) {
      const buckets = [...byRole.get(role).values()]
        .sort((a, b) => b.perks.length - a.perks.length);
      const g = el('div', 'sgroup');
      g.append(el('b', null, `${esc(ROLE_LABEL(role))} · ${buckets.length}`));
      for (const b of buckets) {
        // Same formatting as individual lines, applied to the summed value.
        const line = b.hasVal
          ? esc(b.tpl.replace(/\{VALUE\}/g, fmtEffectValue(b.sum, b.type)))
          : esc(b.tpl.replace(/\{VALUE\}\s*/g, ''));
        const item = el('div', 'sperk');
        item.title = 'Show in track';
        item.onclick = () => { state.sel = b.perks[0].skill; render(); };
        item.append(el('span', 'sname', line));
        item.append(el('span', 'seffect', b.perks.map(p =>
          `${esc(p.name)} <small>${esc(p.skill)} ${p.requiredSkill}</small>`).join(' · ')));
        g.append(item);
      }
      rgrid.append(g);
    }
    box.append(rgrid);
  }
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
    // Top/bottom within a pair matches the game: SkillVM.cs orders alternatives
    // by StringId comparison (the earlier id is the "first" = top shield).
    const opts = PERKS_BY_SKILL[s.id].filter(p => p.tier === t)
      .sort((a, b) => a.id.localeCompare(b.id, 'en'));
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
      b.onclick = () => takePerk(p);
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
  // Cap and max-reachable pins always render; past 300 they clamp to the
  // track edge (the label still tells the number).
  const cap = el('div', 'pin cap', `<div class="dot"></div><div class="stem"></div><div class="lab">cap ${lim}</div>`);
  cap.style.left = pinX(lim) + '%';
  wrap.append(cap);
  // Max pin rides the TOP edge so it never collides with the cap pin when
  // both clamp to the right end of the track.
  const maxR = maxReachable(s);
  if (maxR > lim) {
    const mp = el('div', 'pin max',
      `<div class="lab">max ${maxR}</div><div class="stem"></div><div class="dot"></div>`);
    mp.style.left = pinX(maxR) + '%';
    mp.title = 'The value where the learning rate reaches zero — nothing past this is attainable with the current attribute and focus';
    wrap.append(mp);
  }
  return wrap;
}

/* Toggle a perk exactly like clicking its shield: raise the skill to the
   requirement if needed, displace the pair alternative. */
function takePerk(p) {
  const opts = PERKS_BY_SKILL[p.skill].filter(x => x.tier === p.tier);
  const apply = () => {
    if (!perkUnlocked(p))
      state.skill[p.skill] = Math.max(state.skill[p.skill], p.requiredSkill);
    if (state.perks.has(p.id)) state.perks.delete(p.id);
    else { for (const o of opts) state.perks.delete(o.id); state.perks.add(p.id); }
  };
  // Point-granting perks change the free floors; swap floors so the
  // grant appears/disappears cleanly instead of ratcheting.
  if (opts.some(o => PERK_GRANTS[o.id])) withFloorSwap(apply);
  else { apply(); commit(); }
}

/* ---------------- perk search ---------------- */
/* Per-field matching: a perk matches when ALL terms land in the SAME field —
   its name+skill, ONE effect line, or its role list. "party size" then means
   the stat, not "a Party Leader perk mentioning any size"; searching a role
   ("governor") still works via the role field. */
const deCamel = s => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
let SEARCH_INDEX = null;
function searchPerks(q) {
  if (!SEARCH_INDEX) SEARCH_INDEX = PERKS.map(p => [
    `${p.name} ${skillById(p.skill)?.name || p.skill}`,
    (p.effects || []).map(e => ROLE_LABEL(e.role)).join(' '),
    ...(p.descriptions || []),
    // The consuming code sites, de-camelled: "party member size limit" etc.
    // This is the programmatic identity — description prose can be
    // inconsistent, but every real party-size perk hits the same model.
    ...(p.impl || []).map(deCamel),
  ].map(f => f.replace(/\{VALUE\}/g, '').toLowerCase()));
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return PERKS.filter((p, i) =>
    SEARCH_INDEX[i].some(f => terms.every(t => f.includes(t))));
}

const markTerms = (escaped, terms) => terms.reduce((s, t) =>
  s.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'),
    '<mark>$1</mark>'), escaped);

/* Take every matching perk. Pairs are respected: an already-decided pair
   keeps the user's pick, and a pair where BOTH alternatives match is skipped
   entirely — those are the user's call, listed above the results. */
let takeAllConflicts = [];
function takeAllResults(results) {
  const byPair = new Map();
  for (const p of results) {
    const k = p.skill + '|' + p.tier;
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k).push(p);
  }
  let taken = 0, kept = 0;
  const conflicts = [];
  withFloorSwap(() => {
    for (const list of byPair.values()) {
      const opts = PERKS_BY_SKILL[list[0].skill].filter(x => x.tier === list[0].tier);
      if (opts.some(o => state.perks.has(o.id))) {
        if (!list.some(p => state.perks.has(p.id))) kept++;
        continue;
      }
      if (list.length > 1) { conflicts.push(list); continue; }
      const pick = list[0];
      if (!perkUnlocked(pick))
        state.skill[pick.skill] = Math.max(state.skill[pick.skill], pick.requiredSkill);
      state.perks.add(pick.id);
      taken++;
    }
  });
  takeAllConflicts = conflicts;
  renderSearch();   // the floor-swap re-render ran before conflicts were known
  toast(`Took ${taken} perk${taken === 1 ? '' : 's'}` +
    (conflicts.length ? ` — ${conflicts.length} pair${conflicts.length === 1 ? ' needs' : 's need'} your call` : '') +
    (kept ? ` — kept your existing pick in ${kept} pair${kept === 1 ? '' : 's'}` : ''));
}

/* ---------------- perk browser (menu-driven views of the same panel) ---- */
/* A friendly label for a consuming class: DefaultPartySizeLimitModel ->
   "Party Size Limit". */
const catLabel = cls => deCamel(cls
  .replace(/^(Default|Sandbox)/, '')
  .replace(/(CalculationModel|CalculatingModel|Model|CampaignBehavior|IssueBehavior|Behavior)$/, ''))
  .trim();
const implClass = site => site.split('.')[0];
/* Plumbing classes that reference perks but aren't stat systems. */
const CAT_SKIP = /^(PerkResetCampaignBehavior|PerkActivationHandlerCampaignBehavior|PerkHelper|CampaignCheats)$/;

function buildBrowseMenu() {
  const sel = document.getElementById('perkBrowse');
  if (!sel) return;
  sel.append(new Option('Browse perks…', ''));

  const og1 = document.createElement('optgroup');
  og1.label = 'Overview';
  og1.append(new Option(`All perks (${PERKS.length})`, 'all|'));
  og1.append(new Option('Point-granting perks', 'grants|'));
  const none = PERKS.filter(p => !p.impl).length;
  if (none) og1.append(new Option(`No code consumer found (${none})`, 'none|'));
  sel.append(og1);

  const roleCount = new Map();
  for (const p of PERKS) for (const r of new Set((p.effects || []).map(e => e.role)))
    roleCount.set(r, (roleCount.get(r) || 0) + 1);
  const og2 = document.createElement('optgroup');
  og2.label = 'By role';
  const roleOrder = ['Personal', 'PartyLeader', 'Captain', 'Governor', 'ClanLeader',
    'Quartermaster', 'Scout', 'Surgeon', 'Engineer', 'ArmyCommander', 'PartyMember'];
  for (const r of [...roleCount.keys()].sort((a, b) =>
      (roleOrder.indexOf(a) + 99 * (roleOrder.indexOf(a) < 0)) -
      (roleOrder.indexOf(b) + 99 * (roleOrder.indexOf(b) < 0))))
    og2.append(new Option(`${ROLE_LABEL(r)} (${roleCount.get(r)})`, 'role|' + r));
  sel.append(og2);

  const cats = new Map();
  for (const p of PERKS)
    for (const c of new Set((p.impl || []).map(implClass)))
      if (!CAT_SKIP.test(c)) cats.set(c, (cats.get(c) || 0) + 1);
  const og3 = document.createElement('optgroup');
  og3.label = 'By system (from the game code)';
  for (const [c, n] of [...cats.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => catLabel(a[0]).localeCompare(catLabel(b[0]))))
    og3.append(new Option(`${catLabel(c)} (${n})`, 'impl|' + c));
  sel.append(og3);

  sel.onchange = () => {
    if (!sel.value) { state.browse = null; renderSearch(); return; }
    const [kind, key] = sel.value.split('|');
    state.query = '';
    document.getElementById('perkSearch').value = '';
    takeAllConflicts = [];
    state.browse = { kind, key,
      label: sel.options[sel.selectedIndex].text.replace(/ \(\d+\)$/, '') };
    renderSearch();
  };
}

function browsePerks(b) {
  if (b.kind === 'all') return PERKS.slice();
  if (b.kind === 'role') return PERKS.filter(p => (p.effects || []).some(e => e.role === b.key));
  if (b.kind === 'impl') return PERKS.filter(p => (p.impl || []).some(s => implClass(s) === b.key));
  if (b.kind === 'grants') return PERKS.filter(p => PERK_GRANTS[p.id]);
  if (b.kind === 'none') return PERKS.filter(p => !p.impl);
  return [];
}

function openBrowse(kind, key, label) {
  state.query = '';
  takeAllConflicts = [];
  document.getElementById('perkSearch').value = '';
  state.browse = { kind, key, label };
  const sel = document.getElementById('perkBrowse');
  sel.value = kind + '|' + key;
  if (sel.value !== kind + '|' + key) sel.value = '';   // not in the menu
  renderSearch();
}

function renderSearch() {
  const boxWrap = document.getElementById('searchbox');
  if (!boxWrap) return;
  const q = (state.query || '').trim();
  let terms = [], results, title;
  if (q) {
    terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    results = searchPerks(q);
    title = `Search: ${q}`;
  } else if (state.browse) {
    results = browsePerks(state.browse);
    title = state.browse.label;
  } else { boxWrap.hidden = true; return; }
  boxWrap.hidden = false;
  document.getElementById('searchTitle').textContent = title;
  document.getElementById('searchBadge').textContent =
    `${results.length} perk${results.length === 1 ? '' : 's'}`;
  const takeBtn = document.getElementById('searchTakeAll');
  takeBtn.disabled = !results.length;
  takeBtn.onclick = () => takeAllResults(results);
  const body = document.getElementById('searchResults');
  body.innerHTML = '';
  if (!results.length) {
    body.append(el('div', 'none', `No perks match “${esc(q)}”. Try a shorter term — the search covers perk names, skills, roles, effect text, and the consuming code sites.`));
    return;
  }
  if (state.browse && state.browse.kind === 'none') {
    body.append(el('div', 'none',
      'No reference to these perks exists anywhere in the decompiled game code — they are most likely not implemented.'));
  }
  // Pairs Take-all left for the user; drop any resolved since. Each name is
  // clickable and takes that perk.
  takeAllConflicts = takeAllConflicts.filter(list =>
    !PERKS_BY_SKILL[list[0].skill].some(x => x.tier === list[0].tier && state.perks.has(x.id)));
  if (takeAllConflicts.length) {
    const note = el('div', 'conflictnote',
      `${takeAllConflicts.length} pair${takeAllConflicts.length === 1 ? ' needs' : 's need'} your call — click your pick: `);
    takeAllConflicts.forEach((list, i) => {
      if (i) note.append(document.createTextNode(' · '));
      list.forEach((p, j) => {
        if (j) note.append(document.createTextNode(' vs '));
        const a = el('span', 'conflictpick', esc(p.name));
        a.title = `${p.skill} ${p.requiredSkill}`;
        a.onclick = () => takePerk(p);
        note.append(a);
      });
    });
    body.append(note);
  }
  const grid = el('div', 'sgrid');
  for (const sk of SKILLS) {
    const hits = results.filter(p => p.skill === sk.id);
    if (!hits.length) continue;
    const g = el('div', 'sgroup');
    g.append(el('b', null, `${esc(sk.name)} · ${hits.length}`));
    for (const p of hits) {
      const item = el('div', 'sperk');
      item.title = 'Show in track';
      item.onclick = () => { state.sel = sk.id; render(); updateInfo(p); };
      const chosen = state.perks.has(p.id);
      const head = el('span', 'sname',
        `${markTerms(esc(p.name), terms)} <small>${p.requiredSkill}</small>` +
        (chosen ? ' <em class="staken">✓ taken</em>' : ''));
      const take = el('button', 'stake', chosen ? 'Drop' : 'Take');
      take.onclick = e => { e.stopPropagation(); takePerk(p); };
      head.append(take);
      item.append(head);
      (p.effects || []).forEach((e, i) => {
        const d = perkDesc(p, i);
        if (d) item.append(el('span', 'seffect',
          (e.role ? `<span class="erole">(${esc(ROLE_LABEL(e.role))})</span> ` : '') +
          markTerms(d, terms)));
      });
      g.append(item);
    }
    grid.append(g);
  }
  body.append(grid);
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
  // Each effect line carries its role, "(Party Leader) …", as in the game.
  (p.effects || []).forEach((e, i) => {
    const d = perkDesc(p, i);
    if (d) infoBox.append(el('p', null,
      (e.role ? `<span class="erole">(${esc(ROLE_LABEL(e.role))})</span> ` : '') + d));
  });
  if (p.impl) {
    const line = el('div', 'impl');
    line.append(document.createTextNode('code: '));
    p.impl.forEach((x, i) => {
      if (i) line.append(document.createTextNode(' · '));
      const chip = el('span', 'implchip', esc(x.replace(/^Default/, '')));
      chip.title = 'Show every perk this system reads';
      chip.onclick = () => openBrowse('impl', implClass(x), catLabel(implClass(x)));
      line.append(chip);
    });
    infoBox.append(line);
  }
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
/* Reset build: clear allocations back to the origin floors, keep the origin
   itself (and level) — you iterate on point spends far more often than on
   your backstory. */
document.getElementById('reset').onclick = () => {
  state.perks.clear();
  ATTRS.forEach(a => state.attr[a.id] = attrFloor(a.id));
  SKILLS.forEach(s => { state.focus[s.id] = focusFloor(s.id); state.skill[s.id] = skillFloor(s.id); });
  commit();
};
/* Reset origin: restore the default backstory, preserving whatever the user
   has spent on top (floor-swap semantics). */
document.getElementById('resetOrigin').onclick = () => {
  originDescText = '';
  withFloorSwap(() => { applyDefaultOrigin(); });
};
/* Origin modal open/close. State edits inside re-render live; closing is
   display-only. */
{
  const modal = document.getElementById('originModal');
  document.getElementById('originDone').onclick = () => { modal.hidden = true; };
  modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.hidden = true; });
}
/* Perk search: live as you type. Only the results panel re-renders on input
   (a full render would rebuild the input and drop focus). */
document.getElementById('perkSearch').oninput = e => {
  state.query = e.target.value;
  state.browse = null;
  takeAllConflicts = [];
  document.getElementById('perkBrowse').value = '';
  renderSearch();
};
document.getElementById('perkSearch').addEventListener('keydown', e => {
  if (e.key === 'Escape') clearSearch();
});
function clearSearch() {
  document.getElementById('perkSearch').value = '';
  state.query = '';
  state.browse = null;
  takeAllConflicts = [];
  document.getElementById('perkBrowse').value = '';
  renderSearch();
}
document.getElementById('searchClose').onclick = clearSearch;
buildBrowseMenu();
/* War Sails display toggle: hides the naval row; allocations are kept. */
document.getElementById('navalToggle').onchange = e => {
  state.naval = e.target.checked;
  const s = skillById(state.sel);
  if (!state.naval && s && s.attributes.length > 1) state.sel = 'OneHanded';
  render();
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
      btn.classList.remove('copied'); btn.textContent = 'Copy build link';
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

const loaded = location.hash.length > 1 && decode(location.hash.slice(1));
if (!loaded) { applyDefaultOrigin(); state.level = DEFAULT_ORIGIN.level; }
applyFloors();
render();
