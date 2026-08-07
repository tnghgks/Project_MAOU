import assert from 'node:assert';
import {
  stepHero,
  stepMonster,
  stepBossGolem,
  stepArrow,
  stepViewers,
  bumpCombo,
  countNear,
  COMBO_WINDOW,
  DASH_CD,
  DASH_SPEED,
  GOLEM_PATTERN_CD,
  GOLEM_ROCK_WINDUP,
  GOLEM_CHARGE_HIT_RADIUS,
  GOLEM_CHARGE_MAX_T,
  type MonsterIntent,
} from '../src/game/battleSim.ts';
import { ATTACK_RELEASE_SEC } from '../src/game/anims.ts';
import { spawnHero, type MonsterEntity, type Arrow } from '../src/game/entities.ts';
import { MONSTERS } from '../src/data/monsters.ts';
import { arenaBounds } from '../src/game/layout.ts';
import { hypeTier } from '../src/formulas.ts';

const HOME = { x: 640, y: 300 };
const stats = {
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
};

// spr은 시뮬 로직이 건드리지 않으므로 빈 객체로 스텁.
const mon = (type: keyof typeof MONSTERS, x: number, y: number): MonsterEntity => ({
  type,
  def: MONSTERS[type],
  hp: MONSTERS[type].hp,
  x,
  y,
  atkCd: 0,
  windupT: 0,
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

const still = { dx: 0, dy: 0, dash: false };

// ── stepHero: 근접 0마리 지속이 REGEN_DELAY(1.5s)를 넘어야 REGEN_RATE(0.05) 회복 시작 ──
{
  const hero = spawnHero(stats, HOME);
  hero.hp = 50;
  let intent = stepHero(hero, [], 0, 1, arenaBounds, still); // dt=1, 몬스터 없음 (유예 아직)
  assert.strictEqual(hero.hp, 50, '유예 시간(1.5s) 전엔 회복 없음');
  intent = stepHero(hero, [], 0, 1, arenaBounds, still); // 누적 2s ≥ REGEN_DELAY
  assert.strictEqual(hero.hp, 55, '50 + 100*0.05*1 (유예 지난 뒤 회복)');
  assert.deepStrictEqual(intent.attacks, []);
  assert.strictEqual(intent.facing, null, '입력 없으면 대기');
}

// ── stepHero: 휘두르기는 광역이되 바라보는 쪽 180°만 ──
// 이동 입력으로 동쪽을 보게 한 상태. 그 반대편(내적 < 0)은 사거리 안이어도 안 맞는다.
{
  const hero = spawnHero(stats, HOME);
  const near = mon('golem', HOME.x + 40, HOME.y); // 동쪽, 사거리 안
  const side = mon('slime', HOME.x, HOME.y + 50); // 정확히 90° 옆 (내적 0) — 경계는 포함
  const behind = mon('slime', HOME.x - 40, HOME.y + 30); // 거리 50 ≤ 60 이지만 등 뒤
  const far = mon('slime', HOME.x + 120, HOME.y); // 사거리 밖
  const dead = mon('slime', HOME.x + 10, HOME.y);
  dead.dead = true;
  const intent = stepHero(hero, [near, side, behind, far, dead], 2, 0.1, arenaBounds, { dx: 1, dy: 0, dash: false });
  assert.deepStrictEqual(intent.attacks, [near, side], '앞 180°(경계 포함)만 — 등 뒤는 안 맞는다');
}

// ── stepHero: 입력 방향으로만 이동, 자동 추적 없음 ──
{
  const hero = spawnHero(stats, HOME);
  const m = mon('golem', HOME.x + 200, HOME.y); // 오른쪽 — 자동 추적이 있다면 다가갔을 거리
  const intent = stepHero(hero, [m], 1, 0.1, arenaBounds, { dx: -1, dy: 0, dash: false });
  assert.strictEqual(hero.x, HOME.x - stats.speed * 0.1, '입력 방향(왼쪽)으로 speed*dt');
  assert.deepStrictEqual(intent.attacks, [], '사거리 밖이면 공격 없음');
  assert.strictEqual(intent.facing, 'west');
}

// ── stepHero: 4방향 facing — 수직 이동도 잡히고, 대각선은 수평 우선 ──
{
  const dir = (dx: number, dy: number) =>
    stepHero(spawnHero(stats, HOME), [], 0, 0.1, arenaBounds, { dx, dy, dash: false }).facing;
  assert.strictEqual(dir(0, 1), 'south');
  assert.strictEqual(dir(0, -1), 'north', '수직 이동이 정지로 잡히던 버그');
  assert.strictEqual(dir(-1, 0), 'west');
  assert.strictEqual(dir(1, 0), 'east');
  assert.strictEqual(dir(1, 1), 'east', '동률 대각선은 수평 우선');
  assert.strictEqual(dir(0, 0), null, '입력 없으면 대기');
}

// ── stepHero: 사거리 안 + 바라보는 쪽이면 이동 중에도 자동 공격 ──
{
  const hero = spawnHero(stats, HOME);
  const m = mon('golem', HOME.x + 50, HOME.y); // 거리 50 ≤ range 60
  const intent = stepHero(hero, [m], 1, 0.1, arenaBounds, { dx: 1, dy: 0, dash: false });
  assert.deepStrictEqual(intent.attacks, [m], '이동 중에도 사거리·방향만 맞으면 공격');
  assert.strictEqual(intent.swingAngle, 0, '참격 축 = 바라보는 쪽(동쪽 = 0rad)');
  assert.strictEqual(hero.atkCd, 1 / stats.atkSpd);
}

// ── stepHero: 조준은 무조건 바라보는 쪽 — 등 뒤는 안 맞고 쿨다운도 안 쓴다 ──
{
  const hero = spawnHero(stats, HOME);
  const back = mon('golem', HOME.x - 50, HOME.y); // 사거리 안이지만 등 뒤
  const intent = stepHero(hero, [back], 1, 0.1, arenaBounds, { dx: 1, dy: 0, dash: false });
  assert.deepStrictEqual(intent.attacks, [], '등 뒤는 안 맞는다');
  assert.strictEqual(intent.swingAngle, null, '헛스윙 자체를 안 한다');
  assert.strictEqual(hero.atkCd, 0, '쿨다운이 날아가지 않는다');
}

// ── stepHero: 정지 중에도 마지막 방향으로 공격 ──
// 입력이 0이면 facingOf가 null이라, 방향 상태를 안 들고 있으면 제자리 공격이 통째로 죽는다.
{
  const hero = spawnHero(stats, HOME);
  const left = mon('golem', HOME.x - 50, HOME.y);
  stepHero(hero, [left], 1, 0.1, arenaBounds, { dx: -1, dy: 0, dash: false }); // 서쪽을 본다
  hero.atkCd = 0; // 쿨다운만 되돌리고 방향은 유지
  const intent = stepHero(hero, [left], 1, 0.1, arenaBounds, still);
  assert.deepStrictEqual(intent.attacks, [left], '멈춰도 마지막 방향(서)으로 휘두른다');
  assert.strictEqual(intent.swingAngle, Math.PI, '서쪽 = π');
}

// ── stepHero: 대시 = 속도 배율 + 무적, 쿨 중엔 재발동 없음 ──
{
  const hero = spawnHero(stats, HOME);
  const dash = { dx: 1, dy: 0, dash: true };
  stepHero(hero, [], 0, 0.05, arenaBounds, dash);
  assert.ok(hero.invulnT > 0, '대시 중 무적');
  assert.strictEqual(hero.dashCd, DASH_CD, '감산이 발동보다 먼저라 세팅값 그대로');
  assert.strictEqual(hero.x, HOME.x + stats.speed * DASH_SPEED * 0.05, '대시 속도 배율');

  const cdBefore = hero.dashCd;
  stepHero(hero, [], 0, 0.05, arenaBounds, dash); // 쿨 중 재입력
  assert.strictEqual(hero.dashCd, cdBefore - 0.05, '쿨 중엔 재발동 없이 감산만');
}

// ── stepMonster: 사거리 밖이면 이동 intent + 좌표 접근, 용사 쪽을 바라본다 ──
{
  const hero = spawnHero(stats, HOME);
  const m = mon('golem', HOME.x + 200, HOME.y); // range 30보다 훨씬 밖
  const before = m.x;
  const intent = stepMonster(m, hero, 0.1);
  assert.strictEqual(intent.kind, 'move');
  assert.ok(m.x < before, '용사 쪽으로 접근');
  assert.strictEqual(intent.kind === 'move' && intent.facing, 'west', '용사가 왼쪽이면 서쪽을 본다');
}

// ── stepMonster: 세로로 접근하면 남/북을 본다 (몬스터도 4방향) ──
{
  const hero = spawnHero(stats, HOME);
  const above = stepMonster(mon('golem', HOME.x, HOME.y - 200), hero, 0.1); // 용사가 아래
  const below = stepMonster(mon('golem', HOME.x, HOME.y + 200), hero, 0.1); // 용사가 위
  assert.strictEqual(above.kind === 'move' && above.facing, 'south');
  assert.strictEqual(below.kind === 'move' && below.facing, 'north');
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
  assert.strictEqual(stepMonster(archer, hero, 0.1).kind, 'draw', '원거리는 먼저 시위를 당긴다');
}

// ── stepMonster: 사거리 안이면 공격·대기도 용사를 바라본다 (공격 모션 방향) ──
{
  const hero = spawnHero(stats, HOME);
  // 궁수가 용사 오른쪽 위 → 수평 우선이라 서쪽(용사가 왼쪽)
  const aim = stepMonster(mon('archer', HOME.x + 100, HOME.y - 20), hero, 0.1);
  assert.strictEqual(aim.kind, 'draw');
  assert.strictEqual(aim.facing, 'west', '당길 때 용사 쪽을 본다');

  // 같은 궁수를 쿨다운 중에 다시 물으면 idle이지만 방향은 그대로 용사 쪽이다
  const archer = mon('archer', HOME.x, HOME.y - 100); // 용사가 아래 → 남쪽
  assert.strictEqual(stepMonster(archer, hero, 0.1).kind, 'draw');
  const wait = stepMonster(archer, hero, 0.1);
  assert.strictEqual(wait.kind, 'idle');
  assert.strictEqual(wait.facing, 'south', '당기는 중에도 용사를 본다');
}

// ── stepMonster: 화살은 시위를 놓는 프레임(공격 모션의 릴리즈 시점)에 나간다 ──
{
  const DT = 0.05;
  const hero = spawnHero(stats, HOME);
  const archer = mon('archer', HOME.x + 100, HOME.y); // range 240 안
  assert.strictEqual(stepMonster(archer, hero, DT).kind, 'draw');
  assert.strictEqual(archer.windupT, ATTACK_RELEASE_SEC, '릴리즈까지 남은 시간은 아트가 정한다');

  let elapsed = 0;
  let shot: MonsterIntent | null = null;
  while (elapsed < 1 && !shot) {
    const i = stepMonster(archer, hero, DT);
    elapsed += DT;
    if (i.kind === 'arrow') shot = i;
    else assert.strictEqual(i.kind, 'idle', '당기는 동안엔 화살도 이동도 없다');
  }
  assert.ok(shot, '릴리즈 프레임에 화살이 나간다');
  assert.ok(elapsed >= ATTACK_RELEASE_SEC, '릴리즈 시각 전에는 안 나간다');
  assert.ok(elapsed < ATTACK_RELEASE_SEC + DT, '릴리즈 직후 프레임에 바로 나간다');
  assert.strictEqual(archer.windupT, 0, '쏘고 나면 당기기 상태가 풀린다');
}

// ── stepMonster: 조준점은 놓는 순간의 용사 위치 (당기는 사이 움직이면 따라간다) ──
{
  const hero = spawnHero(stats, HOME);
  const archer = mon('archer', HOME.x + 100, HOME.y);
  stepMonster(archer, hero, 0.05); // draw
  hero.x = HOME.x - 60; // 당기는 동안 용사가 이동
  let shot: MonsterIntent | null = null;
  for (let t = 0; t < 1 && !shot; t += 0.05) {
    const i = stepMonster(archer, hero, 0.05);
    if (i.kind === 'arrow') shot = i;
  }
  assert.strictEqual(shot?.kind === 'arrow' && shot.tx, hero.x, '옛 위치가 아니라 지금 위치를 겨눈다');
}

// ── stepMonster: 폭탄 박쥐는 자폭 melee ──
{
  const hero = spawnHero(stats, HOME);
  const bat = mon('bat', HOME.x + 5, HOME.y); // range 22 안
  const bi = stepMonster(bat, hero, 0.1);
  assert.strictEqual(bi.kind, 'melee');
  if (bi.kind === 'melee') assert.strictEqual(bi.suicide, true);
}

// ── stepBossGolem: cooldown 소진 → 거리에 맞는 패턴을 골라 윈드업 시작 ──
{
  const hero = spawnHero(stats, HOME);
  const far = mon('boss_golem', HOME.x + 400, HOME.y); // GOLEM_STOMP_RANGE 밖 → rock/charge만
  far.bossPhase = 'cooldown';
  far.bossT = 0.05;
  const rnd0 = () => 0; // rnd < 0.5 분기 — far면 'rock'
  const i1 = stepBossGolem(far, hero, 0.1, rnd0);
  assert.strictEqual(i1.kind, 'bossTelegraph');
  if (i1.kind === 'bossTelegraph') {
    assert.strictEqual(i1.pattern, 'rock', '멀면 stomp는 후보에서 빠진다');
    assert.strictEqual(i1.windup, GOLEM_ROCK_WINDUP);
  }
  assert.strictEqual(far.bossPhase, 'windup');

  const near = mon('boss_golem', HOME.x + 50, HOME.y); // GOLEM_STOMP_RANGE 안
  near.bossPhase = 'cooldown';
  near.bossT = 0.05;
  const i2 = stepBossGolem(near, hero, 0.1, rnd0);
  if (i2.kind === 'bossTelegraph') assert.strictEqual(i2.pattern, 'stomp', '가까우면 stomp가 후보에 들어간다');
}

// ── stepBossGolem: 윈드업 종료 → rock은 발사, stomp는 판정, 둘 다 recover로 전환 ──
{
  const hero = spawnHero(stats, HOME);
  const rock = mon('boss_golem', HOME.x + 300, HOME.y);
  rock.bossPhase = 'windup';
  rock.bossPattern = 'rock';
  rock.bossT = 0.01;
  const ri = stepBossGolem(rock, hero, 0.1);
  assert.strictEqual(ri.kind, 'bossRock');
  if (ri.kind === 'bossRock') {
    assert.strictEqual(ri.tx, hero.x, '조준점은 지금 용사 위치');
    assert.strictEqual(ri.ty, hero.y);
  }
  assert.strictEqual(rock.bossPhase, 'recover');

  const stomp = mon('boss_golem', HOME.x + 50, HOME.y);
  stomp.bossPhase = 'windup';
  stomp.bossPattern = 'stomp';
  stomp.bossT = 0.01;
  const si = stepBossGolem(stomp, hero, 0.1);
  assert.strictEqual(si.kind, 'bossStomp');
  assert.strictEqual(stomp.bossPhase, 'recover');
}

// ── stepBossGolem: 돌진 목표는 윈드업 "시작" 시점에 고정되고 텔레그래프에 실려 나간다
// (씬이 이 좌표로 윈드업 내내 조준선을 그려야 회피가 성립한다) ──
{
  const hero = spawnHero(stats, HOME);
  const boss = mon('boss_golem', HOME.x + 200, HOME.y);
  boss.bossPhase = 'cooldown';
  boss.bossT = 0.05;
  const rnd1 = () => 0.9; // rnd >= 0.5 → 'charge' (near/far 둘 다)
  const tele = stepBossGolem(boss, hero, 0.1, rnd1);
  assert.strictEqual(tele.kind, 'bossTelegraph');
  if (tele.kind === 'bossTelegraph') {
    assert.strictEqual(tele.pattern, 'charge');
    assert.strictEqual(tele.chargeTx, hero.x, '텔레그래프에 목표 좌표가 실린다');
    assert.strictEqual(tele.chargeTy, hero.y);
  }
  assert.strictEqual(boss.chargeTx, hero.x, '엔티티에도 즉시 고정된다');

  hero.x = HOME.x + 900; // 윈드업 중 용사가 도망가도 목표는 안 바뀐다
  boss.bossT = 0.01;
  const launch = stepBossGolem(boss, hero, 0.1);
  assert.strictEqual(launch.kind, 'bossChargeMove', '윈드업이 끝나는 프레임에 바로 돌진 시작');
  assert.notStrictEqual(boss.chargeTx, hero.x, '이미 고정된 좌표라 도망친 새 위치로 안 바뀐다');
  assert.strictEqual(boss.bossPhase, 'active');

  let missed: MonsterIntent | null = null;
  for (let t = 0; t < GOLEM_CHARGE_MAX_T + 1 && !missed; t += 0.05) {
    const i = stepBossGolem(boss, hero, 0.05);
    if (i.kind === 'idle' && boss.bossPhase === 'recover') missed = i;
  }
  assert.ok(missed, '고정된 목표에 도달하면 멈춘다(빗나간 돌진)');
}

// ── stepBossGolem: 돌진 중 용사가 고정된 목표 자리에 그대로 있으면 충돌로 끝난다 ──
{
  const hero = spawnHero(stats, HOME);
  const boss = mon('boss_golem', HOME.x + 100, HOME.y);
  boss.bossPhase = 'windup';
  boss.bossPattern = 'charge';
  boss.bossT = 0.01;
  boss.chargeTx = hero.x; // 실제로는 cooldown→windup 전환 시 stepBossGolem이 미리 잡아둔다
  boss.chargeTy = hero.y;
  stepBossGolem(boss, hero, 0.1); // 윈드업 종료 — 돌진 시작
  let hit: MonsterIntent | null = null;
  for (let t = 0; t < 2 && !hit; t += 0.05) {
    const i = stepBossGolem(boss, hero, 0.05);
    if (i.kind === 'bossChargeHit') hit = i;
  }
  assert.ok(hit, '가만히 있으면 돌진에 맞는다');
  assert.strictEqual(Math.hypot(hero.x - boss.x, hero.y - boss.y) <= GOLEM_CHARGE_HIT_RADIUS + 1, true);
}

// ── stepBossGolem: recover → cooldown 전환, cooldown 동안은 접근만 하고 패턴은 안 낸다 ──
{
  const hero = spawnHero(stats, HOME);
  const boss = mon('boss_golem', HOME.x + 300, HOME.y);
  boss.bossPhase = 'recover';
  boss.bossT = 0.05;
  const r = stepBossGolem(boss, hero, 0.1);
  assert.strictEqual(r.kind, 'idle');
  assert.strictEqual(boss.bossPhase, 'cooldown');
  assert.strictEqual(boss.bossT, GOLEM_PATTERN_CD);

  const before = boss.x;
  const c = stepBossGolem(boss, hero, 0.1);
  assert.strictEqual(c.kind, 'move', '쿨다운 중엔 패턴 없이 접근만');
  assert.ok(boss.x !== before);
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
  const step = stepViewers(vs, 1, 1, Infinity, rnd); // hpRatio 1, 콤보 0 → D 0
  assert.strictEqual(step.D, 0);
  assert.deepStrictEqual(step.tier, hypeTier(0));
  assert.ok(vs.viewers < 100, '노잼 구간 감쇠');
  assert.strictEqual(vs.peakViewers, 100, 'peak 유지');
}

// ── 시청자 소프트캡: 상한 근처에선 상승률이 죽어 캡을 못 넘는다 (2026-08-03 피드백: 9만 명 폭주 방지) ──
{
  const vs = { viewers: 4990, peakViewers: 4990, drift: 0, combo: 0, comboT: 0 };
  const rnd = () => 0.5; // drift kick = 0
  for (let i = 0; i < 1000; i++) stepViewers(vs, 0, 1, 5000, rnd); // 빈사 유지 → 최고 흥분도(D=1), 캡 5000
  assert.ok(vs.viewers <= 5000, `캡을 넘으면 안 된다: ${vs.viewers}`);
  assert.ok(vs.viewers > 4990, '캡 아래에서는 계속 성장한다');
}

// ── 콤보: 창 안이면 이어지고, 창이 끊기면 0으로 리셋 ──
{
  const vs = viewerState();
  bumpCombo(vs);
  assert.strictEqual(vs.combo, 1);
  bumpCombo(vs);
  assert.strictEqual(vs.combo, 2, '창 안 연속 타격은 누적');

  stepViewers(vs, 1, COMBO_WINDOW / 2, Infinity, () => 0.5); // 창 절반 경과
  assert.strictEqual(vs.combo, 2, '창이 살아있으면 유지');
  bumpCombo(vs);
  assert.strictEqual(vs.combo, 3);
  assert.strictEqual(vs.comboT, COMBO_WINDOW, '타격할 때마다 창 갱신');

  stepViewers(vs, 1, COMBO_WINDOW, Infinity, () => 0.5); // 창 만료
  assert.strictEqual(vs.combo, 0, '끊기면 리셋');
  bumpCombo(vs);
  assert.strictEqual(vs.combo, 1, '리셋 후엔 1부터');
}

console.log('battleSim OK');
