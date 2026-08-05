import { Root, AttributeTab } from 'bannerlord-ui';

export function Row() {
  return <Root style={{ display: 'flex', gap: '.5rem', width: 340 }}>
    <AttributeTab abbrev="VIG" value={3} />
    <AttributeTab abbrev="CTR" value={2} decDisabled />
    <AttributeTab abbrev="INT" value={10} incDisabled title="At maximum" />
  </Root>;
}
