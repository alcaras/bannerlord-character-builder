import { Root, AttributeRow, AttributeTab, SkillTile } from 'bannerlord-ui';

export function VigorRow() {
  return <Root style={{ width: 560 }}>
    <AttributeRow tab={<AttributeTab abbrev="VIG" value={4} />}>
      <SkillTile name="One Handed" value={120} focus={3} selected />
      <SkillTile name="Two Handed" value={45} focus={1} />
      <SkillTile name="Polearm" value={0} focus={0} />
    </AttributeRow>
  </Root>;
}
