import assert from 'node:assert';
import { makeCard, rollRarity, drawCards, reactionCard, RARITY } from '../src/data/cards.ts';
import { UPGRADES } from '../src/data/upgrades.ts';

// 카드 = 강화 정의 × 등급 배율
assert.strictEqual(makeCard('atk', 'common').delta, UPGRADES.atk.delta);
assert.strictEqual(makeCard('atk', 'epic').delta, UPGRADES.atk.delta * RARITY.epic.mult);
assert.strictEqual(makeCard('atkSpd', 'rare').delta, 0.38); // 0.15*2.5 = 0.375 → 소수 2자리
assert.strictEqual(makeCard('hp', 'rare').stat, 'maxHp');

// 가중 추첨: 경계 (common 68 / rare 27 / epic 5)
assert.strictEqual(
  rollRarity(() => 0),
  'common',
);
assert.strictEqual(
  rollRarity(() => 0.7),
  'rare',
);
assert.strictEqual(
  rollRarity(() => 0.99),
  'epic',
);
assert.strictEqual(
  rollRarity(() => 1),
  'epic',
); // rnd가 1에 붙어도 pool 밖으로 안 나간다

// 3장 뽑기
assert.strictEqual(drawCards(3).length, 3);

// 리액션 보상엔 노멀이 없다. 판정이 좋으면(mult>=2) 에픽 확정.
for (let i = 0; i < 500; i++) {
  assert.notStrictEqual(reactionCard(0.3).rarity, 'common');
  assert.notStrictEqual(reactionCard(1).rarity, 'common');
  assert.strictEqual(reactionCard(2).rarity, 'epic');
  assert.strictEqual(reactionCard(3).rarity, 'epic');
}

console.log('cards OK');
