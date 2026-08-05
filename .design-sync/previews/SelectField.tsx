import { Root, SelectField } from 'bannerlord-ui';

export function OriginFields() {
  return <Root style={{ display: 'flex', gap: '.7rem', width: 560, alignItems: 'flex-end' }}>
    <SelectField label="Mode" value="campaign" options={[
      { value: 'campaign', label: 'Campaign (story)' },
      { value: 'sandbox', label: 'Sandbox' }]} />
    <SelectField label="Culture" value="vlandia" options={[
      { value: 'vlandia', label: 'Vlandia' }, { value: 'nord', label: 'Nord' }]} />
    <SelectField label="Family" value="m" options={[
      { value: 'm', label: 'Urban merchants — +1 INT · Trade, Charm' }]} />
  </Root>;
}
