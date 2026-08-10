import assert from 'node:assert';
import {
  REQUESTS,
  pickRequest,
  startRequest,
  stepRequest,
  reqProgress,
  type ActiveRequest,
  type ReqCtx,
  type ReqPool,
  type RequestDef,
} from '../src/data/requests.ts';
import type { MonsterId } from '../src/data/monsters.ts';

// 요청 판정은 방송 중 시청자 수를 직접 흔드는 분기라 브라우저 없이 돌려볼 수 있어야 한다.
// 전이 로직은 BattleScene.updateRequest와 동일한 stepRequest를 공유한다(재구현 금지).
const ctx = (p: Partial<ReqCtx> & { alive?: Partial<Record<MonsterId, number>> } = {}): ReqCtx => ({
  count: (t) => p.alive?.[t] ?? 0,
  total: p.total ?? 0,
  hpRatio: p.hpRatio ?? 1,
  killsSince: p.killsSince ?? 0,
  combo: p.combo ?? 0,
  noHitT: p.noHitT ?? 0,
  bossDmgRatio: p.bossDmgRatio ?? 0,
});
// 출제 게이트용 방송 상태 — 기본은 "편성 없음 · 보스 없음"
const pool = (p: Partial<ReqPool> = {}): ReqPool => ({
  monsters: p.monsters ?? [],
  boss: p.boss ?? false,
});
const def: RequestDef = { text: '슬라임 {n}', dur: 10, need: 3, now: (c) => c.count('slime') };
const active = (d = def): ActiveRequest => startRequest(d, 1, 0); // 전투력 1.00 = 기준값 그대로

// 조건 미달이면 시간만 흐른다
{
  const r = active();
  assert.strictEqual(stepRequest(r, ctx({ alive: { slime: 2 } }), 1), null);
  assert.strictEqual(r.t, 9);
}

// need 도달 즉시 성공 — 남은 시간은 소모되지 않는다
{
  const r = active();
  assert.strictEqual(stepRequest(r, ctx({ alive: { slime: 3 } }), 1), 'success');
  assert.strictEqual(r.t, 10, '성공 프레임에선 타이머가 안 줄어야 함');
}

// 시간 만료 → 실패. 만료 프레임에 조건을 채우면 성공이 우선
{
  const r = active();
  for (let i = 0; i < 9; i++) assert.strictEqual(stepRequest(r, ctx(), 1), null);
  assert.strictEqual(stepRequest(r, ctx(), 1), 'fail');

  const r2 = active();
  r2.t = 0.01;
  assert.strictEqual(stepRequest(r2, ctx({ alive: { slime: 5 } }), 1), 'success', '달성이 만료보다 우선');
}

// 진행률은 0~1로 물린다 (초과 달성도 100%)
{
  const r = active();
  assert.strictEqual(reqProgress(r, ctx()), 0);
  assert.strictEqual(reqProgress(r, ctx({ alive: { slime: 3 } })), 1);
  assert.strictEqual(reqProgress(r, ctx({ alive: { slime: 9 } })), 1);
}

// HP 요청: 체력이 낮을수록 진행률이 오른다 (need 0.7 = HP 30% 이하)
{
  const hp = REQUESTS.find((r) => r.need === 0.7)!;
  assert.ok(hp.now(ctx({ hpRatio: 1 })) < hp.need);
  assert.ok(hp.now(ctx({ hpRatio: 0.3 })) >= hp.need, 'HP 30%면 달성');
}

// ── 전투력 스케일 (startRequest) ──
{
  // 전투력 1.00 = 기준값 그대로, {n}은 확정된 목표로 치환
  const r1 = startRequest(def, 1, 0);
  assert.strictEqual(r1.need, 3);
  assert.strictEqual(r1.label, '슬라임 3');

  // 2배당 +50% (로그) — 4배는 +100%
  assert.strictEqual(startRequest({ ...def, need: 12 }, 2, 0).need, 18);
  assert.strictEqual(startRequest({ ...def, need: 12 }, 4, 0).need, 24);

  // 로그라 후반 강화에도 목표가 폭주하지 않는다
  assert.ok(startRequest({ ...def, need: 12 }, 64, 0).need <= 48, '전투력 64배에도 4배 이내');

  // max가 있으면 거기서 물린다 — 동시 생존 상한을 넘는 목표는 달성 자체가 불가능하다
  assert.strictEqual(startRequest({ ...def, need: 25, max: 45 }, 1000, 0).need, 45);
  const capped = REQUESTS.filter((r) => r.max);
  assert.ok(capped.length > 0, '동시 생존 요청 중 상한이 걸린 게 있어야 함');
  for (const r of capped) assert.ok(startRequest(r, 1e6, 0).need <= r.max!, `${r.text}가 상한을 넘음`);

  // 전투력이 기준 미만이어도 목표가 1 밑으로 안 내려간다
  assert.strictEqual(startRequest(def, 0.2, 0).need, 3);
  assert.ok(startRequest({ ...def, need: 1 }, 0.01, 0).need >= 1);

  // 비율 목표는 스케일 대상이 아니다 (HP 30%는 용사가 세져도 30%)
  const hp = REQUESTS.find((r) => r.noScale)!;
  assert.strictEqual(startRequest(hp, 8, 0).need, hp.need);
  assert.ok(!startRequest(hp, 8, 0).label.includes('{n}'), '{n} 없는 문구는 그대로');

  // kills0은 출제 시점 스냅샷
  assert.strictEqual(startRequest(def, 1, 42).kills0, 42);
}

// ── 출제 게이트 ──
// 편성 기준(2026-08-09): 슬라임/궁수/사이클롭스만 데려간 방송에선 박쥐·기사 요청이 안 나온다.
// 해금 여부가 아니라 "이번에 데려왔나"가 기준이라 편성이 요청 내용을 좌우한다.
{
  const brought: MonsterId[] = ['slime', 'archer', 'golem'];
  const ok = REQUESTS.filter((r) => (r.needs ?? []).every((m) => brought.includes(m)) && !r.needsBoss);
  assert.ok(ok.length > 0);
  assert.ok(!ok.some((r) => (r.needs ?? []).some((m) => !brought.includes(m))), '안 데려온 몬스터 요청은 제외돼야 함');
  for (let i = 0; i < 200; i++) assert.ok(ok.includes(pickRequest(pool({ monsters: brought }))!));
}

// 편성한 몬스터의 전용 요청은 실제로 뽑힌다 — 안 그러면 역할 몬스터를 데려갈 이유가 준다
{
  const brought: MonsterId[] = ['turtle', 'sniper'];
  const own = REQUESTS.filter((r) => (r.needs ?? []).some((m) => brought.includes(m)));
  assert.ok(own.length > 0, '거북이·저격수 전용 요청이 있어야 함');
  const seen = new Set<RequestDef>();
  for (let i = 0; i < 4000; i++) seen.add(pickRequest(pool({ monsters: brought }))!);
  assert.ok(
    own.every((r) => (r.needs ?? []).every((m) => brought.includes(m)) === seen.has(r)),
    '편성한 몬스터로 달성 가능한 요청만 출제돼야 한다',
  );
}

// 직전 요청은 다시 안 나온다
{
  const noNeed = REQUESTS.filter((r) => !r.needs);
  assert.ok(noNeed.length >= 2, '해금 무관 요청이 2개 이상이라야 exclude가 의미 있다');
  for (let i = 0; i < 200; i++) assert.notStrictEqual(pickRequest(pool(), Math.random, noNeed[0]), noNeed[0]);
}

// 뽑을 게 없으면 null (씬은 출제를 건너뛴다)
assert.strictEqual(pickRequest(pool(), () => 0) !== null, true, '해금 무관 요청은 항상 남는다');

// ── 보스 전용 게이트 ──
{
  // 보스가 없으면 needsBoss는 안 나온다
  for (let i = 0; i < 400; i++) {
    const r = pickRequest(pool({ boss: false }));
    assert.ok(r && !r.needsBoss, '보스 없는데 보스 요청이 출제됨');
  }
  // 보스 등장이면 needsBoss 요청도 후보에 들어온다
  const bossReqs = REQUESTS.filter((r) => r.needsBoss);
  assert.ok(bossReqs.length > 0, '보스 전용 요청이 있어야 함');
  const seen = new Set<RequestDef>();
  for (let i = 0; i < 2000; i++) seen.add(pickRequest(pool({ boss: true }))!);
  assert.ok(
    bossReqs.every((r) => seen.has(r)),
    '보스 등장 상황에선 전용 요청이 실제로 뽑혀야 한다',
  );
}

// 용사 요청 판정: 노 데미지 / 콤보 / 보스 딜은 각자 자기 ctx 필드만 본다
{
  const noHit = REQUESTS.find((r) => r.now(ctx({ noHitT: 99 })) === 99)!;
  assert.strictEqual(noHit.need, 20, '노 데미지 요청 = 20초 도달형');
  assert.strictEqual(reqProgress(startRequest(noHit, 1, 0), ctx({ noHitT: 10 })), 0.5);

  const boss = REQUESTS.find((r) => r.needsBoss)!;
  const active = startRequest(boss, 1, 0, 5000);
  assert.strictEqual(active.bossHp0, 5000, '보스 HP 스냅샷');
  assert.strictEqual(stepRequest(active, ctx({ bossDmgRatio: 0.29 }), 0.1), null);
  assert.strictEqual(stepRequest(active, ctx({ bossDmgRatio: 0.3 }), 0.1), 'success');
}

// 모든 요청이 빈 상황에서도 숫자를 낸다 (now 오타 방지)
// 개수 목표는 문구에 {n}이 있어야 한다 — 없으면 스케일된 목표와 표시가 어긋난다
for (const r of REQUESTS) {
  assert.strictEqual(typeof r.now(ctx()), 'number', `${r.text}의 now가 숫자가 아님`);
  assert.ok(r.need > 0 && r.dur > 0, `${r.text}의 need/dur가 유효하지 않음`);
  assert.strictEqual(r.text.includes('{n}'), !r.noScale, `${r.text}의 {n} 유무가 noScale과 안 맞음`);
}

console.log('requests OK');
