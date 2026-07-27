import type { HeroStats } from '../game/store.ts';
import { UPGRADES, type UpgradeKey } from './upgrades.ts';

// 도네이션 보상 카드 = 기존 강화 5종에 등급 배율만 얹은 것.
// 별도 스탯 테이블을 두지 않는다 — 강화 밸런스는 upgrades.ts 한 곳에서만 만진다.
export type Rarity = 'common' | 'rare' | 'epic';

// prettier-ignore
export const RARITY = {
  common: { label: '노멀', mult: 1,   weight: 68, color: '#9aa8bd' },
  rare:   { label: '레어', mult: 2.5, weight: 27, color: '#4fa3ff' },
  epic:   { label: '에픽', mult: 5,   weight: 5,  color: '#ff66cc' },
} satisfies Record<string, { label: string; mult: number; weight: number; color: string }>;

export interface Card {
  key: UpgradeKey;
  rarity: Rarity;
  name: string;
  stat: keyof HeroStats;
  delta: number;
}

const KEYS = Object.keys(UPGRADES) as UpgradeKey[];
const pick = <T>(arr: T[], rnd: () => number) => arr[Math.floor(rnd() * arr.length)];

export function makeCard(key: UpgradeKey, rarity: Rarity): Card {
  const u = UPGRADES[key];
  return {
    key,
    rarity,
    name: u.name,
    stat: u.stat,
    delta: Math.round(u.delta * RARITY[rarity].mult * 100) / 100,
  };
}

const ALL: Rarity[] = ['common', 'rare', 'epic'];

// 가중 추첨. pool을 좁히면 그 안에서만 뽑는다 (리액션 보상은 노멀을 빼는 식).
export function rollRarity(rnd: () => number = Math.random, pool: Rarity[] = ALL): Rarity {
  let t = rnd() * pool.reduce((s, r) => s + RARITY[r].weight, 0);
  for (const r of pool) {
    t -= RARITY[r].weight;
    if (t < 0) return r;
  }
  return pool[pool.length - 1]; // rnd()가 1에 붙는 극단만 방어
}

// 일반 도네: 카드 3장 노출 → 그중 1장이 랜덤 당첨
export function drawCards(n: number, rnd: () => number = Math.random, pool: Rarity[] = ALL): Card[] {
  return Array.from({ length: n }, () => makeCard(pick(KEYS, rnd), rollRarity(rnd, pool)));
}

// 리액션(리듬) 보상: 노멀이 안 나온다. 판정이 좋을수록(mult≥2) 에픽 확정.
export function reactionCard(mult: number, rnd: () => number = Math.random): Card {
  return makeCard(pick(KEYS, rnd), rollRarity(rnd, mult >= 2 ? ['epic'] : ['rare', 'epic']));
}
