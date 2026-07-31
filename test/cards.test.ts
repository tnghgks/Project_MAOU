import assert from 'node:assert';
import { rollRarity, drawCards, reactionCard, statCard, traitCard } from '../src/data/cards.ts';
import { TRAIT_IDS } from '../src/data/traits.ts';

// 가중 추첨 경계 (common 50 / uncommon 27 / magic 14 / epic 7 / legend 2, 총 100)
assert.strictEqual(rollRarity(() => 0), 'common');
assert.strictEqual(rollRarity(() => 0.6), 'uncommon');
assert.strictEqual(rollRarity(() => 0.85), 'magic');
assert.strictEqual(rollRarity(() => 0.95), 'epic');
assert.strictEqual(rollRarity(() => 0.99), 'legend');
assert.strictEqual(rollRarity(() => 1), 'legend'); // rnd가 1에 붙어도 pool 밖으로 안 나간다

// 3장 뽑기
assert.strictEqual(drawCards(3).length, 3);

// #19: 도네이션 카드 중 같은 카드가 중복 노출되던 버그 — 같은 등급 통이 빌 때까지는 중복이 없어야 한다
{
  const three = drawCards(3, [], () => 0);
  assert.strictEqual(new Set(three.map((c) => c.id)).size, 3, '같은 등급 카드 3장의 id가 모두 달라야 한다');
}

// 이미 보유한 특성은 풀에서 빠진다 — uncommon 특성 6종을 미리 보유하면 warriorBlood만 남는다
{
  const owned = TRAIT_IDS.filter((id) => id !== 'warriorBlood');
  const c = drawCards(1, owned, () => 0.6, ['uncommon'])[0];
  assert.strictEqual(c.trait, 'warriorBlood');
}

// 리액션 보상엔 노멀(common)이 없다. highTier(ALL PERFECT)면 상위 두 등급(epic/legend)만.
for (let i = 0; i < 200; i++) {
  assert.notStrictEqual(reactionCard(false).rarity, 'common');
  assert.ok(['epic', 'legend'].includes(reactionCard(true).rarity));
}

// statCard/traitCard 헬퍼: rarity가 각 카탈로그(cardStats.ts/traits.ts)와 일치
assert.strictEqual(statCard('sharpBlade').rarity, 'common');
assert.strictEqual(traitCard('vamp').rarity, 'epic');

console.log('cards OK');
