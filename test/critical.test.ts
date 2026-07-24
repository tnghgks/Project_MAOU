import assert from 'node:assert';
import { criticalStep, viewerAlert, MIN_VIEWERS, WARN_VIEWERS, CRIT_TIME, CRIT_ESCAPE } from '../src/formulas.ts';

// 시청자 바닥 위기 상태머신 — 게임 오버를 유발하는 분기라 브라우저 없이도 돌려볼 수 있어야 한다.
// BattleScene.updateCritical과 동일한 순서(감소 → 판정)로 한 프레임을 재현.
type Sim = { viewers: number; critical: boolean; critT: number; ended: boolean };
function tick(s: Sim, dt: number) {
  if (s.critical) s.critT -= dt;
  switch (criticalStep(s.viewers, s.critical, s.critT)) {
    case 'enter': s.critical = true; s.critT = CRIT_TIME; break;
    case 'exit': s.critical = false; s.critT = 0; break;
    case 'fail': s.ended = true; break;
  }
}
const make = (viewers: number): Sim => ({ viewers, critical: false, critT: 0, ended: false });

// 바닥이 아니면 위기 진입 없음
{
  const s = make(5);
  tick(s, 0.1);
  assert.strictEqual(s.critical, false);
}

// 바닥 도달 → 위기 진입, CRIT_TIME부터 카운트다운
{
  const s = make(MIN_VIEWERS);
  tick(s, 0.1);
  assert.strictEqual(s.critical, true);
  assert.strictEqual(s.critT, CRIT_TIME);
}

// 회복 실패 → CRIT_TIME 경과 후 종료. 조기 종료는 불가, 만료는 float 누적오차로 ±1프레임 허용
{
  const s = make(MIN_VIEWERS);
  tick(s, 0.1); // 진입
  const frames = Math.round(CRIT_TIME / 0.1);
  for (let i = 0; i < frames - 1; i++) tick(s, 0.1);
  assert.strictEqual(s.ended, false, `조기 종료 (critT=${s.critT})`);
  tick(s, 0.1);
  tick(s, 0.1);
  assert.strictEqual(s.ended, true, `CRIT_TIME 후 종료돼야 함 (critT=${s.critT})`);
}

// CRIT_ESCAPE 도달 → 위기 해제, 다시 바닥이면 재진입
{
  const s = make(MIN_VIEWERS);
  tick(s, 0.1);
  s.viewers = CRIT_ESCAPE;
  tick(s, 0.1);
  assert.strictEqual(s.critical, false);
  assert.strictEqual(s.ended, false);
  s.viewers = MIN_VIEWERS;
  tick(s, 0.1);
  assert.strictEqual(s.critical, true, '재진입 가능해야 함');
  assert.strictEqual(s.critT, CRIT_TIME, '카운트다운이 새로 시작돼야 함');
}

// 탈출은 만료보다 우선 — 같은 프레임에 critT가 0이 돼도 시청자가 늘었으면 산다
{
  const s: Sim = { viewers: CRIT_ESCAPE, critical: true, critT: 0.05, ended: false };
  tick(s, 0.1);
  assert.strictEqual(s.ended, false);
  assert.strictEqual(s.critical, false);
}

// ── 2단계 경보 ──
assert.strictEqual(viewerAlert(WARN_VIEWERS + 1, false), 'normal');
assert.strictEqual(viewerAlert(WARN_VIEWERS, false), 'warn', '5명이 되는 순간 경고');

// 판정 기준 = 화면 표시(내림). 5.9는 "5명"으로 보이므로 이미 경고여야 한다.
assert.strictEqual(viewerAlert(WARN_VIEWERS + 0.9, false), 'warn', '표시가 5명이면 경고');
assert.strictEqual(criticalStep(MIN_VIEWERS + 0.9, false, 0), 'enter', '표시가 1명이면 카운트다운');
assert.strictEqual(criticalStep(CRIT_ESCAPE - 0.1, true, 5), 'none', '표시가 1명이면 아직 탈출 아님');
assert.strictEqual(criticalStep(CRIT_ESCAPE, true, 5), 'exit');
assert.strictEqual(viewerAlert(MIN_VIEWERS, false), 'warn', '카운트다운 진입 전 프레임은 아직 warn');
assert.strictEqual(viewerAlert(MIN_VIEWERS, true), 'critical');
// 히스테리시스: 카운트다운 중이면 5명을 넘겨도 탈출(CRIT_ESCAPE) 전까진 critical 유지
assert.strictEqual(viewerAlert(WARN_VIEWERS + 10, true), 'critical');

// 1명 도달 = 같은 프레임에 카운트다운 시작 + critical 표시
{
  const s = make(MIN_VIEWERS);
  tick(s, 0.1);
  assert.strictEqual(s.critT, CRIT_TIME);
  assert.strictEqual(viewerAlert(s.viewers, s.critical), 'critical');
}

// ── 통합: 실제 감쇠 궤적 (viewers는 정수가 아니라 실수로 미끄러진다) ──
// 이 경로가 브라우저에서 "5명 표시인데 경고 없음"을 드러냈다. 단위 테스트의 정수 경계로는 안 잡힌다.
{
  const s = make(12);
  let warnedAt: number | null = null;
  let critAt: number | null = null;
  const dt = 1 / 60;
  for (let f = 0; f < 60 * 200 && !s.ended; f++) {
    s.viewers = Math.max(MIN_VIEWERS, s.viewers * (1 - 0.03 * dt)); // 노잼 구간 감쇠
    tick(s, dt);
    const a = viewerAlert(s.viewers, s.critical);
    if (a === 'warn' && warnedAt === null) warnedAt = s.viewers;
    if (a === 'critical' && critAt === null) critAt = s.viewers;
  }
  assert.ok(warnedAt !== null && Math.floor(warnedAt) === WARN_VIEWERS, `경고는 표시 ${WARN_VIEWERS}명에서 (실제 ${warnedAt})`);
  assert.ok(critAt !== null && Math.floor(critAt) === MIN_VIEWERS, `카운트다운은 표시 ${MIN_VIEWERS}명에서 (실제 ${critAt})`);
  assert.strictEqual(s.ended, true, '회복 없으면 결국 방송 종료');
}

// 반대로 회복 궤적이면 종료되지 않는다
{
  const s = make(MIN_VIEWERS);
  const dt = 1 / 60;
  for (let f = 0; f < 60 * 30 && !s.ended; f++) {
    s.viewers = Math.max(MIN_VIEWERS, s.viewers * (1 + 0.09 * dt)); // 벼랑끝 구간 상승
    tick(s, dt);
  }
  assert.strictEqual(s.ended, false, '최대 흥분도로 밀어올리면 살아남아야 함');
  assert.strictEqual(s.critical, false, '탈출 후 위기 해제');
}

console.log('critical OK');
