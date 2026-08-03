import assert from 'node:assert';
import {
  danger,
  BRINK_BONUS,
  BRINK_HP,
  hypeTier,
  donationInterval,
  rollDonation,
  clampDonation,
  DONATION_MIN_RATIO,
  DONATION_MAX_RATIO,
  judge,
  skillResult,
  viewerDrift,
  DRIFT_MAX,
  JACKPOT_MULT,
} from '../src/formulas.ts';

// 위험도 기본 두 항: 풀피+몹0 = 0, 중간값 = 0.5
assert.strictEqual(danger(1, 0), 0);
assert.ok(Math.abs(danger(0.5, 5) - 0.5) < 1e-9);
// 빈사+몹10 = 기본 1 + 벼랑끝 보너스 (HP가 BRINK_HP 이하라 항상 붙는다)
assert.ok(Math.abs(danger(0, 10) - (1 + BRINK_BONUS)) < 1e-9);

// 벼랑끝: 경계 바로 위/아래에서 보너스가 켜진다
assert.ok(Math.abs(danger(BRINK_HP, 0) - danger(BRINK_HP + 0.01, 0)) > BRINK_BONUS * 0.9);
assert.ok(danger(BRINK_HP, 0) > danger(BRINK_HP + 0.01, 0), 'HP 30% 이하를 유지하면 더 재밌어야 한다');

// 구간 경계 (2026-07-30: 하락은 완만하게, 상승은 뚜렷하게)
assert.strictEqual(hypeTier(0.1).rate, -0.003);
assert.strictEqual(hypeTier(0.5).rate, 0.05);
assert.strictEqual(hypeTier(0.9).rate, 0.08);

// 도네 간격: 40 - 6*log10(v), [15,30] 클램프 (2026-08-03 하향)
assert.strictEqual(donationInterval(10), 30); // 10명 = 상한
assert.strictEqual(donationInterval(1e6), 15); // 하한
assert.strictEqual(donationInterval(1e9), 15); // 하한
assert.strictEqual(donationInterval(0), 30); // log10(0)=-Inf 방어
// 시청자가 늘수록 짧아진다 (단조 감소)
assert.ok(donationInterval(100) > donationInterval(1000) && donationInterval(1000) > donationInterval(5000));

// 도네 금액: 12명 × rnd=0.5 → 10*12^0.6*1.1 ≈ 49G (대박 미발동)
const roll = rollDonation(12, () => 0.5);
assert.strictEqual(roll.jackpot, false);
assert.ok(roll.amount > 30 && roll.amount < 60, `amount=${roll.amount}`);
// 대박: 두 번째 rnd가 임계 아래면 5배 + jackpot 플래그 (반올림은 곱한 뒤라 ±1 오차 허용)
{
  const seq = [0.5, 0.01];
  let i = 0;
  const big = rollDonation(12, () => seq[i++]);
  assert.ok(big.jackpot);
  assert.ok(Math.abs(big.amount - roll.amount * JACKPOT_MULT) <= 1, `big=${big.amount}`);
}

// 도네 상하한: 현재 업그레이드 가격 범위(cheapest~priciest)의 [20%, 150%]로 클램프
{
  const cheap = 180,
    pricey = 300; // 예: 초기 상태 speed(180)~atkSpd(300)
  assert.strictEqual(clampDonation(1, cheap, pricey), Math.round(cheap * DONATION_MIN_RATIO), '너무 적으면 하한');
  assert.strictEqual(
    clampDonation(999999, cheap, pricey),
    Math.round(pricey * DONATION_MAX_RATIO),
    '너무 많으면 상한',
  );
  const mid = Math.round((cheap + pricey) / 2);
  assert.strictEqual(clampDonation(mid, cheap, pricey), mid, '범위 안이면 그대로');
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

// 리듬 보상 (GDD 3-4, 2026-07-28 개편): 시청자 배율 + 스킬 등급 획득
assert.strictEqual(skillResult(['perfect', 'perfect', 'perfect', 'perfect']).viewerMult, 1.05);
assert.strictEqual(skillResult(['perfect', 'perfect', 'perfect', 'perfect']).rarity, 'epic');
assert.ok(skillResult(['perfect', 'perfect', 'perfect', 'perfect']).bonusDonation);
assert.strictEqual(skillResult(['perfect', 'perfect', 'perfect', 'good']).viewerMult, 1.03);
assert.strictEqual(skillResult(['perfect', 'perfect', 'perfect', 'good']).rarity, 'uncommon');
assert.strictEqual(skillResult(['good', 'good', 'perfect', 'miss']).viewerMult, 1.01);
assert.strictEqual(skillResult(['good', 'good', 'perfect', 'miss']).rarity, 'common');
assert.strictEqual(skillResult(['miss', 'miss', 'miss', 'good']).viewerMult, 0.95);
assert.ok(skillResult(['miss', 'miss', 'miss', 'good']).penalty);

console.log('formulas OK');
