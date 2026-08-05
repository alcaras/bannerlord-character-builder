import { Root, InfoBox } from 'bannerlord-ui';

export function PerkDetails() {
  return <Root style={{ width: 460 }}>
    <InfoBox title="Baptised in Blood"
      lines={[
        '5 experience to infantry in your party for each enemy you kill with a two handed weapon.',
        '5% experience to melee troops in your party after every battle.']}
      requirement="requires TwoHanded 75 — click to take it (sets skill to 75)" />
  </Root>;
}

export function Empty() {
  return <Root style={{ width: 460 }}>
    <InfoBox hint="Hover a perk to see what it does · click to take it" />
  </Root>;
}
