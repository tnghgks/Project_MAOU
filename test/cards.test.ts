import assert from 'node:assert';
import { rollRarity, drawCards, reactionCard, statCard, traitCard, NEGATIVE_CARD_CHANCE } from '../src/data/cards.ts';
import { TRAIT_IDS } from '../src/data/traits.ts';

// 가중 추첨 경계 (2026-08-03: common 850 / uncommon 100 / magic 40 / epic 8 / legend 2, 총 1000)
assert.strictEqual(rollRarity(() => 0), 'common');
assert.strictEqual(rollRarity(() => 0.9), 'uncommon');
assert.strictEqual(rollRarity(() => 0.96), 'magic');
assert.strictEqual(rollRarity(() => 0.995), 'epic');
assert.strictEqual(rollRarity(() => 0.999), 'legend');
assert.strictEqual(rollRarity(() => 1), 'legend'); // rnd가 1에 붙어도 pool 밖으로 안 나간다

// 3장 뽑기
assert.strictEqual(drawCards(3).length, 3);

// #19: 도네이션 카드 중 같은 카드가 중복 노출되던 버그 — 같은 등급 통이 빌 때까지는 중복이 없어야 한다
{
  const three = drawCards(3, [], () => 0);
  assert.strictEqual(new Set(three.map((c) => c.id)).size, 3, '같은 등급 카드 3장의 id가 모두 달라야 한다');
}

// 이미 보유한 특성은 풀에서 빠진다 — uncommon 특성 6종을 미리 보유하면 특성 중엔 warriorBlood만 남는다.
// 풀엔 스탯/저주 카드도 섞여 있어(카드 풀 확장) 정확한 인덱스를 가정하지 않고, 촘촘한 rnd 샘플로
// (1) 특성이 뽑히면 반드시 warriorBlood인지, (2) warriorBlood가 실제로 뽑히긴 하는지를 함께 검증한다.
{
  const owned = TRAIT_IDS.filter((id) => id !== 'warriorBlood');
  let sawWarriorBlood = false;
  for (let i = 0; i < 50; i++) {
    const c = drawCards(1, owned, () => i / 50, ['uncommon'])[0];
    if (c.trait) assert.strictEqual(c.trait, 'warriorBlood');
    if (c.trait === 'warriorBlood') sawWarriorBlood = true;
  }
  assert.ok(sawWarriorBlood, 'warriorBlood가 풀에서 실제로 뽑혀야 한다');
}

// 리액션 보상엔 노멀(common)이 없다. highTier(ALL PERFECT)면 상위 두 등급(epic/legend)만.
for (let i = 0; i < 200; i++) {
  assert.notStrictEqual(reactionCard(false).rarity, 'common');
  assert.ok(['epic', 'legend'].includes(reactionCard(true).rarity));
}

// 나쁜 카드(저주 스탯 + 기습 소환)는 NEGATIVE_CARD_CHANCE(9%) 아래로 고정된다.
// 등급 가중치만 쓰던 시절엔 common 통 구성 때문에 40% 가까이 나왔다.
{
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const N = 20000;
  let bad = 0;
  for (let i = 0; i < N; i++) {
    const c = drawCards(1, [], rnd)[0];
    if (c.curse || c.summonCurse) bad++;
  }
  assert.ok(bad / N <= 0.1, `나쁜 카드 비율이 10%를 넘었다: ${((bad / N) * 100).toFixed(1)}%`);
  assert.ok(bad > 0, '나쁜 카드가 아예 안 나오면 그것도 버그다');
  assert.ok(NEGATIVE_CARD_CHANCE < 0.1);
}

// statCard/traitCard 헬퍼: rarity가 각 카탈로그(cardStats.ts/traits.ts)와 일치
assert.strictEqual(statCard('sharpBlade').rarity, 'common');
assert.strictEqual(traitCard('vamp').rarity, 'epic');

console.log('cards OK');
