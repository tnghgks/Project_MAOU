import assert from 'node:assert';
import {
  WAVE_SLOTS,
  WAVE_ENTRY_MAX,
  WAVE_TYPES_MAX,
  WAVE_CYCLE_MAX,
  WAVE_CYCLE_GROWTH,
  lineupBudget,
  lineupCost,
  waveCost,
  summonableAt,
  emptyLineup,
  validateLineup,
  waveAt,
  waveThreat,
  unitThreat,
  stepWave,
  WAVE_INTERVAL,
  filledWaves,
  lineupMonsters,
  defaultLineup,
  type Lineup,
} from '../src/data/waves.ts';
import { MONSTERS, type MonsterId, type MonsterDef } from '../src/data/monsters.ts';
import { FINAL_EP } from '../src/data/progression.ts';

// 편성은 방송 전체의 입력값이다 — 잘못된 편성이 씬까지 흘러가면 "아무것도 안 나오는 방송"이 된다.
// 검증·순환·자동편성 세 가지가 브라우저 없이 돌아야 하는 이유.

// ── 편성 가능 몬스터 ──
{
  const ep1 = summonableAt(1);
  assert.ok(ep1.length > 0);
  assert.ok(
    ep1.every((id) => MONSTERS[id].unlock <= 1),
    '1화엔 unlock 1짜리만',
  );
  assert.ok(!ep1.some((id) => MONSTERS[id].unlock >= 99), '보스는 편성 대상이 아니다');
  assert.ok(summonableAt(FINAL_EP).length > ep1.length, '화가 오르면 선택지가 늘어야 한다');
  // 신규 역할 몬스터가 1화부터 잡힌다 — 1화 편성이 슬라임/궁수/사이클롭스 셋뿐이면 개편한 의미가 없다
  assert.ok(ep1.includes('splitter') && ep1.includes('turtle'), '1화에 역할 몬스터가 있어야 함');
}

// 모든 편성 대상 몬스터는 코스트가 있어야 한다 (0이면 무한히 넣을 수 있다)
for (const id of summonableAt(FINAL_EP)) {
  assert.ok(MONSTERS[id].cost > 0, `${id}의 편성 코스트가 0`);
}

// 분열 대상은 실재하는 몬스터여야 한다. MonsterDef.split.into는 타입 순환(MonsterDef ↔ MonsterId)을
// 피하려고 string이라 오타가 컴파일에서 안 걸린다 — 그 구멍을 여기서 막는다.
// 자기 자신으로 분열하면 BattleScene이 split을 떼고 스폰해도 무한 증식에 가까워지므로 같이 막는다.
{
  const ids = Object.keys(MONSTERS) as MonsterId[];
  // MonsterDef로 좁혀 읽는다 — MONSTERS는 satisfies라 줄마다 리터럴 타입이 유니온으로 남고,
  // split을 안 가진 몬스터가 섞이면 유니온 접근이 막힌다(UnlockPanel·BootScene도 같은 처방).
  const defOf = (id: MonsterId): MonsterDef => MONSTERS[id];
  const splitters = ids.filter((id) => defOf(id).split);
  assert.ok(splitters.length > 0, '분열 몬스터가 하나는 있어야 이 검사가 의미 있다');
  for (const id of splitters) {
    const s = defOf(id).split!;
    assert.ok(ids.includes(s.into as MonsterId), `${id}.split.into('${s.into}')가 실재하지 않는 몬스터`);
    assert.notStrictEqual(s.into, id, `${id}가 자기 자신으로 분열한다`);
    assert.ok(s.count > 0, `${id}.split.count가 0 이하`);
  }
}

// ── 예산 ──
{
  assert.ok(lineupBudget(2) > lineupBudget(1), '화가 오르면 예산도 오른다');
  assert.strictEqual(lineupBudget(0), lineupBudget(1), '화 번호가 1 미만이어도 음수 예산은 없다');
}

// ── 비용 계산 ──
{
  const w = [
    { type: 'slime' as MonsterId, count: 4 },
    { type: 'golem' as MonsterId, count: 2 },
  ];
  assert.strictEqual(waveCost(w), MONSTERS.slime.cost * 4 + MONSTERS.golem.cost * 2);
  assert.strictEqual(lineupCost([w, w]), waveCost(w) * 2);
  assert.strictEqual(lineupCost(emptyLineup()), 0);
}

// ── 검증 ──
{
  const one = (w: { type: MonsterId; count: number }[]): Lineup => [w, [], [], [], []];

  assert.strictEqual(validateLineup(emptyLineup(), 1), 'empty', '빈 편성으론 방송 못 나간다');
  assert.strictEqual(validateLineup(one([{ type: 'slime', count: 1 }]), 1), null);

  // 예산 초과
  const over = Math.ceil(lineupBudget(1) / MONSTERS.slime.cost) + 1;
  assert.strictEqual(validateLineup([[{ type: 'slime', count: over }], [], [], [], []], 1), 'overBudget');

  // 미해금 몬스터 (정예 기사는 3화부터)
  assert.strictEqual(validateLineup(one([{ type: 'knight', count: 1 }]), 1), 'locked');
  assert.strictEqual(validateLineup(one([{ type: 'knight', count: 1 }]), 3), null, '3화엔 기사 편성 가능');

  // 한 웨이브 종류 수 상한
  const tooMany = summonableAt(FINAL_EP)
    .slice(0, WAVE_TYPES_MAX + 1)
    .map((type) => ({ type, count: 1 }));
  assert.strictEqual(tooMany.length, WAVE_TYPES_MAX + 1);
  assert.strictEqual(validateLineup(one(tooMany), FINAL_EP), 'tooManyTypes');

  // 한 칸 마릿수 상한 / 하한
  assert.strictEqual(validateLineup(one([{ type: 'slime', count: WAVE_ENTRY_MAX + 1 }]), 1), 'tooManyCount');
  assert.strictEqual(validateLineup(one([{ type: 'slime', count: 0 }]), 1), 'tooManyCount', '0마리 칸은 무효');
}

// ── 웨이브 순환 ──
{
  const l: Lineup = [
    [{ type: 'slime', count: 4 }],
    [{ type: 'archer', count: 2 }],
    [], // 빈 칸은 건너뛴다
    [],
    [],
  ];
  assert.strictEqual(filledWaves(l), 2);

  // 사이클 0 — 편성 그대로
  assert.deepStrictEqual(waveAt(l, 0), [{ type: 'slime', count: 4 }]);
  assert.deepStrictEqual(waveAt(l, 1), [{ type: 'archer', count: 2 }]);

  // 채운 칸 수만큼 돌면 다음 사이클 — 마릿수가 늘어난다
  assert.strictEqual(waveAt(l, 2)[0].type, 'slime', '빈 칸을 건너뛰고 처음으로 돌아온다');
  assert.strictEqual(waveAt(l, 2)[0].count, Math.round(4 * (1 + WAVE_CYCLE_GROWTH)));
  assert.ok(waveAt(l, 2)[0].count > waveAt(l, 0)[0].count, '사이클이 돌면 물량이 는다');

  // 배수 상한 — 오래 끌어도 무한 증식하지 않는다
  const capped = Math.round(4 * (1 + WAVE_CYCLE_MAX * WAVE_CYCLE_GROWTH));
  assert.strictEqual(waveAt(l, 2 * (WAVE_CYCLE_MAX + 5))[0].count, capped, '배수는 상한에서 멈춘다');

  // 편성이 비면 아무것도 안 나온다 (씬은 이 경우 웨이브를 건너뛴다)
  assert.deepStrictEqual(waveAt(emptyLineup(), 0), []);

  // 편성한 몬스터 종류 — 요청 출제 풀이 이걸 본다
  assert.deepStrictEqual(lineupMonsters(l).sort(), ['archer', 'slime']);
  assert.deepStrictEqual(lineupMonsters(emptyLineup()), []);
}

// ── 위협도 ──
// 표시 전용 지표지만 편성 판단의 근거로 쓰이므로, 설계 의도가 숫자로 지켜지는지 확인한다.
{
  assert.strictEqual(waveThreat([]), 0, '빈 웨이브는 0');
  assert.ok(Number.isInteger(waveThreat([{ type: 'slime', count: 3 }])), '표시용이라 정수로 떨어져야 한다');

  // 마릿수에 단조 증가
  const one = waveThreat([{ type: 'slime', count: 1 }]);
  const four = waveThreat([{ type: 'slime', count: 4 }]);
  assert.ok(four > one, '많을수록 위협적');

  // 자폭은 한 방으로 계산한다 — dmg/atkCd로 재면 폭탄 박쥐가 초당 200이 돼 지표가 폭주한다
  const bat = MONSTERS.bat;
  assert.ok(unitThreat('bat') < bat.dmg / bat.atkCd, '자폭은 dps 환산에서 제외돼야 한다');
  assert.ok(unitThreat('bat') < unitThreat('knight'), '박쥐가 정예 기사보다 위협적일 수는 없다');

  // 분열 슬라임 하나가 슬라임 둘보다 위협적이다 — 죽어야 진짜 물량이 나오는 값어치
  assert.ok(unitThreat('splitter') > unitThreat('slime') * 2, '분열 몫이 반영돼야 한다');

  // 방어는 체력으로 환산돼 붙는다 — 체력 몫만으로 설명되면 안 된다
  assert.ok(MONSTERS.turtle.armor && MONSTERS.turtle.armor > 0);
  assert.ok(unitThreat('turtle') > MONSTERS.turtle.hp / 10, '방어가 체력 몫 위에 얹혀야 한다');

  // 오라는 자기 몫이 아니라 무리 전체를 곱한다 — 따로 더한 값보다 커야 의미가 있다
  const pack = waveThreat([
    { type: 'slime', count: 4 },
    { type: 'shaman', count: 1 },
  ]);
  const apart = waveThreat([{ type: 'slime', count: 4 }]) + unitThreat('shaman');
  assert.ok(pack > apart, '주술사를 섞으면 무리 전체가 세져야 한다');

  // 편성 가능한 몬스터는 전부 양수 — 0이면 막대가 안 그려진다
  for (const id of summonableAt(FINAL_EP)) assert.ok(unitThreat(id) > 0, `${id}의 위협도가 0 이하`);
}

// ── 투입 타이머 (stepWave) ──
// BattleScene.update가 이 리듀서를 그대로 공유한다(재구현 금지) — 브라우저 없이 투입 주기를 검증한다.
{
  // 남은 시간이 있으면 안 나간다
  const s = { waveT: WAVE_INTERVAL };
  assert.strictEqual(stepWave(s, 1), false);
  assert.strictEqual(s.waveT, WAVE_INTERVAL - 1);

  // 0에 닿는 프레임에 정확히 한 번 나가고 간격이 되감긴다
  const s2 = { waveT: 0.5 };
  assert.strictEqual(stepWave(s2, 0.5), true, '0에 닿으면 투입');
  assert.strictEqual(s2.waveT, WAVE_INTERVAL, '투입 후 간격 리셋');
  assert.strictEqual(stepWave(s2, 0.5), false, '연속 투입은 없다');

  // dt가 남은 시간보다 커도 한 프레임에 한 번만 (프레임 드랍 시 몰아치기 방지)
  const s3 = { waveT: 0.1 };
  assert.strictEqual(stepWave(s3, 5), true);
  assert.strictEqual(s3.waveT, WAVE_INTERVAL, '초과분은 이월하지 않는다');

  // 첫 웨이브는 WAVE_INTERVAL보다 훨씬 빨리 나와야 한다 — 예전 개편 전의 무목표 구간을 없애는 게 목적
  const first = { waveT: 2.5 }; // BattleScene.WAVE_FIRST_DELAY와 같은 값
  assert.ok(first.waveT < WAVE_INTERVAL, '첫 웨이브 유예가 정규 간격보다 짧아야 한다');
  let ticks = 0;
  while (!stepWave(first, 0.1)) ticks++;
  assert.ok(ticks < WAVE_INTERVAL * 10, '첫 웨이브가 정규 간격 안에 나온다');
}

// ── 자동 편성 ──
for (let ep = 1; ep <= FINAL_EP; ep++) {
  const l = defaultLineup(ep);
  assert.strictEqual(l.length, WAVE_SLOTS, `${ep}화 자동 편성의 칸 수`);
  assert.strictEqual(validateLineup(l, ep), null, `${ep}화 자동 편성이 검증을 통과해야 함`);
  assert.ok(lineupCost(l) <= lineupBudget(ep), `${ep}화 자동 편성이 예산 초과`);
  assert.strictEqual(filledWaves(l), WAVE_SLOTS, `${ep}화 자동 편성은 다섯 칸을 다 채운다`);
  // 뒤 웨이브가 앞 웨이브보다 무겁다 — 방송이 저절로 고조돼야 한다
  assert.ok(waveCost(l[WAVE_SLOTS - 1]) > waveCost(l[0]), `${ep}화 자동 편성의 후반이 더 무거워야 함`);
}

console.log('waves OK');
