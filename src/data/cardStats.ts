// 스탯 전용 도네 카드 카탈로그 — traits.ts와 쌍을 이루는 파일. 조건부 발동 없이 스탯만 바꾸는
// 카드 13종(기획서 원본의 순수 스탯형 카드 그대로). 등급은 카드 자체에 고정(rarity) — cards.ts가
// 그대로 뽑기 가중치에 쓴다. 발동/적용은 store.grantCard가 mods를 순서대로 반영한다.
import type { HeroStats } from '../game/store.ts';
import type { Rarity, StatMod } from './cards.ts';

export interface StatCardDef {
  name: string;
  icon: string;
  desc: string;
  rarity: Rarity;
  mods: StatMod[];
  curse?: boolean; // true = "나쁜" 카드(음수 mods). 뽑기/적용 경로는 동일 — 식별용 표시 플래그일 뿐이다.
}

export type StatCardId =
  | 'sharpBlade'
  | 'sturdyArmor'
  | 'lightSteps'
  | 'basicVitality'
  | 'comboSlash'
  | 'firstAid'
  | 'preciseAim'
  | 'wideArc'
  | 'shieldBash'
  | 'basicEvasion'
  | 'combatExperience'
  | 'vampiricHunger'
  | 'swordSaint'
  // 2026-08-06 추가: 카드 풀 확장 — uncommon~legend 스탯 카드 다양화
  | 'temperedBlade'
  | 'chainmail'
  | 'windBoots'
  | 'crimsonHeart'
  | 'dualBlades'
  | 'fieldMedic'
  | 'hawkEye'
  | 'spearMastery'
  | 'earthSplitter'
  | 'shadowStep'
  | 'greedTouch'
  | 'bloodSeal'
  | 'deadlyBlessing'
  | 'unyieldingHeart'
  | 'ultimateEdge'
  // 2026-08-06 추가: "나쁜" 도네 카드(curse: true) — 능력치가 깎이는 common 카드. common 풀 일부를
  // 대체하는 게 아니라 그대로 추가된다(가중치는 등급 하나로 묶여 있어 common 자체가 뽑힐 확률은 그대로,
  // 그 안에서 어떤 카드가 걸리느냐만 늘어난다).
  | 'bluntBlade'
  | 'heavyBoots'
  | 'crackedShield'
  | 'shakyHands'
  | 'narrowVision'
  | 'rustyJoints'
  | 'cursedPurse';

// mode 규칙: HeroStats 필드가 이미 %미터(defense/dodge/critChance/knockback/goldBonus/lifesteal)거나
// 순수 수치(maxHp/regenFlat)면 'flat'(그 값 그대로 가산) — 원문의 %가 미터 자체의 %p이기 때문.
// atk/atkSpd/speed/range처럼 차원이 있는 수치는 'pctCurrent'(습득 시점 현재값의 value%를 가산) — 원문이
// "현재 공격력의 N% 증가" 식이라 매 픽업마다 그 시점 값 기준으로 중첩 성장한다.
// prettier-ignore
export const STAT_CARDS = {
  sharpBlade:       { name: '날카로운 칼날',    icon: '🗡️', rarity: 'common',   desc: '기본 공격력 +10%',
                       mods: [{ stat: 'atk' as const,        mode: 'pctCurrent' as const, value: 0.10 }] },
  sturdyArmor:      { name: '튼튼한 흉갑',      icon: '🛡️', rarity: 'common',   desc: '받는 피해 -5%',
                       mods: [{ stat: 'defense' as const,    mode: 'flat' as const,       value: 5 }] },
  lightSteps:       { name: '가벼운 발걸음',    icon: '👟', rarity: 'common',   desc: '이동 속도 +10%',
                       mods: [{ stat: 'speed' as const,      mode: 'pctCurrent' as const, value: 0.10 }] },
  basicVitality:    { name: '기초 체력 단련',   icon: '❤️', rarity: 'common',   desc: '최대체력 +20',
                       mods: [{ stat: 'maxHp' as const,      mode: 'flat' as const,       value: 20 }] },
  comboSlash:       { name: '연속 베기',        icon: '⚔️', rarity: 'common',   desc: '공격 속도 +5%',
                       mods: [{ stat: 'atkSpd' as const,     mode: 'pctCurrent' as const, value: 0.05 }] },
  firstAid:         { name: '응급 처치',        icon: '🩹', rarity: 'common',   desc: '비전투 시 5초마다 체력 +2 추가 회복',
                       mods: [{ stat: 'regenFlat' as const,  mode: 'flat' as const,       value: 2 }] },
  preciseAim:       { name: '정확한 조준',      icon: '🎯', rarity: 'common',   desc: '치명타 확률 +5%',
                       mods: [{ stat: 'critChance' as const, mode: 'flat' as const,       value: 5 }] },
  wideArc:          { name: '넓은 궤적',        icon: '🌀', rarity: 'common',   desc: '공격 범위 +10%',
                       mods: [{ stat: 'range' as const,      mode: 'pctCurrent' as const, value: 0.10 }] },
  shieldBash:       { name: '방패 밀치기',      icon: '🔰', rarity: 'common',   desc: '피격 시 주변 적 밀쳐낼 확률 +10%',
                       mods: [{ stat: 'knockback' as const,  mode: 'flat' as const,       value: 10 }] },
  basicEvasion:     { name: '회피의 기본',      icon: '💨', rarity: 'common',   desc: '회피 확률 +5%',
                       mods: [{ stat: 'dodge' as const,      mode: 'flat' as const,       value: 5 }] },
  combatExperience: { name: '실전 경험',        icon: '💰', rarity: 'uncommon', desc: '처치 골드 +15%',
                       mods: [{ stat: 'goldBonus' as const,  mode: 'flat' as const,       value: 15 }] },
  vampiricHunger:   { name: '흡혈귀의 굶주림',   icon: '🩸', rarity: 'magic',    desc: '가한 피해의 3% 흡혈',
                       mods: [{ stat: 'lifesteal' as const,  mode: 'flat' as const,       value: 3 }] },
  swordSaint:       { name: '검성(劍聖)의 경지', icon: '🌟', rarity: 'epic',    desc: '치명타 확률 +20%, 치명타 피해 +100%',
                       mods: [
                         { stat: 'critChance' as const, mode: 'flat' as const, value: 20 },
                         { stat: 'critMult' as const,   mode: 'flat' as const, value: 100 },
                       ] },

  // ── 확장 스탯 카드 (uncommon~legend) — 기존 common 라인의 상위 호환 격, 등급별 뽑기풀을 두텁게 한다 ──
  temperedBlade:    { name: '정련된 강철검',    icon: '🔪', rarity: 'uncommon', desc: '기본 공격력 +18%',
                       mods: [{ stat: 'atk' as const,        mode: 'pctCurrent' as const, value: 0.18 }] },
  chainmail:        { name: '쇠사슬 갑옷',      icon: '🧷', rarity: 'uncommon', desc: '받는 피해 -8%',
                       mods: [{ stat: 'defense' as const,    mode: 'flat' as const,       value: 8 }] },
  windBoots:        { name: '질풍의 부츠',      icon: '👢', rarity: 'uncommon', desc: '이동 속도 +18%',
                       mods: [{ stat: 'speed' as const,      mode: 'pctCurrent' as const, value: 0.18 }] },
  crimsonHeart:     { name: '붉은 심장',        icon: '❤️‍🔥', rarity: 'uncommon', desc: '최대체력 +35',
                       mods: [{ stat: 'maxHp' as const,      mode: 'flat' as const,       value: 35 }] },
  dualBlades:       { name: '쌍검술',          icon: '⚔️', rarity: 'uncommon', desc: '공격 속도 +10%',
                       mods: [{ stat: 'atkSpd' as const,     mode: 'pctCurrent' as const, value: 0.10 }] },
  fieldMedic:       { name: '야전 치료술',      icon: '⛑️', rarity: 'uncommon', desc: '비전투 시 5초마다 체력 +4 추가 회복',
                       mods: [{ stat: 'regenFlat' as const,  mode: 'flat' as const,       value: 4 }] },
  hawkEye:          { name: '매의 눈',         icon: '🦅', rarity: 'uncommon', desc: '치명타 확률 +8%',
                       mods: [{ stat: 'critChance' as const, mode: 'flat' as const,       value: 8 }] },
  spearMastery:     { name: '창술의 달인',      icon: '🔱', rarity: 'uncommon', desc: '공격 범위 +18%',
                       mods: [{ stat: 'range' as const,      mode: 'pctCurrent' as const, value: 0.18 }] },
  earthSplitter:    { name: '대지 가르기',      icon: '💢', rarity: 'uncommon', desc: '피격 시 주변 적 밀쳐낼 확률 +15%',
                       mods: [{ stat: 'knockback' as const,  mode: 'flat' as const,       value: 15 }] },
  shadowStep:       { name: '그림자 걸음',      icon: '🌑', rarity: 'uncommon', desc: '회피 확률 +8%',
                       mods: [{ stat: 'dodge' as const,      mode: 'flat' as const,       value: 8 }] },
  greedTouch:       { name: '탐욕의 손길',      icon: '🤑', rarity: 'magic',    desc: '처치 골드 +25%',
                       mods: [{ stat: 'goldBonus' as const,  mode: 'flat' as const,       value: 25 }] },
  bloodSeal:        { name: '흡혈의 인장',      icon: '🩸', rarity: 'magic',    desc: '가한 피해의 6% 흡혈',
                       mods: [{ stat: 'lifesteal' as const,  mode: 'flat' as const,       value: 6 }] },
  deadlyBlessing:   { name: '치명의 축복',      icon: '💫', rarity: 'magic',    desc: '치명타 확률 +10%, 치명타 피해 +40%',
                       mods: [
                         { stat: 'critChance' as const, mode: 'flat' as const, value: 10 },
                         { stat: 'critMult' as const,   mode: 'flat' as const, value: 40 },
                       ] },
  unyieldingHeart:  { name: '불굴의 심장',      icon: '💗', rarity: 'epic',    desc: '최대체력 +80, 받는 피해 -5%',
                       mods: [
                         { stat: 'maxHp' as const,   mode: 'flat' as const, value: 80 },
                         { stat: 'defense' as const, mode: 'flat' as const, value: 5 },
                       ] },
  ultimateEdge:     { name: '궁극의 검기',      icon: '✨', rarity: 'legend',   desc: '기본 공격력 +30%, 치명타 피해 +50%',
                       mods: [
                         { stat: 'atk' as const,      mode: 'pctCurrent' as const, value: 0.30 },
                         { stat: 'critMult' as const, mode: 'flat' as const,       value: 50 },
                       ] },

  // ── 나쁜 카드(curse) — 도네이션이 항상 이득만은 아니게. common 등급, 수치는 한 장으로는
  // 체감이 크지 않되 여러 장 겹치면 아쉬워지는 선(음수 pctCurrent/%미터라 값이 음수로 폭주하지
  // 않는다 — rollChance/mitigate가 0 밑을 자동으로 무해하게 처리한다) ──
  bluntBlade:       { name: '무딘 칼날',        icon: '💔', rarity: 'common', curse: true, desc: '기본 공격력 -8%',
                       mods: [{ stat: 'atk' as const,        mode: 'pctCurrent' as const, value: -0.08 }] },
  heavyBoots:       { name: '무거운 군화',      icon: '🥾', rarity: 'common', curse: true, desc: '이동 속도 -10%',
                       mods: [{ stat: 'speed' as const,      mode: 'pctCurrent' as const, value: -0.10 }] },
  crackedShield:    { name: '금이 간 방패',     icon: '🔻', rarity: 'common', curse: true, desc: '방어력 -5%p',
                       mods: [{ stat: 'defense' as const,    mode: 'flat' as const,       value: -5 }] },
  shakyHands:       { name: '떨리는 손',        icon: '✋', rarity: 'common', curse: true, desc: '치명타 확률 -5%p',
                       mods: [{ stat: 'critChance' as const, mode: 'flat' as const,       value: -5 }] },
  narrowVision:     { name: '좁아진 시야',      icon: '👓', rarity: 'common', curse: true, desc: '공격 범위 -10%',
                       mods: [{ stat: 'range' as const,      mode: 'pctCurrent' as const, value: -0.10 }] },
  rustyJoints:      { name: '녹슨 관절',        icon: '⚙️', rarity: 'common', curse: true, desc: '공격 속도 -8%',
                       mods: [{ stat: 'atkSpd' as const,     mode: 'pctCurrent' as const, value: -0.08 }] },
  cursedPurse:      { name: '저주받은 지갑',    icon: '💸', rarity: 'common', curse: true, desc: '처치 골드 -15%',
                       mods: [{ stat: 'goldBonus' as const,  mode: 'flat' as const,       value: -15 }] },
} satisfies Record<StatCardId, StatCardDef>;

export const STAT_CARD_IDS = Object.keys(STAT_CARDS) as StatCardId[];

// 카드 하나가 hero에 반영할 실제 델타 — pctCurrent는 습득 시점 현재 스탯 기준으로 매번 새로 계산.
export function resolveMods(mods: readonly StatMod[], hero: HeroStats): Partial<HeroStats> {
  const out: Partial<Record<keyof HeroStats, number>> = {};
  for (const mod of mods) {
    const base = (out[mod.stat] ?? hero[mod.stat]) as number;
    const delta = mod.mode === 'pctCurrent' ? base * mod.value : mod.value;
    out[mod.stat] = Math.round((base + delta) * 100) / 100;
  }
  return out;
}
