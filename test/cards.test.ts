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

// #19: 도네이션 3장 중 같은 카드가 중복 노출되던 버그 — 같은 rnd 시퀀스라도 통이 남아있는 한 중복이 없어야 한다
{
  const three = drawCards(3, ['thorns', 'berserk'], () => 0);
  assert.strictEqual(three[0].trait, 'thorns');
  assert.strictEqual(three[1].trait, 'berserk', '두 번째 카드는 첫 번째 특성과 겹치면 안 된다');
}
{
  const three = drawCards(3, [], () => 0);
  assert.strictEqual(new Set(three.map((c) => c.key)).size, 3, '강화 카드 3장의 key가 모두 달라야 한다');
}

// 리액션 보상엔 노멀이 없다. highTier(ALL PERFECT/GREAT)면 에픽 확정.
for (let i = 0; i < 500; i++) {
  assert.notStrictEqual(reactionCard(false).rarity, 'common');
  assert.strictEqual(reactionCard(true).rarity, 'epic');
}

console.log('cards OK');
