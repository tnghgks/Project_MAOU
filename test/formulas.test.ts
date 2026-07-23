import assert from 'node:assert';
import { danger, hypeTier, donationInterval, donationAmount, judge, skillResult } from '../src/formulas.ts';

// 위험도: 풀피+몹0 = 0, 빈사+몹10 = 1
assert.strictEqual(danger(1, 0), 0);
assert.strictEqual(danger(0, 10), 1);
assert.ok(Math.abs(danger(0.5, 5) - 0.5) < 1e-9);

// 구간 경계
assert.strictEqual(hypeTier(0.1).rate, -0.03);
assert.strictEqual(hypeTier(0.5).rate, 0.05);
assert.strictEqual(hypeTier(0.9).rate, 0.09);

// 도네 간격: GDD 표 값 검증
assert.ok(Math.abs(donationInterval(12) - 7.27) < 0.01);
assert.strictEqual(donationInterval(20000), 1.2); // 하한
assert.strictEqual(donationInterval(0), 8); // 상한

// 도네 금액: 12명 × rnd=1.0 중간값 ≈ 49G (0.8+0.6*0.5=1.1 → 10*12^0.6*1.1)
const amt = donationAmount(12, () => 0.5);
assert.ok(amt > 30 && amt < 60, `amt=${amt}`);

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
