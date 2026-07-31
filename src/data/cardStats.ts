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
  | 'swordSaint';

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
  vampiricHunger:   { name: '흡혈귀의 굶주림',   icon: '🩸', rarity: 'magic',    desc: '가한 피해의 5% 흡혈',
                       mods: [{ stat: 'lifesteal' as const,  mode: 'flat' as const,       value: 5 }] },
  swordSaint:       { name: '검성(劍聖)의 경지', icon: '🌟', rarity: 'epic',    desc: '치명타 확률 +20%, 치명타 피해 +100%',
                       mods: [
                         { stat: 'critChance' as const, mode: 'flat' as const, value: 20 },
                         { stat: 'critMult' as const,   mode: 'flat' as const, value: 100 },
                       ] },
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
