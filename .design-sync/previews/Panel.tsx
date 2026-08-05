import { Root, Panel, PointCounter, SkillTile, AttributeRow, AttributeTab } from 'bannerlord-ui';

export function SkillsPanel() {
  return <Root style={{ width: 560 }}>
    <Panel title="Skills"
      left={<PointCounter icon="◆" value={9} title="Attribute points" />}
      right={<PointCounter icon="◉" value={30} title="Focus points" />}>
      <AttributeRow tab={<AttributeTab abbrev="VIG" value={3} />}>
        <SkillTile name="One Handed" value={80} focus={2} />
        <SkillTile name="Two Handed" value={0} focus={0} />
        <SkillTile name="Polearm" value={25} focus={1} />
      </AttributeRow>
    </Panel>
  </Root>;
}

export function Untitled() {
  return <Root style={{ width: 420 }}>
    <Panel><p style={{ margin: 0, color: 'var(--dim)' }}>Bare panel body — any content.</p></Panel>
  </Root>;
}
