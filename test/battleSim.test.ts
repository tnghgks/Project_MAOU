import assert from 'node:assert';
import {
  stepHero,
  stepMonster,
  stepArrow,
  stepViewers,
  bumpCombo,
  countNear,
  COMBO_WINDOW,
  DASH_CD,
  DASH_SPEED,
} from '../src/game/battleSim.ts';
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
  assert.deepStrictEqual(intent.attacks, []);
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
  assert.deepStrictEqual(intent.attacks, [m], '사거리 안이면 공격 대상 반환');
  assert.strictEqual(hero.atkCd, 1 / stats.atkSpd, '공격 쿨다운 = 1/atkSpd');
}

// ── stepHero: 휘두르기는 광역 — 사거리 안 전원이 맞고 밖/사망은 제외 ──
{
  const hero = spawnHero(stats, HOME);
  const a = mon('golem', HOME.x + 50, HOME.y); // 거리 50 ≤ range 60
  const b = mon('slime', HOME.x - 40, HOME.y + 30); // 거리 50 ≤ 60 (반대편도 포함)
  const far = mon('slime', HOME.x + 120, HOME.y); // 사거리 밖
  const dead = mon('slime', HOME.x + 10, HOME.y);
  dead.dead = true;
  const intent = stepHero(hero, [a, b, far, dead], 2, 0.1, HOME, arenaBounds);
  assert.deepStrictEqual(intent.attacks, [a, b], '사거리 안 생존 몬스터 전원');
}

// ── stepHero(용사 모드): 입력 방향으로만 이동, 자동 추적 없음 ──
{
  const hero = spawnHero(stats, HOME);
  const m = mon('golem', HOME.x + 200, HOME.y); // 오른쪽 SEEK_RANGE(300) 안 — 자동이면 다가갔을 거리
  const intent = stepHero(hero, [m], 1, 0.1, HOME, arenaBounds, { dx: -1, dy: 0, dash: false });
  assert.strictEqual(hero.x, HOME.x - stats.speed * 0.1, '입력 방향(왼쪽)으로 speed*dt');
  assert.deepStrictEqual(intent.attacks, [], '사거리 밖이면 공격 없음');
  assert.strictEqual(intent.movingLeft, true);
}

// ── stepHero(용사 모드): HP 25% 이하여도 자동 후퇴가 조작권을 뺏지 않는다 ──
{
  const hero = spawnHero(stats, HOME);
  hero.hp = 20; // 자동 AI라면 후퇴가 발동하는 구간
  const m = mon('golem', HOME.x + 100, HOME.y);
  stepHero(hero, [m], 1, 0.1, HOME, arenaBounds, { dx: 1, dy: 0, dash: false });
  assert.strictEqual(hero.retreatT, 0, '수동 조작 중엔 후퇴 미발동');
  assert.ok(hero.x > HOME.x, '입력대로 몬스터 쪽(오른쪽)으로 전진');
}

// ── stepHero(용사 모드): 사거리 안이면 이동 중에도 자동 공격 ──
{
  const hero = spawnHero(stats, HOME);
  const m = mon('golem', HOME.x + 50, HOME.y); // 거리 50 ≤ range 60
  const intent = stepHero(hero, [m], 1, 0.1, HOME, arenaBounds, { dx: 0, dy: 1, dash: false });
  assert.deepStrictEqual(intent.attacks, [m], '이동은 수동이어도 공격은 자동');
  assert.strictEqual(hero.atkCd, 1 / stats.atkSpd);
}

// ── stepHero(용사 모드): 대시 = 속도 배율 + 무적, 쿨 중엔 재발동 없음 ──
{
  const hero = spawnHero(stats, HOME);
  const dash = { dx: 1, dy: 0, dash: true };
  stepHero(hero, [], 0, 0.05, HOME, arenaBounds, dash);
  assert.ok(hero.invulnT > 0, '대시 중 무적');
  assert.strictEqual(hero.dashCd, DASH_CD, '감산이 발동보다 먼저라 세팅값 그대로');
  assert.strictEqual(hero.x, HOME.x + stats.speed * DASH_SPEED * 0.05, '대시 속도 배율');

  const cdBefore = hero.dashCd;
  stepHero(hero, [], 0, 0.05, HOME, arenaBounds, dash); // 쿨 중 재입력
  assert.strictEqual(hero.dashCd, cdBefore - 0.05, '쿨 중엔 재발동 없이 감산만');
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
const viewerState = () => ({ viewers: 100, peakViewers: 100, drift: 0, combo: 0, comboT: 0 });
{
  const vs = viewerState();
  const rnd = () => 0.5; // drift kick = 0
  const step = stepViewers(vs, 1, 0, 1, rnd); // hpRatio 1, near 0, 콤보 0 → D 0
  assert.strictEqual(step.D, 0);
  assert.deepStrictEqual(step.tier, hypeTier(0));
  assert.ok(vs.viewers < 100, '노잼 구간 감쇠');
  assert.strictEqual(vs.peakViewers, 100, 'peak 유지');
}

// ── 콤보: 창 안이면 이어지고, 창이 끊기면 0으로 리셋 ──
{
  const vs = viewerState();
  bumpCombo(vs);
  assert.strictEqual(vs.combo, 1);
  bumpCombo(vs);
  assert.strictEqual(vs.combo, 2, '창 안 연속 처치는 누적');

  stepViewers(vs, 1, 0, COMBO_WINDOW / 2, () => 0.5); // 창 절반 경과
  assert.strictEqual(vs.combo, 2, '창이 살아있으면 유지');
  bumpCombo(vs);
  assert.strictEqual(vs.combo, 3);
  assert.strictEqual(vs.comboT, COMBO_WINDOW, '처치할 때마다 창 갱신');

  stepViewers(vs, 1, 0, COMBO_WINDOW, () => 0.5); // 창 만료
  assert.strictEqual(vs.combo, 0, '끊기면 리셋');
  bumpCombo(vs);
  assert.strictEqual(vs.combo, 1, '리셋 후엔 1부터');
}

// ── 콤보는 하이프에 실제로 얹힌다 (같은 상황에서 콤보만 다르면 시청자 증감이 갈린다) ──
{
  const flat = viewerState();
  const combo = viewerState();
  combo.combo = 8;
  combo.comboT = COMBO_WINDOW;
  const a = stepViewers(flat, 1, 0, 0.1, () => 0.5);
  const b = stepViewers(combo, 1, 0, 0.1, () => 0.5);
  assert.ok(b.D > a.D, '콤보가 위험도(=하이프)를 밀어올린다');
  assert.ok(combo.viewers > flat.viewers, '노잼 감쇠에서 벗어난다');
}

console.log('battleSim OK');
