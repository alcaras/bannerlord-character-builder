import { Root, Panel, SkillTile } from 'bannerlord-ui';

export function Backdrop() {
  return <Root style={{ width: 420 }}>
    <p style={{ margin: 0, color: 'var(--dim)' }}>
      The parchment backdrop every composition sits on — dark radial wash,
      warm ink, UI sans stack.
    </p>
  </Root>;
}

export function WithContent() {
  return <Root style={{ width: 420 }}>
    <Panel title="Skills">
      <SkillTile name="Tactics" value={100} focus={4} />
    </Panel>
  </Root>;
}
