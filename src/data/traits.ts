// 용사 특성 — 스탯(upgrades/cardStats)과 달리 "전투 규칙"을 바꾼다. 도네 카드로만 얻고
// 런 한정(스킬과 같은 수명). 등급은 카드 자체가 아니라 여기 고정(rarity) — cards.ts는 이 값을
// 그대로 뽑기 가중치에 쓴다. 효과 적용 지점은 BattleScene(공격/피격/처치/프레임 갱신) 쪽.
import type { Rarity } from './cards.ts';
import type { HeroEntity, MonsterEntity } from '../game/entities.ts';

export type TraitId =
  | 'vamp'
  | 'thorns'
  | 'berserk'
  | 'warriorBlood'
  | 'heavyStrike'
  | 'ironWill'
  | 'thornBlade'
  | 'iaido'
  | 'windSlash'
  | 'warCry'
  | 'flameSword'
  | 'frostStrike'
  | 'chainLightning'
  | 'shadowClone'
  | 'furyBlast'
  | 'infiniteDance'
  | 'giantBlade'
  | 'phoenixFeather'
  | 'excalibur'
  | 'timeSlash';

export interface TraitDef {
  name: string;
  icon: string;
  desc: string;
  rarity: Rarity;
}

// ponytail: 특성 밸런스 knob — 전부 여기 상수로
export const VAMP_RATIO = 0.12; // 입힌 피해의 회복 비율 (2026-07-31 하향: 0.2 → 0.12, 흡혈 과다 피드백)
export const THORNS_RATIO = 0.4; // 근접 피격 시 반사 비율
export const BERSERK_MAX = 0.8; // HP 0%일 때 공격력 가산 배율
export const WARRIOR_BLOOD_HEAL = 0.01; // 처치 시 즉시 회복하는 최대체력 비율
export const HEAVY_STRIKE_EVERY = 3; // 몇 번째 공격마다 발동
export const HEAVY_STRIKE_MULT = 1.5; // 발동 시 피해 배율
export const HEAVY_STRIKE_STUN = 0.5; // 발동 시 경직(초)
export const IRON_WILL_HP_RATIO = 0.5; // 이 비율 이하로 떨어지면 발동
export const IRON_WILL_DEFENSE_BONUS = 20; // 발동 중 추가 방어(%)
export const THORN_BLADE_CHANCE = 0.15; // 적중 시 출혈 부여 확률
export const THORN_BLADE_DOT_T = 3; // 출혈 지속(초)
export const THORN_BLADE_DPS_RATIO = 0.2; // 출혈 초당 피해 = atk * 이 값
export const WIND_SLASH_RANGE_MULT = 1.6; // 관통 대상 탐지 거리 = range * 이 값
export const WIND_SLASH_DMG_RATIO = 0.5; // 관통 대상 피해 비율
export const WAR_CRY_STUN = 2; // 카드 획득 시 전체 몬스터 기절(초)
export const FLAME_SWORD_DOT_T = 5; // 화상 지속(초, 갱신형)
export const FLAME_SWORD_DPS_RATIO = 0.15; // 화상 1스택 초당 피해 = atk * 이 값
export const FLAME_SWORD_MAX_STACK = 3; // 화상 최대 중첩
export const FROST_STRIKE_STUN = 2; // 치명타 시 빙결(초) — 일반 몬스터
export const FROST_STRIKE_BOSS_STUN = 0.6; // 보스는 완전 무력화 대신 짧은 둔화만
export const CHAIN_LIGHTNING_CHANCE = 0.2; // 적중 시 발동 확률
export const CHAIN_LIGHTNING_TARGETS = 3; // 원래 대상 제외 추가 전이 인원
export const CHAIN_LIGHTNING_RATIO = 0.6; // 전이 피해 비율
export const SHADOW_CLONE_CHANCE = 0.1; // 공격 시 분신 발동 확률(같은 피해 즉시 1회 추가)
export const FURY_BLAST_RATIO = 2.0; // 피격 시 폭발 피해 = atk * 이 값
export const FURY_BLAST_RADIUS = 100; // 폭발 반경(px)
export const INFINITE_DANCE_RATE = 0.25; // 이동 중 초당 쌓이는 가산 배율
export const INFINITE_DANCE_MAX = 0.5; // 최대 가산 배율(+50%)
export const INFINITE_DANCE_RESET_IDLE = 1; // 이 시간(초) 이상 정지하면 스택 초기화
export const GIANT_BLADE_ATKSPD_MULT = 0.7; // 습득 즉시 공속에 곱해지는 배율(1회성)
export const GIANT_BLADE_RANGE_MULT = 2; // 습득 즉시 사거리에 곱해지는 배율(1회성)
export const GIANT_BLADE_DMG_MULT = 1.5; // 상시 피해 배율
export const PHOENIX_HP_RATIO = 0.5; // 부활 시 회복되는 최대체력 비율
export const PHOENIX_BURN_DPS_RATIO = 0.15; // 부활 시 전체 화상 초당 피해 = atk * 이 값
export const PHOENIX_BURN_T = 5; // 부활 시 전체 화상 지속(초)
export const EXCALIBUR_DMG_MULT = 4; // 상시 피해 배율(피해량 300% 증가 = 4배)
// 사거리는 고정값이 아니라 습득 시점 화면 절반(ARENA.w / 2)을 BattleScene에서 목표로 계산하지만,
// 실제 반영은 store.applyStatMods의 RANGE_CAP(기본값의 3배) 클램프를 그대로 통과한다 — 즉 엑스칼리버는
// "사거리 상한에 곧바로 닿는다"는 의미로 남는다(2026-07-31 사거리 상한 도입).
export const TIME_SLASH_EVERY = 10; // 몇 번째 공격마다 발동
export const TIME_SLASH_FREEZE_MS = 2000; // 발동 시 전체 시간 정지(ms)
export const TIME_SLASH_DMG_MULT = 1.5; // 정지 창 동안 가한 피해 증폭

// prettier-ignore
export const TRAITS = {
  vamp:           { name: '흡혈',            icon: '🩸', rarity: 'epic',     desc: `입힌 피해의 ${VAMP_RATIO * 100}% 회복` },
  thorns:         { name: '반격',            icon: '🛡',  rarity: 'epic',     desc: `근접 피격 시 ${THORNS_RATIO * 100}% 반사` },
  berserk:        { name: '광전사',          icon: '🔥', rarity: 'epic',     desc: `HP가 낮을수록 공격력 최대 +${BERSERK_MAX * 100}%` },
  warriorBlood:   { name: '전사의 피',        icon: '🩸', rarity: 'uncommon', desc: `처치 시 최대체력의 ${WARRIOR_BLOOD_HEAL * 100}% 즉시 회복` },
  heavyStrike:    { name: '묵직한 강타',      icon: '💥', rarity: 'uncommon', desc: `${HEAVY_STRIKE_EVERY}번째 공격마다 ${HEAVY_STRIKE_MULT * 100}% 피해 + 경직` },
  ironWill:       { name: '강철의 의지',      icon: '🛡',  rarity: 'uncommon', desc: `HP ${IRON_WILL_HP_RATIO * 100}% 이하일 때 방어력 +${IRON_WILL_DEFENSE_BONUS}%` },
  thornBlade:     { name: '가시 돋친 검',     icon: '🩹', rarity: 'uncommon', desc: `적중 시 ${THORN_BLADE_CHANCE * 100}% 확률로 ${THORN_BLADE_DOT_T}초 출혈` },
  iaido:          { name: '거합도',          icon: '⚔️', rarity: 'uncommon', desc: '전투 시작 후 첫 공격은 반드시 치명타' },
  windSlash:      { name: '바람 가르기',      icon: '🌪️', rarity: 'uncommon', desc: `공격 시 사거리 밖 가장 가까운 적에게도 ${WIND_SLASH_DMG_RATIO * 100}% 피해` },
  warCry:         { name: '전투의 함성',      icon: '📢', rarity: 'uncommon', desc: `카드를 얻을 때마다 전체 몬스터 ${WAR_CRY_STUN}초 기절` },
  flameSword:     { name: '화염검',          icon: '🔥', rarity: 'magic',    desc: `적중 시 ${FLAME_SWORD_DOT_T}초간 중첩되는 화상 부여(최대 ${FLAME_SWORD_MAX_STACK}중첩)` },
  frostStrike:    { name: '빙결의 일격',      icon: '❄️', rarity: 'magic',    desc: `치명타 시 대상을 ${FROST_STRIKE_STUN}초간 빙결(보스는 둔화)` },
  chainLightning: { name: '뇌전 방출',        icon: '⚡', rarity: 'magic',    desc: `적중 시 ${CHAIN_LIGHTNING_CHANCE * 100}% 확률로 주변 최대 ${CHAIN_LIGHTNING_TARGETS}명에게 전이 피해` },
  shadowClone:    { name: '그림자 분신',      icon: '👥', rarity: 'magic',    desc: `공격 시 ${SHADOW_CLONE_CHANCE * 100}% 확률로 분신이 같은 공격을 한 번 더` },
  furyBlast:      { name: '폭발적인 분노',    icon: '💢', rarity: 'magic',    desc: `피격 시 주변 적 전체에게 공격력의 ${FURY_BLAST_RATIO * 100}% 피해` },
  infiniteDance:  { name: '무한의 검무',      icon: '💃', rarity: 'epic',     desc: `이동 중 공속·이속이 서서히 증가해 최대 +${INFINITE_DANCE_MAX * 100}% (정지 시 초기화)` },
  giantBlade:     { name: '거인의 대검',      icon: '🗡️', rarity: 'epic',     desc: `공속 ${Math.round(GIANT_BLADE_ATKSPD_MULT * 100)}%, 사거리 ${GIANT_BLADE_RANGE_MULT}배, 피해 +${(GIANT_BLADE_DMG_MULT - 1) * 100}%` },
  phoenixFeather: { name: '불사조의 깃털',    icon: '🪶', rarity: 'epic',     desc: '치명적인 피해를 받으면 1회, 체력 50%로 부활 + 전체 화상' },
  excalibur:      { name: '엑스칼리버의 강림', icon: '✨', rarity: 'legend',   desc: `모든 공격 사거리 대폭 증가, 피해 +${(EXCALIBUR_DMG_MULT - 1) * 100}%` },
  timeSlash:      { name: '시공간 베기',      icon: '⏳', rarity: 'legend',   desc: `${TIME_SLASH_EVERY}번째 공격마다 ${TIME_SLASH_FREEZE_MS / 1000}초 시간 정지 + 그 동안 피해 ${TIME_SLASH_DMG_MULT}배` },
} satisfies Record<string, TraitDef>;

export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

export const hasTrait = (traits: readonly TraitId[], id: TraitId) => traits.includes(id);
const has = hasTrait;

// 광전사: HP 100%면 1배, 0%면 1+BERSERK_MAX. danger()의 벼랑끝 보너스와 같은 방향이라
// "피 깎인 채로 버틴다"가 화력·시청자 양쪽으로 보상된다.
export const heroAtkMult = (traits: readonly TraitId[], hpRatio: number) =>
  (has(traits, 'berserk') ? 1 + BERSERK_MAX * (1 - Math.max(0, Math.min(1, hpRatio))) : 1) *
  (has(traits, 'giantBlade') ? GIANT_BLADE_DMG_MULT : 1) *
  (has(traits, 'excalibur') ? EXCALIBUR_DMG_MULT : 1);

// 시공간 베기: 발동 창(hero.timeSlashT > 0) 동안 가한 모든 피해가 증폭.
export const timeSlashMult = (hero: Pick<HeroEntity, 'timeSlashT'>) => (hero.timeSlashT > 0 ? TIME_SLASH_DMG_MULT : 1);

export const vampHeal = (traits: readonly TraitId[], dmg: number) => (has(traits, 'vamp') ? dmg * VAMP_RATIO : 0);

export const thornsDmg = (traits: readonly TraitId[], dmg: number) => (has(traits, 'thorns') ? dmg * THORNS_RATIO : 0);

export const warriorBloodHeal = (traits: readonly TraitId[], maxHp: number) =>
  has(traits, 'warriorBlood') ? maxHp * WARRIOR_BLOOD_HEAL : 0;

// 강철의 의지: 조건부 방어 가산 — 스탯 defense(%)에 얹어서 hurtHero가 쓴다.
export const defenseBonus = (traits: readonly TraitId[], hpRatio: number) =>
  has(traits, 'ironWill') && hpRatio <= IRON_WILL_HP_RATIO ? IRON_WILL_DEFENSE_BONUS : 0;

// 화상/출혈 dot을 몬스터에 적용(갱신형) — flameSword는 스택마다 dps를 더하고 지속시간을 늘린다.
export function applyDot(m: MonsterEntity, dps: number, dur: number, maxDps?: number) {
  m.dotDps = maxDps != null ? Math.min(maxDps, (m.dotDps ?? 0) + dps) : dps;
  m.dotT = Math.max(m.dotT ?? 0, dur);
}

export function applyStun(m: MonsterEntity, sec: number) {
  m.stunT = Math.max(m.stunT ?? 0, sec);
}
