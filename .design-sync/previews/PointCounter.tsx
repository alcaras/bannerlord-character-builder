import { Root, PointCounter } from 'bannerlord-ui';

export function Available() {
  return <Root style={{ display: 'flex', gap: '1rem', width: 300 }}>
    <PointCounter icon="◆" value={9} title="Attribute points" />
    <PointCounter icon="◉" value={30} title="Focus points" />
  </Root>;
}

export function OverBudget() {
  return <Root style={{ width: 300 }}>
    <PointCounter icon="◉" value={-3} over title="Focus points — over budget" />
  </Root>;
}
