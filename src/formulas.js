// 순수 수식 모음 — GDD 3장 수치를 그대로 옮김. 밸런싱은 여기만 만진다.
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// 위험도 D (GDD 3-2)
export function danger(hpRatio, nearCount) {
  return (1 - hpRatio) * 0.6 + Math.min(nearCount / 10, 1) * 0.4;
}

// 위험도 구간 → 시청자 변화율(초당 비율)과 라벨
export function hypeTier(d) {
  if (d < 0.2) return { rate: -0.03, label: '😴 노잼', color: 0x556677 };
  if (d < 0.45) return { rate: 0.01, label: '🙂 볼만함', color: 0x44aa66 };
  if (d < 0.75) return { rate: 0.05, label: '🔥 꿀잼', color: 0xff8822 };
  return { rate: 0.09, label: '💀 벼랑끝', color: 0xff3333 };
}

// 도네이션 (GDD 3-3)
export function donationInterval(viewers) {
  return clamp(8 / (1 + viewers / 120), 1.2, 8);
}
export function donationAmount(viewers, rnd = Math.random) {
  return Math.round(10 * Math.pow(viewers, 0.6) * (0.8 + rnd() * 0.6));
}

// 리듬 판정 (GDD 3-4) — deltaMs: 입력시각 - 노트시각
export function judge(deltaMs) {
  const a = Math.abs(deltaMs);
  if (a <= 60) return 'perfect';
  if (a <= 140) return 'good';
  return 'miss';
}

// 판정 결과 배열 → 스킬 배율 (GDD 3-4 표)
export function skillResult(results) {
  const n = results.length;
  const perfect = results.filter((r) => r === 'perfect').length;
  const miss = results.filter((r) => r === 'miss').length;
  if (perfect === n) return { mult: 3.0, clear: true, grade: 'ALL PERFECT' };
  if (miss > n / 2) return { mult: 0.3, penalty: true, grade: 'MISS...' };
  if (perfect > n / 2) return { mult: 2.0, grade: 'GREAT' };
  return { mult: 1.0, grade: 'GOOD' };
}
