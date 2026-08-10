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

// 요청 판정은 방송 중 시청자 수를 직접 흔드는 분기라 브라우저 없이 돌려볼 수 있어야 한다.
// 전이 로직은 BattleScene.updateRequest와 동일한 stepRequest를 공유한다(재구현 금지).
// 2026-08-10: 소환 관련 요청 제거로 count()는 더 이상 사용되지 않지만, ctx 시그니처 유지
const ctx = (p: Partial<ReqCtx> = {}): ReqCtx => ({
  count: () => 0,
  total: p.total ?? 0,
  hpRatio: p.hpRatio ?? 1,
  killsSince: p.killsSince ?? 0,
  combo: p.combo ?? 0,
  noHitT: p.noHitT ?? 0,
  bossDmgRatio: p.bossDmgRatio ?? 0,
});
// 출제 게이트용 방송 상태 — 2026-08-10: 소환·보스 관련 요청 제거로 빈 객체
const pool = (p: Partial<ReqPool> = {}): ReqPool => ({});
// 2026-08-10: 소환 관련 요청 제거로 처치 요청으로 테스트
const def: RequestDef = { text: '{n}마리 처치', dur: 10, need: 5, now: (c) => c.killsSince };
const active = (d = def): ActiveRequest => startRequest(d, 1, 0); // 전투력 1.00 = 기준값 그대로

// 조건 미달이면 시간만 흐른다
{
  const r = active();
  assert.strictEqual(stepRequest(r, ctx({ killsSince: 2 }), 1), null);
  assert.strictEqual(r.t, 9);
}

// need 도달 즉시 성공 — 남은 시간은 소모되지 않는다
{
  const r = active();
  assert.strictEqual(stepRequest(r, ctx({ killsSince: 5 }), 1), 'success');
  assert.strictEqual(r.t, 10, '성공 프레임에선 타이머가 안 줄어야 함');
}

// 시간 만료 → 실패. 만료 프레임에 조건을 채우면 성공이 우선
{
  const r = active();
  for (let i = 0; i < 9; i++) assert.strictEqual(stepRequest(r, ctx(), 1), null);
  assert.strictEqual(stepRequest(r, ctx(), 1), 'fail');

  const r2 = active();
  r2.t = 0.01;
  assert.strictEqual(stepRequest(r2, ctx({ killsSince: 8 }), 1), 'success', '달성이 만료보다 우선');
}

// 진행률은 0~1로 물린다 (초과 달성도 100%)
{
  const r = active();
  assert.strictEqual(reqProgress(r, ctx()), 0);
  assert.strictEqual(reqProgress(r, ctx({ killsSince: 5 })), 1);
  assert.strictEqual(reqProgress(r, ctx({ killsSince: 15 })), 1);
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
  assert.strictEqual(r1.need, 5);
  assert.strictEqual(r1.label, '5마리 처치');

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

  // 전투력이 기준 미만이어도 목표가 기준값 밑으로 안 내려간다 (log2(Math.max(1, power))가 0 이하를 방지)
  assert.strictEqual(startRequest(def, 0.2, 0).need, def.need, '전투력 < 1이어도 기준값 유지');
  assert.ok(startRequest({ ...def, need: 1 }, 0.01, 0).need >= 1);

  // 비율 목표는 스케일 대상이 아니다 (HP 30%는 용사가 세져도 30%)
  const hp = REQUESTS.find((r) => r.noScale)!;
  assert.strictEqual(startRequest(hp, 8, 0).need, hp.need);
  assert.ok(!startRequest(hp, 8, 0).label.includes('{n}'), '{n} 없는 문구는 그대로');

  // kills0은 출제 시점 스냅샷
  assert.strictEqual(startRequest(def, 1, 42).kills0, 42);
}

// ── 출제 게이트 ──
// 2026-08-10: 소환·보스 관련 요청 제거로 모든 요청이 항상 출제 가능
{
  assert.ok(REQUESTS.length > 0, '요청이 있어야 함');
  for (let i = 0; i < 200; i++) {
    const picked = pickRequest(pool());
    assert.ok(picked, '요청이 출제되어야 함');
  }
}

// 직전 요청은 다시 안 나온다
{
  assert.ok(REQUESTS.length >= 2, '요청이 2개 이상이라야 exclude가 의미 있다');
  for (let i = 0; i < 200; i++) assert.notStrictEqual(pickRequest(pool(), Math.random, REQUESTS[0]), REQUESTS[0]);
}

// 뽑을 게 없으면 null (씬은 출제를 건너뛴다) — 현재는 항상 요청이 있으므로 null이 안 나옴
assert.strictEqual(pickRequest(pool(), () => 0) !== null, true, '요청이 항상 남는다');

// 용사 요청 판정: 노 데미지 / 콤보는 각자 자기 ctx 필드만 본다
{
  const noHit = REQUESTS.find((r) => r.now(ctx({ noHitT: 99 })) === 99)!;
  assert.ok(noHit, '노 데미지 요청이 있어야 함');
  assert.strictEqual(reqProgress(startRequest(noHit, 1, 0), ctx({ noHitT: noHit.need / 2 })), 0.5);
}

// 모든 요청이 빈 상황에서도 숫자를 낸다 (now 오타 방지)
// 개수 목표는 문구에 {n}이 있어야 한다 — 없으면 스케일된 목표와 표시가 어긋난다
for (const r of REQUESTS) {
  assert.strictEqual(typeof r.now(ctx()), 'number', `${r.text}의 now가 숫자가 아님`);
  assert.ok(r.need > 0 && r.dur > 0, `${r.text}의 need/dur가 유효하지 않음`);
  assert.strictEqual(r.text.includes('{n}'), !r.noScale, `${r.text}의 {n} 유무가 noScale과 안 맞음`);
}

console.log('requests OK');
