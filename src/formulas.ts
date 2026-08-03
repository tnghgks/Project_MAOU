// 순수 수식 모음 — GDD 3장 수치를 그대로 옮김. 밸런싱은 여기만 만진다.
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// 위험도 D (GDD 3-2)
// HP·근접 몬스터 수만으로 결정 — 둘 다 "지금 얼마나 몰렸는가"를 재는 항목이라야 한다.
// 콤보는 컨트롤 실력 지표라 위험도(=긴장감) 축과 성격이 달라 뺐다 — COMBO_FULL은 아래 도네이션 보정으로 이동.
export const BRINK_HP = 0.15; // ponytail: "벼랑끝을 버티는 중"으로 인정하는 선
export const BRINK_BONUS = 0.15; // 유지만 해도 한 티어 위로 밀어올린다
export function danger(hpRatio: number, nearCount: number): number {
  return (1 - hpRatio) * 0.6 + Math.min(nearCount / 10, 1) * 0.4 + (hpRatio <= BRINK_HP ? BRINK_BONUS : 0);
}

export const COMBO_FULL = 12; // 이 콤보부터 "FULL" — ComboMeter 표시 + 도네이션 확률 보정 기준
export const COMBO_DONATION_CUT = 2.5; // FULL 콤보 중 도네이션이 터지면 다음 간격을 이만큼 당긴다 (체감 미미하게)

// 위험도 구간 → 시청자 변화율(초당 비율)과 라벨
export interface HypeTier {
  rate: number;
  label: string;
  color: number;
}
// 2026-07-30 재조정: 하락은 완만하게, 상승은 뚜렷하게 — 평상시(노잼)에 자주 빠지는 게
// 체감상 "계속 하락세"로 느껴지지 않도록 하락 폭을 줄이고, 상승 폭은 더 크게 벌렸다.
export function hypeTier(d: number): HypeTier {
  if (d < 0.2) return { rate: -0.003, label: '😴 노잼', color: 0x556677 };
  if (d < 0.45) return { rate: 0.02, label: '🙂 볼만함', color: 0x44aa66 };
  if (d < 0.75) return { rate: 0.05, label: '🔥 꿀잼', color: 0xff8822 };
  return { rate: 0.08, label: '💀 벼랑끝', color: 0xff3333 };
}

// 시청자 증감 흔들림 — tier.rate에 더해지는 보정치.
// 프레임마다 독립 난수를 쓰면 미세 진동으로만 보인다. 0으로 천천히 되돌아오는 랜덤워크라야
// "한참 잘 늘다가 갑자기 빠지는" 실제 방송처럼 보인다.
const DRIFT_KICK = 0.04; // 무작위 충격 세기
const DRIFT_REVERT = 0.5; // 0으로 복귀하는 속도 (클수록 빨리 진정)
export const DRIFT_MAX = 0.05; // ponytail: 흔들림 상한 — tier.rate와 비슷한 크기라 체감이 크다
export function viewerDrift(drift: number, dt: number, rnd: () => number = Math.random): number {
  const revert = -drift * DRIFT_REVERT * dt;
  const kick = (rnd() * 2 - 1) * DRIFT_KICK * Math.sqrt(dt);
  return clamp(drift + revert + kick, -DRIFT_MAX, DRIFT_MAX);
}

// 도네이션 카드 확장 스탯(%미터) 공용 수식 — HeroStats.defense/dodge/critChance/critMult/goldBonus가 여길 통과한다.
export const CRIT_BASE_MULT = 1.5; // 치명타 기본 피해 배율 — critMult(%)는 여기 가산
// pct는 %p 단위(0~100+) 그대로 받는다 — 호출부가 매번 /100 하지 않도록.
export function rollChance(pct: number, rnd: () => number = Math.random): boolean {
  return rnd() * 100 < pct;
}
export const critMultiplier = (critMultPct: number) => CRIT_BASE_MULT + critMultPct / 100;
export const mitigate = (dmg: number, defensePct: number) => dmg * (1 - clamp(defensePct, 0, 100) / 100);
export const goldWithBonus = (gold: number, goldBonusPct: number) => Math.round(gold * (1 + goldBonusPct / 100));

// 도네이션 (GDD 3-3)
// 간격은 시청자 수만으로 결정 — 후원마다 게임이 멈추고 카드가 뜨므로 난수 몰아치기는 뺐다.
// 2026-08-03 하향(피드백: "도네이션이 너무 잦다"): 상한/하한을 25→30초·10→15초로 늘리고
// 기울기(6)도 완만하게 해 하한 도달 시점을 1만→약 1.5만 명으로 늦췄다.
// 46명 이하 30초(상한) · 1000명 22초 · 15000명 이상 15초(하한).
export function donationInterval(viewers: number): number {
  return clamp(40 - 6 * Math.log10(Math.max(1, viewers)), 15, 30); // ponytail: 40/6 = 후원 빈도 knob
}

export const JACKPOT_CHANCE = 0.08; // ponytail: 대박 후원(=리액션 이벤트) 확률·배율 knob
export const JACKPOT_MULT = 5;
export interface DonationRoll {
  amount: number;
  jackpot: boolean; // 리액션 이벤트(춤 + 리듬 + 고등급 카드) 발동 여부
}
export function rollDonation(viewers: number, rnd: () => number = Math.random): DonationRoll {
  const base = 10 * Math.pow(viewers, 0.6) * (0.5 + rnd() * 1.2); // 0.5x~1.7x
  const jackpot = rnd() < JACKPOT_CHANCE;
  return { amount: Math.round(base * (jackpot ? JACKPOT_MULT : 1)), jackpot };
}

// 도네이션 상하한 — 육성 화면 업그레이드 가격에 연동한다. 순수 시청자수 공식만으로는 초반엔
// 아무 업그레이드도 못 살 만큼 적고, 후반엔 한 방에 다 살 만큼 커질 수 있어서 둘 다 막는다.
// 레벨이 오르면 업그레이드 가격도 같이 오르므로 하한/상한도 자동으로 커진다. 잭팟(5배)도 이 상한을 넘지 않는다.
export const DONATION_MIN_RATIO = 0.2; // 지금 가장 싼 업그레이드 가격의 20%
export const DONATION_MAX_RATIO = 1.5; // 지금 가장 비싼 업그레이드 가격의 150%
export function clampDonation(amount: number, cheapestCost: number, priciestCost: number): number {
  return Math.round(clamp(amount, cheapestCost * DONATION_MIN_RATIO, priciestCost * DONATION_MAX_RATIO));
}

// 시청자 이탈 2단계 경보:
//  WARN_VIEWERS(5) 이하 — 화면 살짝 흔들림 + 시청자 수 주황
//  MIN_VIEWERS(1) 도달 — 즉시 CRIT_TIME 카운트다운, CRIT_ESCAPE명까지 못 올리면 방송 종료
export const WARN_VIEWERS = 5;
export const MIN_VIEWERS = 1;
export const CRIT_TIME = 10;
export const CRIT_ESCAPE = 2; // ponytail: 바닥에서 "늘었다"고 인정하는 선 — 난이도 knob

// 판정은 반드시 화면 표시와 같은 기준(내림)으로 — 5.4는 플레이어에게 "5명"으로 보인다.
// 실수값을 그대로 비교하면 "5명인데 경고가 안 뜬다"가 된다.
export type CritAction = 'none' | 'enter' | 'exit' | 'fail';
export function criticalStep(viewers: number, critical: boolean, critT: number): CritAction {
  const v = Math.floor(viewers);
  if (!critical) return v <= MIN_VIEWERS ? 'enter' : 'none';
  if (v >= CRIT_ESCAPE) return 'exit'; // 탈출이 만료보다 우선
  return critT <= 0 ? 'fail' : 'none';
}

// criticalStep을 한 프레임 적용하는 순수 리듀서: 감소 → 분류 → 상태 반영.
// BattleScene.updateCritical과 test/critical.test.ts가 이 전이 로직을 공유한다(재구현 금지).
// s를 제자리 변이하고, 씬이 연출(채팅/방송종료)로 반응할 이벤트만 반환한다. 'none'은 null.
export interface CritState {
  critical: boolean;
  critT: number;
}
export type CritEvent = 'enter' | 'exit' | 'fail' | null;
export function stepCritical(s: CritState, viewers: number, dt: number): CritEvent {
  if (s.critical) s.critT -= dt;
  const action = criticalStep(viewers, s.critical, s.critT);
  if (action === 'enter') {
    s.critical = true;
    s.critT = CRIT_TIME;
  } else if (action === 'exit') {
    s.critical = false;
    s.critT = 0;
  }
  return action === 'none' ? null : action;
}

// 카운트다운은 히스테리시스(CRIT_ESCAPE)를 타므로 critical 상태를 그대로 받는다
export type ViewerAlert = 'normal' | 'warn' | 'critical';
export function viewerAlert(viewers: number, critical: boolean): ViewerAlert {
  if (critical) return 'critical';
  return Math.floor(viewers) <= WARN_VIEWERS ? 'warn' : 'normal';
}

// 리듬 판정 (GDD 3-4) — deltaMs: 입력시각 - 노트시각
export type Judgement = 'perfect' | 'good' | 'miss';
export function judge(deltaMs: number): Judgement {
  const a = Math.abs(deltaMs);
  if (a <= 60) return 'perfect';
  if (a <= 140) return 'good';
  return 'miss';
}

// 판정 결과 배열 → 리듬 보상 (GDD 3-4 표, 2026-07-28 개편: 스킬 데미지 배율 → 시청자 변화율 + 스킬 등급 획득).
// highTier는 리액션 보상 카드 등급 게이팅용(cards.reactionCard가 소비) — ALL PERFECT/GREAT일 때만 true,
// 예전 mult>=2 기준을 그대로 승계한다.
export type SkillRarity = 'common' | 'uncommon' | 'epic';
export interface SkillOutcome {
  grade: string;
  viewerMult: number; // 시청자 배율 (예: 1.05 = +5%)
  rarity?: SkillRarity; // 이번 결과로 획득 시도할 스킬 등급 (penalty면 없음)
  bonusDonation?: boolean; // ALL PERFECT 전용 — 추가 골드 도네이션
  highTier?: boolean;
  clear?: boolean;
  penalty?: boolean;
}
export function skillResult(results: Judgement[]): SkillOutcome {
  const n = results.length;
  const perfect = results.filter((r) => r === 'perfect').length;
  const miss = results.filter((r) => r === 'miss').length;
  if (perfect === n) {
    return { grade: 'ALL PERFECT', viewerMult: 1.05, rarity: 'epic', bonusDonation: true, highTier: true, clear: true };
  }
  if (miss > n / 2) return { grade: 'MISS...', viewerMult: 0.95, penalty: true };
  if (perfect > n / 2) return { grade: 'GREAT', viewerMult: 1.03, rarity: 'uncommon', highTier: true };
  return { grade: 'GOOD', viewerMult: 1.01, rarity: 'common' };
}
