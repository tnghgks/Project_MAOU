import assert from 'node:assert';
import { heroAtkMult, vampHeal, thornsDmg, BERSERK_MAX, VAMP_RATIO, THORNS_RATIO, type TraitId } from '../src/data/traits.ts';
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

// 특성 카드: mods는 항상 빈 배열(스탯 카드 경로를 안 탄다) + trait 표식
{
  const c = traitCard('vamp');
  assert.strictEqual(c.trait, 'vamp');
  assert.strictEqual(c.mods.length, 0);
  assert.strictEqual(c.rarity, 'epic');
  assert.ok(c.desc && c.desc.length > 0, '카드에 설명이 있어야 UI가 렌더한다');
}

// 뽑기: 가중치상 common이 제일 무겁고(rnd=0은 항상 common) 특성 최저 등급은 uncommon — common 뽑기엔 특성이 안 섞인다
for (const c of drawCards(200, [], () => 0)) assert.strictEqual(c.trait, undefined);

// 이미 보유한 특성은 같은 등급 풀에서 다시 나오지 않는다 (bucketsFor의 owned 제외)
{
  const owned: TraitId[] = ['vamp']; // epic 특성 풀에서 vamp만 뺀다
  for (const c of drawCards(50, owned, () => 0.95, ['epic'])) assert.notStrictEqual(c.trait, 'vamp');
}

console.log('traits OK');
