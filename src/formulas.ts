// 순수 수식 모음 — GDD 3장 수치를 그대로 옮김. 밸런싱은 여기만 만진다.
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// 위험도 D (GDD 3-2)
// 기본 두 항(HP·근접 수)에 용사 직접 조작에서만 실질적으로 붙는 두 보너스를 더한다.
// 자동 AI는 콤보를 못 쌓고 RETREAT_HP(25%)에서 도망치므로 둘 다 사실상 용사 모드 전용 스코어링이다.
export const BRINK_HP = 0.3; // ponytail: "벼랑끝을 버티는 중"으로 인정하는 선
export const BRINK_BONUS = 0.15; // 유지만 해도 한 티어 위로 밀어올린다
export const COMBO_FULL = 8; // 이 콤보에서 가산 최대
export const COMBO_BONUS = 0.3;
export function danger(hpRatio: number, nearCount: number, combo = 0): number {
  return (
    (1 - hpRatio) * 0.6 +
    Math.min(nearCount / 10, 1) * 0.4 +
    (hpRatio <= BRINK_HP ? BRINK_BONUS : 0) +
    Math.min(combo / COMBO_FULL, 1) * COMBO_BONUS
  );
}

// 위험도 구간 → 시청자 변화율(초당 비율)과 라벨
export interface HypeTier {
  rate: number;
  label: string;
  color: number;
}
export function hypeTier(d: number): HypeTier {
  if (d < 0.2) return { rate: -0.03, label: '😴 노잼', color: 0x556677 };
  if (d < 0.45) return { rate: 0.01, label: '🙂 볼만함', color: 0x44aa66 };
  if (d < 0.75) return { rate: 0.05, label: '🔥 꿀잼', color: 0xff8822 };
  return { rate: 0.09, label: '💀 벼랑끝', color: 0xff3333 };
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

// 도네이션 (GDD 3-3)
// 간격은 시청자 수만으로 결정 — 후원마다 게임이 멈추고 카드가 뜨므로 난수 몰아치기는 뺐다.
// 10명 30초(상한) · 1000명 15.5초 · 1만명 8초 · 하한 5초는 2.5만명부터.
export function donationInterval(viewers: number): number {
  return clamp(38 - 7.5 * Math.log10(Math.max(1, viewers)), 5, 30); // ponytail: 38/7.5 = 후원 빈도 knob
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

// 판정 결과 배열 → 스킬 배율 (GDD 3-4 표)
export interface SkillOutcome {
  mult: number;
  grade: string;
  clear?: boolean;
  penalty?: boolean;
}
export function skillResult(results: Judgement[]): SkillOutcome {
  const n = results.length;
  const perfect = results.filter((r) => r === 'perfect').length;
  const miss = results.filter((r) => r === 'miss').length;
  if (perfect === n) return { mult: 3.0, clear: true, grade: 'ALL PERFECT' };
  if (miss > n / 2) return { mult: 0.3, penalty: true, grade: 'MISS...' };
  if (perfect > n / 2) return { mult: 2.0, grade: 'GREAT' };
  return { mult: 1.0, grade: 'GOOD' };
}
