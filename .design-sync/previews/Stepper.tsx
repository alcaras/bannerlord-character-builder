import { Root, Stepper } from 'bannerlord-ui';

export function States() {
  return <Root style={{ display: 'flex', gap: '1.5rem', width: 300, alignItems: 'center' }}>
    <Stepper />
    <Stepper decDisabled />
    <Stepper incDisabled />
  </Root>;
}
