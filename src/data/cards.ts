import { TRAITS, TRAIT_IDS, type TraitId } from './traits.ts';
import { STAT_CARDS, STAT_CARD_IDS, type StatCardId } from './cardStats.ts';
import type { HeroStats } from '../game/store.ts';

// 도네이션 보상 카드. 카드마다 등급이 고정(rarity)이며 — 강화 5종처럼 등급 배율을 곱하는 게 아니라
// 카드 자체가 스탯 mods(전투기획서 원본 수치)나 특성(trait) 하나를 그대로 준다.
export type Rarity = 'common' | 'uncommon' | 'magic' | 'epic' | 'legend';

// 2026-08-03 하향(피드백: "특성 등급 카드가 너무 잘 나온다"): 등급별 보유 카드 수를 보면 common
// 이외 등급은 특성(traits.ts)이 대부분이라(예: epic 7종 중 6종이 특성) 등급이 뜨는 순간 사실상
// 강력한 특성이 뜨는 셈이었다. 기본은 common만 나오다시피 하도록 common 비중을 확 늘리고 나머지는
// 등급이 오를수록 훨씬 가파르게 줄인다 (합계는 1000 기준 — common 85% · uncommon 10% · magic 4% ·
// epic 0.8% · legend 0.2%).
// prettier-ignore
export const RARITY = {
  common:   { label: '일반', weight: 850, color: '#8fd17a' },
  uncommon: { label: '고급', weight: 100, color: '#4fa3ff' },
  magic:    { label: '희귀', weight: 40,  color: '#b366ff' },
  epic:     { label: '영웅', weight: 8,   color: '#ffcc33' },
  legend:   { label: '전설', weight: 2,   color: '#ff4444' },
} satisfies Record<Rarity, { label: string; weight: number; color: string }>;

const ALL: Rarity[] = ['common', 'uncommon', 'magic', 'epic', 'legend'];

// mode: 'flat' = hero[stat]에 그대로 가산 · 'pctCurrent' = 습득 시점 현재값의 value%를 가산 (cardStats.ts 참고)
export interface StatMod {
  stat: keyof HeroStats;
  mode: 'flat' | 'pctCurrent';
  value: number;
}

// trait이 있으면 특성 카드(mods는 항상 빈 배열) — 없으면 스탯 카드. 뽑기·연출·확정 경로가 전부
// 같고 분기는 endDonation 한 줄이면 끝나므로 별도 카드 타입을 만들지 않는다.
export interface Card {
  id: StatCardId | TraitId;
  rarity: Rarity;
  name: string;
  desc: string;
  mods: StatMod[];
  trait?: TraitId;
}

const pick = <T>(arr: readonly T[], rnd: () => number) => arr[Math.floor(rnd() * arr.length)];

export function statCard(id: StatCardId): Card {
  const c = STAT_CARDS[id];
  return { id, rarity: c.rarity, name: `${c.icon} ${c.name}`, desc: c.desc, mods: c.mods };
}

export function traitCard(id: TraitId): Card {
  const t = TRAITS[id];
  return { id, rarity: t.rarity, name: `${t.icon} ${t.name}`, desc: t.desc, mods: [], trait: id };
}

const isStatCard = (id: StatCardId | TraitId): id is StatCardId => id in STAT_CARDS;
const idToCard = (id: StatCardId | TraitId): Card => (isStatCard(id) ? statCard(id) : traitCard(id));

// 가중 추첨. pool을 좁히면 그 안에서만 뽑는다 (리액션 보상은 노멀급을 빼는 식).
export function rollRarity(rnd: () => number = Math.random, pool: Rarity[] = ALL): Rarity {
  let t = rnd() * pool.reduce((s, r) => s + RARITY[r].weight, 0);
  for (const r of pool) {
    t -= RARITY[r].weight;
    if (t < 0) return r;
  }
  return pool[pool.length - 1]; // rnd()가 1에 붙는 극단만 방어
}

// 등급별 카드 풀 — 특성은 이미 보유한 건 제외(중복 획득 방지). legend는 스탯 카드가 없어(0장)
// 특성 2종만 보유해버리면 그 등급이 통째로 빈다 — drawCards가 그런 등급은 애초에 안 굴린다.
function bucketsFor(ownedTraits: readonly TraitId[]): Record<Rarity, (StatCardId | TraitId)[]> {
  const b: Record<Rarity, (StatCardId | TraitId)[]> = { common: [], uncommon: [], magic: [], epic: [], legend: [] };
  for (const id of STAT_CARD_IDS) b[STAT_CARDS[id].rarity].push(id);
  for (const id of TRAIT_IDS) if (!ownedTraits.includes(id)) b[TRAITS[id].rarity].push(id);
  return b;
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

// 일반 도네: 카드 n장 노출 → 그중 1장이 랜덤 당첨.
// ownedTraits = 이미 보유한 특성(호출부가 계산) — 그만큼 특성 풀에서 빠진다.
// #19: 등급별로 독립된 used-Set을 둔다 — 한 Set을 공유하면 한 등급 풀이 바닥나 리필될 때
// 다른 등급에서 이미 뽑은 카드까지 다시 뽑힐 수 있다.
export function drawCards(
  n: number,
  ownedTraits: TraitId[] = [],
  rnd: () => number = Math.random,
  pool: Rarity[] = ALL,
): Card[] {
  const buckets = bucketsFor(ownedTraits);
  const rarityPool = pool.filter((r) => buckets[r].length > 0);
  if (!rarityPool.length) return []; // 이론상 도달 안 함(공용 카드 10종은 항상 common에 있다)
  const used: Partial<Record<Rarity, Set<StatCardId | TraitId>>> = {};
  return Array.from({ length: n }, () => {
    const r = rollRarity(rnd, rarityPool);
    const set = used[r] ?? (used[r] = new Set());
    return idToCard(drawUnique(buckets[r], set, rnd));
  });
}

// 리액션(리듬) 보상: 노멀급이 안 나온다. highTier(ALL PERFECT)면 상위 두 등급으로 더 좁힌다.
export function reactionCard(highTier: boolean, ownedTraits: TraitId[] = [], rnd: () => number = Math.random): Card {
  const pool: Rarity[] = highTier ? ['epic', 'legend'] : ['uncommon', 'magic', 'epic', 'legend'];
  return drawCards(1, ownedTraits, rnd, pool)[0];
}
