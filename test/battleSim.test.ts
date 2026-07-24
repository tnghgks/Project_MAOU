import assert from 'node:assert';
import { stepHero, stepMonster, stepArrow, stepViewers, countNear } from '../src/game/battleSim.ts';
import { spawnHero, type MonsterEntity, type Arrow } from '../src/game/entities.ts';
import { MONSTERS } from '../src/data/monsters.ts';
import { arenaBounds } from '../src/game/layout.ts';
import { hypeTier } from '../src/formulas.ts';

const HOME = { x: 640, y: 300 };
const stats = { maxHp: 100, atk: 10, atkSpd: 1, speed: 100, range: 60 };

// spr은 시뮬 로직이 건드리지 않으므로 빈 객체로 스텁.
const mon = (type: keyof typeof MONSTERS, x: number, y: number): MonsterEntity => ({
  type,
  def: MONSTERS[type],
  hp: MONSTERS[type].hp,
  x,
  y,
  atkCd: 0,
  spr: {} as MonsterEntity['spr'],
});

// ── countNear: 200 이내 생존 몬스터만 ──
{
  const hero = spawnHero(stats, HOME);
  const near = mon('slime', HOME.x + 100, HOME.y); // 거리 100 < 200
  const far = mon('slime', HOME.x + 300, HOME.y); // 거리 300 > 200
  const dead = mon('slime', HOME.x + 10, HOME.y); // 가깝지만 사망
  dead.dead = true;
  assert.strictEqual(countNear([near, far, dead], hero), 1);
}

// ── stepHero: 근접 0마리면 초당 REGEN_RATE(0.1) 회복 ──
{
  const hero = spawnHero(stats, HOME);
  hero.hp = 50;
  const intent = stepHero(hero, [], 0, 1, HOME, arenaBounds); // dt=1, 몬스터 없음
  assert.strictEqual(hero.hp, 60, '50 + 100*0.1*1');
  assert.strictEqual(intent.attack, null);
  assert.strictEqual(intent.moved, false, '스폰에 있으면 이동 없음');
}

// ── stepHero: HP 25% 이하 + 몬스터 있으면 후퇴 발동, 반대 방향 이동 ──
{
  const hero = spawnHero(stats, HOME);
  hero.hp = 20; // 20% ≤ 25%
  const m = mon('golem', HOME.x + 100, HOME.y); // 오른쪽
  const intent = stepHero(hero, [m], 1, 0.1, HOME, arenaBounds);
  assert.ok(hero.retreatT > 0, '후퇴 타이머 발동');
  assert.strictEqual(hero.retreatCd > 0, true, '후퇴 쿨다운 세팅');
  assert.ok(hero.x < HOME.x, '몬스터 반대(왼쪽)로 도주');
  assert.strictEqual(intent.movingLeft, true);
}

// ── stepHero: 사거리 안 대상 → 공격 intent + 쿨다운 세팅 ──
{
  const hero = spawnHero(stats, HOME);
  const m = mon('golem', HOME.x + 50, HOME.y); // 거리 50 ≤ range 60
  const intent = stepHero(hero, [m], 1, 0.1, HOME, arenaBounds);
  assert.strictEqual(intent.attack, m, '사거리 안이면 공격 대상 반환');
  assert.strictEqual(hero.atkCd, 1 / stats.atkSpd, '공격 쿨다운 = 1/atkSpd');
}

// ── stepMonster: 사거리 밖이면 이동 intent + 좌표 접근 ──
{
  const hero = spawnHero(stats, HOME);
  const m = mon('golem', HOME.x + 200, HOME.y); // range 30보다 훨씬 밖
  const before = m.x;
  const intent = stepMonster(m, hero, 0.1);
  assert.strictEqual(intent.kind, 'move');
  assert.ok(m.x < before, '용사 쪽으로 접근');
}

// ── stepMonster: 근접 몬스터는 melee, 원거리는 arrow ──
{
  const hero = spawnHero(stats, HOME);
  const golem = mon('golem', HOME.x + 10, HOME.y); // range 30 안
  const gi = stepMonster(golem, hero, 0.1);
  assert.strictEqual(gi.kind, 'melee');
  if (gi.kind === 'melee') {
    assert.strictEqual(gi.dmg, MONSTERS.golem.dmg);
    assert.strictEqual(gi.suicide, false);
  }

  const archer = mon('archer', HOME.x + 100, HOME.y); // range 240 안
  const ai = stepMonster(archer, hero, 0.1);
  assert.strictEqual(ai.kind, 'arrow');
  if (ai.kind === 'arrow') {
    assert.strictEqual(ai.tx, hero.x);
    assert.strictEqual(ai.ty, hero.y);
  }
}

// ── stepMonster: 폭탄 박쥐는 자폭 melee ──
{
  const hero = spawnHero(stats, HOME);
  const bat = mon('bat', HOME.x + 5, HOME.y); // range 22 안
  const bi = stepMonster(bat, hero, 0.1);
  assert.strictEqual(bi.kind, 'melee');
  if (bi.kind === 'melee') assert.strictEqual(bi.suicide, true);
}

// ── stepArrow: 이동 → 명중 → 빗나감 ──
{
  const hero = spawnHero(stats, HOME);
  const far: Arrow = { x: 0, y: HOME.y, tx: HOME.x, ty: HOME.y, spr: {} as Arrow['spr'], dmg: 5 };
  assert.strictEqual(stepArrow(far, hero, 0.1), 'travel');
  assert.ok(far.x > 0, '목표점으로 전진');

  // 목표점이 용사 위 → 명중
  const onTarget: Arrow = { x: HOME.x, y: HOME.y, tx: HOME.x, ty: HOME.y, spr: {} as Arrow['spr'], dmg: 7 };
  const hit = stepArrow(onTarget, hero, 0.1);
  assert.deepStrictEqual(hit, { hit: 7 });

  // 목표점이 용사에서 멀면(용사가 피함) 소멸
  const miss: Arrow = { x: 0, y: 0, tx: 0, ty: 0, spr: {} as Arrow['spr'], dmg: 7 };
  assert.strictEqual(stepArrow(miss, hero, 0.1), 'expire');
}

// ── stepViewers: 노잼 구간이면 시청자 감소, D/tier 반환 ──
{
  const vs = { viewers: 100, peakViewers: 100, drift: 0 };
  const rnd = () => 0.5; // drift kick = 0
  const step = stepViewers(vs, 1, 0, 1, rnd); // hpRatio 1, near 0 → D 0
  assert.strictEqual(step.D, 0);
  assert.deepStrictEqual(step.tier, hypeTier(0));
  assert.ok(vs.viewers < 100, '노잼 구간 감쇠');
  assert.strictEqual(vs.peakViewers, 100, 'peak 유지');
}

console.log('battleSim OK');
