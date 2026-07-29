import assert from 'node:assert';
import {
  TRAIT_IDS,
  heroAtkMult,
  vampHeal,
  thornsDmg,
  missingTraits,
  BERSERK_MAX,
  VAMP_RATIO,
  THORNS_RATIO,
  type TraitId,
} from '../src/data/traits.ts';
import { traitCard, drawCards } from '../src/data/cards.ts';

const none: TraitId[] = [];

// 특성이 없으면 전투 규칙이 하나도 안 바뀐다 (기존 밸런스 = 특성 0개 상태)
assert.strictEqual(heroAtkMult(none, 0), 1);
assert.strictEqual(vampHeal(none, 100), 0);
assert.strictEqual(thornsDmg(none, 100), 0);

// 광전사: HP 100%면 1배, 0%면 1+BERSERK_MAX, 중간은 선형
assert.strictEqual(heroAtkMult(['berserk'], 1), 1);
assert.strictEqual(heroAtkMult(['berserk'], 0), 1 + BERSERK_MAX);
assert.ok(Math.abs(heroAtkMult(['berserk'], 0.5) - (1 + BERSERK_MAX / 2)) < 1e-9);
// 범위 밖 hpRatio(오버힐·음수 HP)에서도 배율이 튀지 않는다
assert.strictEqual(heroAtkMult(['berserk'], 1.5), 1);
assert.strictEqual(heroAtkMult(['berserk'], -3), 1 + BERSERK_MAX);

// 흡혈 / 반격은 입력 피해에 비례
assert.strictEqual(vampHeal(['vamp'], 50), 50 * VAMP_RATIO);
assert.strictEqual(thornsDmg(['thorns'], 50), 50 * THORNS_RATIO);
// 다른 특성만 있으면 안 걸린다
assert.strictEqual(vampHeal(['thorns', 'berserk'], 50), 0);

// 미보유 목록 — 카드 풀이 여기서만 나온다(중복 획득 방지)
assert.deepStrictEqual(missingTraits(none), TRAIT_IDS);
assert.deepStrictEqual(missingTraits(TRAIT_IDS), []);
assert.deepStrictEqual(missingTraits(['vamp']), ['thorns', 'berserk']);

// 특성 카드: 스탯 카드 경로를 안 타도록 delta 0 + trait 표식
{
  const c = traitCard('vamp');
  assert.strictEqual(c.trait, 'vamp');
  assert.strictEqual(c.delta, 0);
  assert.strictEqual(c.rarity, 'epic');
  assert.ok(c.desc && c.desc.length > 0, '카드에 설명이 있어야 UI가 렌더한다');
}

// 뽑기: 미보유 목록이 비면 특성 카드가 절대 안 섞인다
for (const c of drawCards(200, [], () => 0)) assert.strictEqual(c.trait, undefined);
// rnd가 0이면 항상 TRAIT_CHANCE 미만 → 전부 특성 카드 (풀에 있을 때)
for (const c of drawCards(50, ['thorns'], () => 0)) assert.strictEqual(c.trait, 'thorns');
// rnd가 1에 붙으면 특성은 안 나온다
for (const c of drawCards(50, TRAIT_IDS, () => 0.999)) assert.strictEqual(c.trait, undefined);

console.log('traits OK');
