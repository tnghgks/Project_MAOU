import { TRAITS, TRAIT_IDS, type TraitId } from './traits.ts';
import { STAT_CARDS, STAT_CARD_IDS, type StatCardId, type StatCardDef } from './cardStats.ts';
import { SUMMON_CURSES, SUMMON_CURSE_IDS, type SummonCurseId } from './cardCurses.ts';
import type { HeroStats } from '../game/store.ts';

// 도네이션 보상 카드. 카드마다 등급이 고정(rarity)이며 — 강화 5종처럼 등급 배율을 곱하는 게 아니라
// 카드 자체가 스탯 mods(전투기획서 원본 수치)나 특성(trait) 하나를 그대로 준다.
export type Rarity = 'common' | 'uncommon' | 'magic' | 'epic' | 'legend';

// 2026-08-03 하향(피드백: "특성 등급 카드가 너무 잘 나온다"): 등급별 보유 카드 수를 보면 common
// 이외 등급은 특성(traits.ts)이 대부분이라(예: epic 7종 중 6종이 특성) 등급이 뜨는 순간 사실상
// 강력한 특성이 뜨는 셈이었다. 기본은 common만 나오다시피 하도록 common 비중을 확 늘리고 나머지는
// 등급이 오를수록 훨씬 가파르게 줄인다 (합계는 1000 기준 — common 85% · uncommon 10% · magic 4% ·
// epic 0.8% · legend 0.2%).
// stars: 룰렛 결과 배너에 표시하는 등급 강도(1~5) — weight와 반대로 등급이 높을수록 커진다.
// prettier-ignore
export const RARITY = {
  common:   { label: '일반', weight: 850, color: '#8fd17a', stars: 1 },
  uncommon: { label: '고급', weight: 100, color: '#4fa3ff', stars: 2 },
  magic:    { label: '희귀', weight: 40,  color: '#b366ff', stars: 3 },
  epic:     { label: '영웅', weight: 8,   color: '#ffcc33', stars: 4 },
  legend:   { label: '전설', weight: 2,   color: '#ff4444', stars: 5 },
} satisfies Record<Rarity, { label: string; weight: number; color: string; stars: number }>;

const ALL: Rarity[] = ['common', 'uncommon', 'magic', 'epic', 'legend'];

// mode: 'flat' = hero[stat]에 그대로 가산 · 'pctCurrent' = 습득 시점 현재값의 value%를 가산 (cardStats.ts 참고)
export interface StatMod {
  stat: keyof HeroStats;
  mode: 'flat' | 'pctCurrent';
  value: number;
}

// trait이 있으면 특성 카드(mods는 항상 빈 배열) — summonCurse가 있으면 "나쁜" 즉시발동 카드(마찬가지로
// mods 빈 배열) — 둘 다 없으면 스탯 카드(음수 mods인 curse 스탯 카드 포함, cardStats.ts 참고). 뽑기·연출·
// 확정 경로가 전부 같고 분기는 endDonation 한 줄이면 끝나므로 별도 카드 타입을 만들지 않는다.
// curse: 룰렛(DonationEvent)·전투 연출(BattleScene) 양쪽이 "나쁜 카드"를 색/이펙트로 구분하는 데 쓰는
// 표시용 플래그 — summonCurse 카드는 항상 true, 저하형 스탯 카드는 STAT_CARDS[id].curse를 그대로 옮긴다.
export interface Card {
  id: StatCardId | TraitId | SummonCurseId;
  rarity: Rarity;
  name: string;
  desc: string;
  mods: StatMod[];
  trait?: TraitId;
  summonCurse?: SummonCurseId;
  curse?: boolean;
}

const pick = <T>(arr: readonly T[], rnd: () => number) => arr[Math.floor(rnd() * arr.length)];

export function statCard(id: StatCardId): Card {
  const c: StatCardDef = STAT_CARDS[id];
  return { id, rarity: c.rarity, name: `${c.icon} ${c.name}`, desc: c.desc, mods: c.mods, curse: c.curse };
}

export function traitCard(id: TraitId): Card {
  const t = TRAITS[id];
  return { id, rarity: t.rarity, name: `${t.icon} ${t.name}`, desc: t.desc, mods: [], trait: id };
}

export function summonCurseCard(id: SummonCurseId): Card {
  const s = SUMMON_CURSES[id];
  return { id, rarity: s.rarity, name: `${s.icon} ${s.name}`, desc: s.desc, mods: [], summonCurse: id, curse: true };
}

const isStatCard = (id: StatCardId | TraitId | SummonCurseId): id is StatCardId => id in STAT_CARDS;
const isSummonCurse = (id: StatCardId | TraitId | SummonCurseId): id is SummonCurseId => id in SUMMON_CURSES;
// 나쁜 카드 = 스탯이 깎이는 저주 카드 + 기습 소환 카드. 아래 확률 상한이 이 둘을 한 덩어리로 본다.
const isNegative = (id: StatCardId | TraitId | SummonCurseId): boolean =>
  isSummonCurse(id) || (isStatCard(id) && !!(STAT_CARDS[id] as StatCardDef).curse);
const idToCard = (id: StatCardId | TraitId | SummonCurseId): Card =>
  isStatCard(id) ? statCard(id) : isSummonCurse(id) ? summonCurseCard(id) : traitCard(id);

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
// 소환 저주(SUMMON_CURSE_IDS)는 특성처럼 중복 제외를 할 이유가 없다(반복 당첨돼도 그때그때 소환일 뿐
// 영구 효과가 아니라서) — 항상 통에 남아있는다.
function bucketsFor(ownedTraits: readonly TraitId[]): Record<Rarity, (StatCardId | TraitId | SummonCurseId)[]> {
  const b: Record<Rarity, (StatCardId | TraitId | SummonCurseId)[]> = {
    common: [], uncommon: [], magic: [], epic: [], legend: [],
  };
  for (const id of STAT_CARD_IDS) b[STAT_CARDS[id].rarity].push(id);
  for (const id of TRAIT_IDS) if (!ownedTraits.includes(id)) b[TRAITS[id].rarity].push(id);
  for (const id of SUMMON_CURSE_IDS) b[SUMMON_CURSES[id].rarity].push(id);
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

// 나쁜 카드 당첨 상한 (2026-08-10). 등급 가중치만으로 뽑으면 common 통 18장 중 8장이 나쁜 카드라
// 체감 40%에 달했다 — 후원이 반쯤 도박이 돼서 룰렛이 반갑지 않았다. 등급을 굴리기 전에 "이번 장이
// 나쁜 카드인가"를 먼저 정해 확률을 고정한다. 해당 등급에 나쁜 카드가 없으면(uncommon 위쪽 대부분)
// 그냥 좋은 카드로 떨어지므로 실제 확률은 늘 이 값 이하다.
// ponytail: 도네이션 체감 knob — 10% 아래로만 유지하면 된다
export const NEGATIVE_CARD_CHANCE = 0.09;

// 이번 뽑기에 쓸 통. 나쁜 카드 차례면 나쁜 것만, 아니면 좋은 것만 — 한쪽이 비면 통째로 되돌린다.
function sideOf(
  bucket: readonly (StatCardId | TraitId | SummonCurseId)[],
  negative: boolean,
): readonly (StatCardId | TraitId | SummonCurseId)[] {
  const side = bucket.filter((id) => isNegative(id) === negative);
  return side.length ? side : bucket;
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
  const used: Partial<Record<Rarity, Set<StatCardId | TraitId | SummonCurseId>>> = {};
  return Array.from({ length: n }, () => {
    const negative = rnd() < NEGATIVE_CARD_CHANCE;
    const r = rollRarity(rnd, rarityPool);
    const set = used[r] ?? (used[r] = new Set());
    return idToCard(drawUnique(sideOf(buckets[r], negative), set, rnd));
  });
}

// 리액션(리듬) 보상: 노멀급이 안 나온다. highTier(ALL PERFECT)면 상위 두 등급으로 더 좁힌다.
export function reactionCard(highTier: boolean, ownedTraits: TraitId[] = [], rnd: () => number = Math.random): Card {
  const pool: Rarity[] = highTier ? ['epic', 'legend'] : ['uncommon', 'magic', 'epic', 'legend'];
  return drawCards(1, ownedTraits, rnd, pool)[0];
}
