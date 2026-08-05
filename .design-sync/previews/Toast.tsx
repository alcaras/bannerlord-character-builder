import { Root, Toast } from 'bannerlord-ui';

export function Visible() {
  return <Root style={{ width: 460, height: 120, position: 'relative' }}>
    <Toast show message="No focus points yet — raise Level; each level grants one" />
  </Root>;
}
