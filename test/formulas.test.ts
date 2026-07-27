import assert from 'node:assert';
import {
  danger,
  hypeTier,
  donationBase,
  donationInterval,
  donationAmount,
  judge,
  skillResult,
  viewerDrift,
  DRIFT_MAX,
} from '../src/formulas.ts';

// 위험도: 풀피+몹0 = 0, 빈사+몹10 = 1
assert.strictEqual(danger(1, 0), 0);
assert.strictEqual(danger(0, 10), 1);
assert.ok(Math.abs(danger(0.5, 5) - 0.5) < 1e-9);

// 구간 경계
assert.strictEqual(hypeTier(0.1).rate, -0.03);
assert.strictEqual(hypeTier(0.5).rate, 0.05);
assert.strictEqual(hypeTier(0.9).rate, 0.09);

// 도네 평균 간격
assert.ok(Math.abs(donationBase(12) - 14.81) < 0.01);
assert.strictEqual(donationBase(20000), 2.5); // 하한
assert.strictEqual(donationBase(0), 16); // 상한
// 시청자가 늘수록 짧아진다 (단조 감소)
assert.ok(donationBase(12) > donationBase(300) && donationBase(300) > donationBase(3000));

// 실제 간격은 지수분포 — 평균은 base 근처, 극단은 [0.25x, 2.5x]로 컷
{
  const base = donationBase(500);
  assert.strictEqual(
    donationInterval(500, () => 0),
    base * 0.25,
  ); // rnd→0: 하한 클램프
  assert.strictEqual(
    donationInterval(500, () => 0.999999),
    base * 2.5,
  ); // rnd→1: 상한 클램프
  let sum = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) sum += donationInterval(500, Math.random);
  const mean = sum / n;
  assert.ok(mean > base * 0.7 && mean < base * 1.3, `mean=${mean} base=${base}`);
}

// 도네 금액: 12명 × rnd=0.5 → 10*12^0.6*1.1 ≈ 49G (대박 미발동)
const amt = donationAmount(12, () => 0.5);
assert.ok(amt > 30 && amt < 60, `amt=${amt}`);
// 대박: 두 번째 rnd가 임계 아래면 5배 (반올림은 곱한 뒤라 ±1 오차 허용)
{
  const seq = [0.5, 0.01];
  let i = 0;
  const big = donationAmount(12, () => seq[i++]);
  assert.ok(Math.abs(big - amt * 5) <= 1, `big=${big} amt=${amt}`);
}

// ── 시청자 증감 흔들림 ──
const dt = 1 / 60;
{
  // 상한 안에 머문다 (난수가 계속 한쪽으로 쏠려도)
  let d = 0;
  for (let i = 0; i < 60 * 300; i++) d = viewerDrift(d, dt, () => 1);
  assert.ok(Math.abs(d) <= DRIFT_MAX + 1e-9, `상한 이탈: ${d}`);
  let u = 0;
  for (let i = 0; i < 60 * 300; i++) u = viewerDrift(u, dt, () => 0);
  assert.ok(Math.abs(u) <= DRIFT_MAX + 1e-9, `하한 이탈: ${u}`);
}
{
  // 충격이 없으면 0으로 되돌아온다
  let d = DRIFT_MAX;
  for (let i = 0; i < 60 * 30; i++) d = viewerDrift(d, dt, () => 0.5);
  assert.ok(Math.abs(d) < DRIFT_MAX * 0.1, `0으로 수렴하지 않음: ${d}`);
}
{
  // 핵심: 프레임 간에는 이어지되(진동 아님), 수십 초 단위로는 크게 방황해야 자연스럽다
  let d = 0;
  let maxJump = 0;
  let lo = Infinity,
    hi = -Infinity;
  for (let i = 0; i < 60 * 60; i++) {
    const prev = d;
    d = viewerDrift(d, dt);
    maxJump = Math.max(maxJump, Math.abs(d - prev));
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  assert.ok(maxJump < DRIFT_MAX * 0.2, `프레임 간 튐 — 진동으로 보인다 (${maxJump})`);
  assert.ok(hi - lo > DRIFT_MAX, `방황 폭이 좁다 — 여전히 기계적 (${hi - lo})`);
}
{
  // 안전장치: 흔들림이 최대로 유리하게 쏠려도 위기 10초를 공짜로 넘길 수 없다
  const boring = hypeTier(0.1).rate; // 노잼
  const best = Math.exp((boring + DRIFT_MAX) * 10); // 1명에서 10초간 최대 상승
  assert.ok(best < 2, `운만으로 탈출 가능해진다 (배율 ${best})`);
}

// 판정 창
assert.strictEqual(judge(0), 'perfect');
assert.strictEqual(judge(-60), 'perfect');
assert.strictEqual(judge(100), 'good');
assert.strictEqual(judge(141), 'miss');

// 스킬 배율
assert.strictEqual(skillResult(['perfect', 'perfect', 'perfect', 'perfect']).mult, 3.0);
assert.strictEqual(skillResult(['perfect', 'perfect', 'perfect', 'good']).mult, 2.0);
assert.strictEqual(skillResult(['good', 'good', 'perfect', 'miss']).mult, 1.0);
assert.strictEqual(skillResult(['miss', 'miss', 'miss', 'good']).mult, 0.3);
assert.ok(skillResult(['miss', 'miss', 'miss', 'good']).penalty);

console.log('formulas OK');
