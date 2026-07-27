import assert from 'node:assert';
import {
  REQUESTS,
  pickRequest,
  stepRequest,
  reqProgress,
  type ActiveRequest,
  type ReqCtx,
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
});
const def: RequestDef = { text: '슬라임 3', dur: 10, need: 3, now: (c) => c.count('slime') };
const active = (d = def): ActiveRequest => ({ def: d, t: d.dur, kills0: 0 });

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

  const r2: ActiveRequest = { def, t: 0.01, kills0: 0 };
  assert.strictEqual(stepRequest(r2, ctx({ alive: { slime: 5 } }), 1), 'success', '탈출이 만료보다 우선');
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

// ── 출제 게이트 ──
// 1화(슬라임/궁수/골렘만 해금)에선 박쥐·기사 요청이 안 나온다
{
  const ep1: MonsterId[] = ['slime', 'archer', 'golem'];
  const pool = REQUESTS.filter((r) => (r.needs ?? []).every((m) => ep1.includes(m)));
  assert.ok(pool.length > 0);
  assert.ok(
    !pool.some((r) => (r.needs ?? []).some((m) => m === 'bat' || m === 'knight')),
    '미해금 몬스터 요청은 제외돼야 함',
  );
  for (let i = 0; i < 200; i++) assert.ok(pool.includes(pickRequest(ep1)!));
}

// 직전 요청은 다시 안 나온다
{
  const all = Object.keys({}) as MonsterId[]; // 해금 없음 → needs 없는 요청만
  const noNeed = REQUESTS.filter((r) => !r.needs);
  assert.ok(noNeed.length >= 2, '해금 무관 요청이 2개 이상이라야 exclude가 의미 있다');
  for (let i = 0; i < 200; i++) assert.notStrictEqual(pickRequest(all, Math.random, noNeed[0]), noNeed[0]);
}

// 뽑을 게 없으면 null (씬은 출제를 건너뛴다)
assert.strictEqual(pickRequest([], () => 0, undefined) !== null, true, '해금 무관 요청은 항상 남는다');

// 모든 요청이 빈 상황에서도 숫자를 낸다 (now 오타 방지)
for (const r of REQUESTS) {
  assert.strictEqual(typeof r.now(ctx()), 'number', `${r.text}의 now가 숫자가 아님`);
  assert.ok(r.need > 0 && r.dur > 0, `${r.text}의 need/dur가 유효하지 않음`);
}

console.log('requests OK');
