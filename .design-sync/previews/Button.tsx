import { Root, Button } from 'bannerlord-ui';

export function Variants() {
  return <Root style={{ display: 'flex', gap: '.6rem', width: 420 }}>
    <Button>Reset build</Button>
    <Button primary>Copy share link</Button>
    <Button copied>✓ Copied</Button>
    <Button disabled>Unavailable</Button>
  </Root>;
}
