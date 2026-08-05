import { Root, PerkShield } from 'bannerlord-ui';

export function States() {
  return <Root style={{ display: 'flex', gap: '.75rem', width: 380, alignItems: 'flex-start' }}>
    <PerkShield label="Duelist" title="Available" />
    <PerkShield label="Trainer" state="selected" title="Chosen" />
    <PerkShield label="Basher" state="rejected" title="Passed over" />
    <PerkShield label="Prestige" state="locked" title="Locked" />
  </Root>;
}
