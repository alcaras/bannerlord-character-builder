import { Root, SkillTile } from 'bannerlord-ui';

export function Trained() {
  return <Root style={{ width: 260 }}>
    <SkillTile name="Tactics" value={150} focus={5} title="Tactics — cap 240" />
  </Root>;
}

export function Selected() {
  return <Root style={{ width: 260 }}>
    <SkillTile name="One Handed" value={120} focus={3} selected />
  </Root>;
}

export function OverCap() {
  return <Root style={{ width: 260 }}>
    <SkillTile name="Riding" value={158} focus={2} overCap title="Riding — 38 over cap" />
  </Root>;
}

export function Untrained() {
  return <Root style={{ width: 260 }}>
    <SkillTile name="Crossbow" value={0} focus={0} />
  </Root>;
}
