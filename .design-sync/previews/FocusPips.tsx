import { Root, FocusPips } from 'bannerlord-ui';

export function TileSize() {
  return <Root style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', width: 220 }}>
    <FocusPips value={0} /><FocusPips value={3} /><FocusPips value={5} />
  </Root>;
}

export function DetailSize() {
  return <Root style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', width: 220 }}>
    <FocusPips value={2} size="lg" /><FocusPips value={5} size="lg" />
  </Root>;
}
