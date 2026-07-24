import type { HeroStats } from '../game/store.ts';

// GDD 4장 강화 5종. stat = GameState.hero 필드, delta = 1회 증가량.
export interface UpgradeDef {
  name: string;
  stat: keyof HeroStats;
  delta: number;
  baseCost: number;
  mult: number;
}

// 한 강화 = 한 줄, 컬럼 정렬로 밸런스 비교가 쉽다
// prettier-ignore
export const UPGRADES = {
  hp:     { name: '체력 단련', stat: 'maxHp', delta: 80, baseCost: 200, mult: 1.5 },
  atk:    { name: '검술 수련', stat: 'atk', delta: 12, baseCost: 250, mult: 1.5 },
  atkSpd: { name: '속공 훈련', stat: 'atkSpd', delta: 0.15, baseCost: 300, mult: 1.6 },
  speed:  { name: '경보법', stat: 'speed', delta: 12, baseCost: 180, mult: 1.4 },
  range:  { name: '장창 구매', stat: 'range', delta: 15, baseCost: 220, mult: 1.5 },
} satisfies Record<string, UpgradeDef>;

export type UpgradeKey = keyof typeof UPGRADES;

export const SKILL_COST = 500; // 스킬 습득 고정

export const upgradeCost = (key: UpgradeKey, level: number) =>
  Math.round(UPGRADES[key].baseCost * Math.pow(UPGRADES[key].mult, level));
