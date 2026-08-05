import type { ReactNode, CSSProperties } from 'react';

/** Dark parchment backdrop + type stack for any composition built with this kit. Wrap screens in it. */
export function Root({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return <div className="bl-root" style={style}>{children}</div>;
}

/** Ornate bordered panel with an optional header row (title centered, slots left/right). */
export function Panel({ title, left, right, children, style }: {
  title?: ReactNode; left?: ReactNode; right?: ReactNode; children?: ReactNode; style?: CSSProperties;
}) {
  return (
    <div className="bl-panel" style={style}>
      {(title || left || right) && (
        <div className="panel-head">
          <div>{left}</div>
          <h2>{title}</h2>
          <div>{right}</div>
        </div>
      )}
      <div className="bl-panel-body">{children}</div>
    </div>
  );
}

/** Unspent-point counter (the circled icon + number in the panel header). `over` turns it red. */
export function PointCounter({ icon = '◆', value, over = false, title }: {
  icon?: ReactNode; value: number | string; over?: boolean; title?: string;
}) {
  return (
    <div className={'pts' + (over ? ' over' : '')} title={title}>
      <span className="ic">{icon}</span><span className="num">{value}</span>
    </div>
  );
}

/** Small − / + button pair. Used inside AttributeTab; reusable anywhere. */
export function Stepper({ onDecrement, onIncrement, decDisabled = false, incDisabled = false }: {
  onDecrement?: () => void; onIncrement?: () => void; decDisabled?: boolean; incDisabled?: boolean;
}) {
  return (
    <div className="ctl">
      <button disabled={decDisabled} onClick={onDecrement}>−</button>
      <button disabled={incDisabled} onClick={onIncrement}>+</button>
    </div>
  );
}

/** Attribute column tab: abbreviation, big serif value, stepper underneath. */
export function AttributeTab({ abbrev, value, decDisabled, incDisabled, onDecrement, onIncrement, title }: {
  abbrev: string; value: number; decDisabled?: boolean; incDisabled?: boolean;
  onDecrement?: () => void; onIncrement?: () => void; title?: string;
}) {
  return (
    <div className="atab" title={title}>
      <div className="ab">{abbrev}</div>
      <div className="av">{value}</div>
      <Stepper onDecrement={onDecrement} onIncrement={onIncrement}
        decDisabled={decDisabled} incDisabled={incDisabled} />
    </div>
  );
}

/** Row of focus pips (0–5). `size="lg"` is the detail-pane variant; `floor` pips can't be unset. */
export function FocusPips({ value, count = 5, size = 'sm', onChange }: {
  value: number; count?: number; size?: 'sm' | 'lg'; onChange?: (next: number) => void;
}) {
  const cls = size === 'lg' ? 'dfocus' : 'tfocus';
  return (
    <div className={cls}>
      {Array.from({ length: count }, (_, k) => (
        <i key={k} className={k < value ? 'on' : ''}
           onClick={onChange ? () => onChange(value === k + 1 ? k : k + 1) : undefined} />
      ))}
    </div>
  );
}

/** Skill card: name bar, icon slot, big amber value, focus pips. States: selected / overCap / zero. */
export function SkillTile({ name, value, icon, focus = 0, selected = false, overCap = false, onClick, title }: {
  name: string; value: number; icon?: ReactNode; focus?: number;
  selected?: boolean; overCap?: boolean; onClick?: () => void; title?: string;
}) {
  return (
    <button className={'tile' + (selected ? ' sel' : '') + (overCap ? ' capped' : '') + (value === 0 ? ' zero' : '')}
            onClick={onClick} title={title}>
      <div className="tname">{name}</div>
      <div className="tbody">
        <div className="ticon">{icon}</div>
        <div className="tval">{value}</div>
      </div>
      <FocusPips value={focus} />
    </button>
  );
}

/** Grid row of three SkillTiles beside an AttributeTab (the skill screen's row unit). */
export function AttributeRow({ tab, children }: { tab: ReactNode; children?: ReactNode }) {
  return <div className="arow">{tab}<div className="tiles">{children}</div></div>;
}

/** Pointed perk shield. state: default (silver) / selected (gold) / rejected (black) / locked (dim). */
export function PerkShield({ label, icon, state = 'default', solo = false, onClick, title }: {
  label?: string; icon?: ReactNode; state?: 'default' | 'selected' | 'rejected' | 'locked';
  solo?: boolean; onClick?: () => void; title?: string;
}) {
  const cls = 'shield' + (state === 'selected' ? ' sel' : state === 'rejected' ? ' alt' : state === 'locked' ? ' locked' : '') + (solo ? ' solo' : '');
  return (
    <button className={cls} onClick={onClick} title={title}>
      {icon}{!icon && label ? <span className="pname">{label}</span> : null}
    </button>
  );
}

export interface PerkColumn {
  /** Skill value that unlocks this tier — positions the column and labels the tick. */
  requirement: number;
  /** Usually two shields (an exclusive pair); one renders centered. */
  perks: ReactNode[];
}

/** Horizontal perk band: parchment strip, green trainable window (value→cap), tier columns, value/cap pins. */
export function PerkTrack({ value, cap, columns, min = 12, max = 300 }: {
  value: number; cap: number; columns: PerkColumn[]; min?: number; max?: number;
}) {
  const x = (v: number) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
  const pin = (v: number) => Math.min(97.5, Math.max(2.5, x(v)));
  return (
    <div className="trackscroll">
      <div className="trackwrap">
        <div className="band">
          {value < cap && (
            <div className="zone ok" style={{ left: x(value) + '%', width: (x(Math.min(cap, max)) - x(value)) + '%' }} />
          )}
          <div className="cols">
            {columns.map((c, i) => (
              <div key={i} className="col" style={{ left: x(c.requirement) + '%' }}>{c.perks}</div>
            ))}
          </div>
          <div className="tickrow">
            {columns.map((c, i) => (
              <div key={i} className="tick" style={{ left: x(c.requirement) + '%' }}>{c.requirement}</div>
            ))}
          </div>
        </div>
        <div className="pin cur" style={{ left: pin(value) + '%' }}>
          <div className="lab">{value}</div><div className="stem" /><div className="dot" />
        </div>
        {cap <= max && (
          <div className="pin cap" style={{ left: pin(cap) + '%' }}>
            <div className="dot" /><div className="stem" /><div className="lab">cap {cap}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Fixed-height readout box (perk details on hover). Empty state centers a hint. */
export function InfoBox({ title, lines = [], requirement, hint }: {
  title?: string; lines?: string[]; requirement?: string; hint?: string;
}) {
  if (!title) return <div className="perkinfo empty">{hint ?? 'Hover a perk to see what it does'}</div>;
  return (
    <div className="perkinfo">
      <h4>{title}</h4>
      {lines.map((l, i) => <p key={i}>{l}</p>)}
      {requirement && <div className="req">{requirement}</div>}
    </div>
  );
}

/** Parchment-chrome button. `primary` for the main action; `copied` flashes the success state. */
export function Button({ children, primary = false, copied = false, onClick, disabled }: {
  children?: ReactNode; primary?: boolean; copied?: boolean; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <button className={'btn' + (primary ? ' primary' : '') + (copied ? ' copied' : '')}
            onClick={onClick} disabled={disabled}>{children}</button>
  );
}

/** Labeled select (the origin bar's field unit). */
export function SelectField({ label, value, options, onChange, title }: {
  label: string; value?: string;
  options: Array<{ value: string; label: string }>;
  onChange?: (value: string) => void; title?: string;
}) {
  return (
    <label className="ofield" title={title}>
      <span>{label}</span>
      <select className="osel" value={value} onChange={onChange ? e => onChange(e.target.value) : undefined}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export interface SummaryItem { name: string; meta?: string; effects?: string[] }

/** Grouped list of chosen items with effect lines (the "Chosen perks" summary). */
export function SummaryList({ groups }: { groups: Array<{ title: string; items: SummaryItem[] }> }) {
  return (
    <div className="sgrid">
      {groups.map((g, i) => (
        <div key={i} className="sgroup">
          <b>{g.title}</b>
          {g.items.map((it, j) => (
            <div key={j} className="sperk">
              <span className="sname">{it.name} {it.meta && <small>{it.meta}</small>}</span>
              {(it.effects ?? []).map((e, k) => <span key={k} className="seffect">{e}</span>)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Bottom-center toast. Render with `show` to display. */
export function Toast({ message, show = false }: { message: string; show?: boolean }) {
  return <div className={'toast' + (show ? ' show' : '')} style={show ? { opacity: 1 } : undefined}>{message}</div>;
}
