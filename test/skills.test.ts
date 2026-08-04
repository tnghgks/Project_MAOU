import assert from 'node:assert';
import { SKILLS } from '../src/data/skills.ts';
import { spawnHero, type HeroEntity, type MonsterEntity, type SkillContext } from '../src/game/entities.ts';
import { MONSTERS } from '../src/data/monsters.ts';
import { arenaBounds } from '../src/game/layout.ts';

// 스킬 effect는 이제 SkillContext 표면만 쓴다 → 라이브 Phaser 씬 없이 가짜 ctx로 검증 가능.
type Calls = {
  hit: Array<{ m: MonsterEntity; dmg: number }>;
  fxCircle: Array<{ x: number; y: number; r: number; kind?: 'lightning' | 'fire' }>;
  heal: number[];
  freeze: number[];
  rand: Array<{ a: number; b: number }>;
};

// spr은 스킬 로직이 건드리지 않으므로 빈 객체로 스텁.
const mon = (x: number, y: number, hp = 50): MonsterEntity => ({
  type: 'slime',
  def: MONSTERS.slime,
  hp,
  x,
  y,
  atkCd: 0,
  windupT: 0,
  spr: {} as MonsterEntity['spr'],
});

function makeCtx(hero: HeroEntity, monsters: MonsterEntity[], randValue = 100) {
  const calls: Calls = { hit: [], fxCircle: [], heal: [], freeze: [], rand: [] };
  const ctx: SkillContext = {
    hero,
    monsters,
    hit: (m, dmg) => calls.hit.push({ m, dmg }),
    fxCircle: (x, y, r, kind) => calls.fxCircle.push({ x, y, r, kind }),
    heal: (ratio) => {
      calls.heal.push(ratio);
      hero.hp = Math.min(hero.maxHp, hero.hp + hero.maxHp * ratio); // 씬 impl과 동일한 clamp 계약
    },
    freeze: (ms) => calls.freeze.push(ms),
    now: () => 0,
    randBetween: (a, b) => {
      calls.rand.push({ a, b });
      return randValue;
    },
  };
  return { ctx, calls };
}

// 화염폭발: hero 반경 180 이내만 40*mult로 타격
{
  const hero = spawnHero({
    maxHp: 100,
    atk: 10,
    atkSpd: 1,
    speed: 100,
    range: 60,
    defense: 0,
    dodge: 0,
    critChance: 0,
    critMult: 0,
    lifesteal: 0,
    knockback: 0,
    regenFlat: 0,
    goldBonus: 0,
  }, { x: 0, y: 0 });
  const inRange = mon(100, 0); // 거리 100 ≤ 180
  const outRange = mon(300, 0); // 거리 300 > 180
  const { ctx, calls } = makeCtx(hero, [inRange, outRange]);
  SKILLS.화염폭발.effect(ctx, 2);
  assert.strictEqual(calls.hit.length, 1, '반경 내 1마리만 타격');
  assert.strictEqual(calls.hit[0].m, inRange);
  assert.strictEqual(calls.hit[0].dmg, 80, '40 * mult(2)');
  assert.deepStrictEqual(
    calls.fxCircle,
    [{ x: hero.x, y: hero.y, r: 180, kind: 'fire' }],
    '용사 위치에 반경 180 화염 연출 1회',
  );
}

// 낙뢰: 5개 지점 강타. 몬스터가 있으면 그 근처(±40 지터)를 노려 실제로 맞는다 — 예전엔 아레나 전역
// 무작위라 대부분 빈 공간에 꽂혔다. randValue=0 고정 → 앵커 인덱스도 지터도 항상 0(=몬스터 위치 그대로).
{
  const hero = spawnHero({
    maxHp: 100,
    atk: 10,
    atkSpd: 1,
    speed: 100,
    range: 60,
    defense: 0,
    dodge: 0,
    critChance: 0,
    critMult: 0,
    lifesteal: 0,
    knockback: 0,
    regenFlat: 0,
    goldBonus: 0,
  }, { x: 0, y: 0 });
  const target = mon(100, 100);
  const { ctx, calls } = makeCtx(hero, [target], 0);
  SKILLS.낙뢰.effect(ctx, 1);
  assert.strictEqual(calls.fxCircle.length, 5, '5개 지점 연출');
  assert.ok(
    calls.fxCircle.every((c) => c.r === 60),
    '연출 반경이 실제 피해 반경(60)과 일치해야 한다',
  );
  assert.strictEqual(calls.hit.length, 5, '몬스터 근처를 노려 5회 전부 명중');
  assert.strictEqual(calls.hit[0].dmg, 35, '35 * mult(1)');
}
// 낙뢰: 몬스터가 없으면(전멸 직후 등) 앵커를 못 고르니 예전처럼 아레나 전역 무작위로 떨어진다.
{
  const hero = spawnHero({
    maxHp: 100,
    atk: 10,
    atkSpd: 1,
    speed: 100,
    range: 60,
    defense: 0,
    dodge: 0,
    critChance: 0,
    critMult: 0,
    lifesteal: 0,
    knockback: 0,
    regenFlat: 0,
    goldBonus: 0,
  }, { x: 0, y: 0 });
  const { ctx, calls } = makeCtx(hero, [], 100);
  SKILLS.낙뢰.effect(ctx, 1);
  assert.strictEqual(calls.fxCircle.length, 5, '5개 지점 연출');
  assert.strictEqual(calls.hit.length, 0, '맞을 대상이 없다');
  assert.deepStrictEqual(calls.rand[0], { a: arenaBounds.minX, b: arenaBounds.maxX });
  assert.deepStrictEqual(calls.rand[1], { a: arenaBounds.minY, b: arenaBounds.maxY });
}

// 회복의성가: heal(0.3) — maxHp의 30% 회복, 상한 clamp
{
  const hero = spawnHero({
    maxHp: 100,
    atk: 10,
    atkSpd: 1,
    speed: 100,
    range: 60,
    defense: 0,
    dodge: 0,
    critChance: 0,
    critMult: 0,
    lifesteal: 0,
    knockback: 0,
    regenFlat: 0,
    goldBonus: 0,
  }, { x: 0, y: 0 });
  hero.hp = 10;
  const { ctx, calls } = makeCtx(hero, []);
  SKILLS.회복의성가.effect(ctx); // mult 무시하는 스킬
  assert.deepStrictEqual(calls.heal, [0.3]);
  assert.strictEqual(hero.hp, 40, '10 + 100*0.3');

  hero.hp = 90;
  SKILLS.회복의성가.effect(ctx);
  assert.strictEqual(hero.hp, 100, 'maxHp에서 clamp');
}

// 시간정지: freeze(3000)
{
  const hero = spawnHero({
    maxHp: 100,
    atk: 10,
    atkSpd: 1,
    speed: 100,
    range: 60,
    defense: 0,
    dodge: 0,
    critChance: 0,
    critMult: 0,
    lifesteal: 0,
    knockback: 0,
    regenFlat: 0,
    goldBonus: 0,
  }, { x: 0, y: 0 });
  const { ctx, calls } = makeCtx(hero, []);
  SKILLS.시간정지.effect(ctx); // mult 무시하는 스킬
  assert.deepStrictEqual(calls.freeze, [3000]);
}

console.log('skills OK');
