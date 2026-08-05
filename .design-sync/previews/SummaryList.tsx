import { Root, SummaryList } from 'bannerlord-ui';

const groups = [
  { title: 'ONE HANDED · 3', items: [
    { name: 'Wrapped Handles', meta: '25', effects: [
      '20% handling to one handed weapons.',
      '30 one handed skill to infantry troops in your formation.'] },
    { name: 'Swift Strike', meta: '50', effects: [
      '2% swing speed with one handed weapons.',
      '1 daily militia recruitment in the governed settlement.'] },
    { name: 'Cavalry', meta: '75', effects: [
      '5% damage with one handed weapons while mounted.'] },
  ]},
  { title: 'TACTICS · 2', items: [
    { name: 'Tight Formations', meta: '25', effects: [
      '10% damage by your infantry to cavalry when sent to confront the enemy.'] },
    { name: 'Extended Skirmish', meta: '50', effects: [
      '10% damage in snowy and forest terrains.'] },
  ]},
];

export function ChosenPerks() {
  return <Root style={{ width: 640 }}><SummaryList groups={groups} /></Root>;
}

export function SingleGroup() {
  return <Root style={{ width: 340 }}><SummaryList groups={[groups[0]]} /></Root>;
}
