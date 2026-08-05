import { Root, PerkTrack, PerkShield } from 'bannerlord-ui';

const cols = [
  { requirement: 25, perks: [
    <PerkShield key="a" state="selected" label="Wrapped Handles" />,
    <PerkShield key="b" state="rejected" label="Basher" />,
  ]},
  { requirement: 50, perks: [
    <PerkShield key="a" state="rejected" label="To Be Blunt" />,
    <PerkShield key="b" state="selected" label="Swift Strike" />,
  ]},
  { requirement: 75, perks: [
    <PerkShield key="a" label="Cavalry" />,
    <PerkShield key="b" label="Shield Bearer" />,
  ]},
  { requirement: 100, perks: [
    <PerkShield key="a" state="locked" label="Trainer" />,
    <PerkShield key="b" state="locked" label="Duelist" />,
  ]},
  { requirement: 125, perks: [
    <PerkShield key="a" state="locked" label="Shieldwall" solo />,
  ]},
];

export function MidProgress() {
  return <Root style={{ width: 720 }}>
    <PerkTrack value={60} cap={110} min={12} max={150} columns={cols} />
  </Root>;
}

export function FreshSkill() {
  return <Root style={{ width: 720 }}>
    <PerkTrack value={0} cap={40} min={12} max={150} columns={cols} />
  </Root>;
}
