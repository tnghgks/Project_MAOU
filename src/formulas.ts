// 순수 수식 모음 — GDD 3장 수치를 그대로 옮김. 밸런싱은 여기만 만진다.
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// 위험도 D (GDD 3-2)
export function danger(hpRatio: number, nearCount: number): number {
  return (1 - hpRatio) * 0.6 + Math.min(nearCount / 10, 1) * 0.4;
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

// 도네이션 (GDD 3-3)
// 평균 간격은 시청자 수로 결정, 실제 발생은 지수분포 = 무작위 도착 (정박자 느낌 제거)
export function donationBase(viewers: number): number {
  return clamp(16 / (1 + viewers / 150), 2.5, 16); // ponytail: 후원 빈도 knob — 전 구간 약 2배 간격
}
export function donationInterval(viewers: number, rnd: () => number = Math.random): number {
  const base = donationBase(viewers);
  return clamp(-Math.log(1 - rnd()) * base, base * 0.25, base * 2.5); // 몰아치기/가뭄 둘 다 허용, 극단만 컷
}

const BIG_CHANCE = 0.08; // ponytail: 대박 후원 확률·배율 — 체감 도박성 knob
const BIG_MULT = 5;
export function donationAmount(viewers: number, rnd: () => number = Math.random): number {
  const base = 10 * Math.pow(viewers, 0.6) * (0.5 + rnd() * 1.2); // 0.5x~1.7x
  return Math.round(base * (rnd() < BIG_CHANCE ? BIG_MULT : 1));
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
