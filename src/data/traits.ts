// 용사 특성 — 스탯(upgrades)과 달리 "전투 규칙"을 바꾼다. 도네 카드로만 얻고 런 한정(스킬과 같은 수명).
// 효과 적용 지점은 BattleScene 세 곳뿐: 공격(광전사) · 피해(흡혈) · 근접 피격(반격).

export type TraitId = 'vamp' | 'thorns' | 'berserk';

export interface TraitDef {
  name: string;
  icon: string;
  desc: string;
}

// ponytail: 특성 밸런스 knob은 아래 세 상수
export const VAMP_RATIO = 0.2; // 입힌 피해의 회복 비율
export const THORNS_RATIO = 0.4; // 근접 피격 시 반사 비율
export const BERSERK_MAX = 0.8; // HP 0%일 때 공격력 가산 배율

// prettier-ignore
export const TRAITS = {
  vamp:    { name: '흡혈',   icon: '🩸', desc: `입힌 피해의 ${VAMP_RATIO * 100}% 회복` },
  thorns:  { name: '반격',   icon: '🛡', desc: `근접 피격 시 ${THORNS_RATIO * 100}% 반사` },
  berserk: { name: '광전사', icon: '🔥', desc: `HP가 낮을수록 공격력 최대 +${BERSERK_MAX * 100}%` },
} satisfies Record<string, TraitDef>;

export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

const has = (traits: readonly TraitId[], id: TraitId) => traits.includes(id);

// 광전사: HP 100%면 1배, 0%면 1+BERSERK_MAX. danger()의 벼랑끝 보너스와 같은 방향이라
// "피 깎인 채로 버틴다"가 화력·시청자 양쪽으로 보상된다.
export const heroAtkMult = (traits: readonly TraitId[], hpRatio: number) =>
  has(traits, 'berserk') ? 1 + BERSERK_MAX * (1 - Math.max(0, Math.min(1, hpRatio))) : 1;

export const vampHeal = (traits: readonly TraitId[], dmg: number) => (has(traits, 'vamp') ? dmg * VAMP_RATIO : 0);

export const thornsDmg = (traits: readonly TraitId[], dmg: number) => (has(traits, 'thorns') ? dmg * THORNS_RATIO : 0);

// 아직 없는 특성 — 도네 카드 풀에 넣을 목록 (중복 획득 방지)
export const missingTraits = (owned: readonly TraitId[]) => TRAIT_IDS.filter((id) => !owned.includes(id));
