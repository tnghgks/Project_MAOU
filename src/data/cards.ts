import type { HeroStats } from '../game/store.ts';
import { UPGRADES, type UpgradeKey } from './upgrades.ts';
import { TRAITS, type TraitId } from './traits.ts';

// 도네이션 보상 카드 = 기존 강화 5종에 등급 배율만 얹은 것.
// 별도 스탯 테이블을 두지 않는다 — 강화 밸런스는 upgrades.ts 한 곳에서만 만진다.
export type Rarity = 'common' | 'rare' | 'epic';

// prettier-ignore
export const RARITY = {
  common: { label: '노멀', mult: 1,   weight: 68, color: '#9aa8bd' },
  rare:   { label: '레어', mult: 2.5, weight: 27, color: '#4fa3ff' },
  epic:   { label: '에픽', mult: 5,   weight: 5,  color: '#ff66cc' },
} satisfies Record<string, { label: string; mult: number; weight: number; color: string }>;

// trait이 있으면 특성 카드 — key/stat/delta는 안 쓰인다(스탯이 아니라 전투 규칙을 준다).
// 별도 카드 타입을 만들지 않는 이유: 뽑기·연출·확정 경로가 전부 같고 분기는 endDonation 한 줄이면 끝난다.
export interface Card {
  key: UpgradeKey;
  rarity: Rarity;
  name: string;
  stat: keyof HeroStats;
  delta: number;
  trait?: TraitId;
  desc?: string;
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

// 특성 카드는 항상 에픽 — 런 한 번에 많아야 3장 나오는 규칙 변경이라 등급을 굴릴 이유가 없다
export function traitCard(id: TraitId): Card {
  const t = TRAITS[id];
  return { key: 'atk', rarity: 'epic', name: `${t.icon} ${t.name}`, stat: 'atk', delta: 0, trait: id, desc: t.desc };
}

const ALL: Rarity[] = ['common', 'rare', 'epic'];
export const TRAIT_CHANCE = 0.14; // ponytail: 미보유 특성이 있을 때 카드 한 장이 특성일 확률

// 가중 추첨. pool을 좁히면 그 안에서만 뽑는다 (리액션 보상은 노멀을 빼는 식).
export function rollRarity(rnd: () => number = Math.random, pool: Rarity[] = ALL): Rarity {
  let t = rnd() * pool.reduce((s, r) => s + RARITY[r].weight, 0);
  for (const r of pool) {
    t -= RARITY[r].weight;
    if (t < 0) return r;
  }
  return pool[pool.length - 1]; // rnd()가 1에 붙는 극단만 방어
}

// 통에서 하나 뽑기 — 이미 뽑은 원소는 통이 다시 채워지기 전까진 안 나온다(같은 판 안 중복 방지).
// 다 뽑아 통이 비면 그 자리에서 즉시 리필 — pool 크기가 1이어도(예: 미보유 특성 1개) 예전처럼 계속 뽑힌다.
function drawUnique<T>(pool: readonly T[], used: Set<T>, rnd: () => number): T {
  let avail = pool.filter((x) => !used.has(x));
  if (!avail.length) {
    used.clear();
    avail = pool as T[];
  }
  const picked = pick(avail, rnd);
  used.add(picked);
  return picked;
}

// 일반 도네: 카드 3장 노출 → 그중 1장이 랜덤 당첨.
// traits = 아직 없는 특성 목록(호출부가 계산). 비어 있으면 기존과 완전히 동일하게 굴러간다.
// #19: 예전엔 매장을 독립적으로 뽑아 같은 카드(같은 특성·같은 강화)가 중복 노출될 수 있었다.
export function drawCards(
  n: number,
  traits: TraitId[] = [],
  rnd: () => number = Math.random,
  pool: Rarity[] = ALL,
): Card[] {
  const usedTraits = new Set<TraitId>();
  const usedKeys = new Set<UpgradeKey>();
  return Array.from({ length: n }, () =>
    traits.length && rnd() < TRAIT_CHANCE
      ? traitCard(drawUnique(traits, usedTraits, rnd))
      : makeCard(drawUnique(KEYS, usedKeys, rnd), rollRarity(rnd, pool)),
  );
}

// 리액션(리듬) 보상: 노멀이 안 나온다. highTier(ALL PERFECT/GREAT)면 에픽 확정.
export function reactionCard(highTier: boolean, rnd: () => number = Math.random): Card {
  return makeCard(pick(KEYS, rnd), rollRarity(rnd, highTier ? ['epic'] : ['rare', 'epic']));
}
