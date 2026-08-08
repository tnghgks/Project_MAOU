import assert from 'node:assert';

// localStorage 스텁 (Node엔 없음)
const store: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => {
    store[k] = String(v);
  },
  removeItem: (k: string) => {
    delete store[k];
  },
} as Storage;

const { gameStore, gameState, saveGame, loadGame, heroPower, BASE_HERO, RANGE_CAP } = await import(
  '../src/game/store.ts'
);
const { UPGRADES } = await import('../src/data/upgrades.ts');

// save → 오염 → load 라운드트립: 해금·기록만 복원
gameStore.setState({
  skills: ['낙뢰', '화염폭발'],
  records: {
    bestViewers: 5000,
    bestGold: 12000,
    bestEpisode: 2,
    learnedSkills: ['화염폭발'],
    seenBosses: ['boss_golem'],
  },
});
saveGame();
gameStore.setState({
  skills: ['낙뢰'],
  records: { bestViewers: 0, bestGold: 0, bestEpisode: 1, learnedSkills: [], seenBosses: [] },
});
loadGame();
assert.deepStrictEqual(gameState().skills, ['낙뢰', '화염폭발']);
assert.strictEqual(gameState().records.bestViewers, 5000);
assert.strictEqual(gameState().records.bestGold, 12000);
assert.strictEqual(gameState().records.bestEpisode, 2, '도감 해금 기준(도달 화)도 세이브에 남는다');
assert.deepStrictEqual(gameState().records.learnedSkills, ['화염폭발']);
assert.deepStrictEqual(gameState().records.seenBosses, ['boss_golem']);

// 보스 도감: 등장을 본 것만 열린다. 같은 보스를 다시 만나도 중복으로 안 쌓인다.
{
  gameState().recordBossSeen('boss_knight');
  gameState().recordBossSeen('boss_knight');
  assert.deepStrictEqual(gameState().records.seenBosses, ['boss_golem', 'boss_knight']);
}

// 도감 필드가 없던 시절의 세이브도 읽힌다 — 누락 필드는 기본값으로 채워야 도감 화면이 안 깨진다
{
  store['maou.save'] = JSON.stringify({ skills: ['낙뢰'], records: { bestViewers: 77, bestGold: 88 } });
  loadGame();
  assert.strictEqual(gameState().records.bestViewers, 77);
  assert.strictEqual(gameState().records.bestEpisode, 1, '구버전 세이브의 누락 필드는 기본값');
  assert.deepStrictEqual(gameState().records.learnedSkills, []);
  assert.deepStrictEqual(gameState().records.seenBosses, []);
  gameStore.setState({
    records: { bestViewers: 5000, bestGold: 12000, bestEpisode: 2, learnedSkills: [], seenBosses: [] },
  });
  saveGame();
}

// 설정: 음량은 0~1로 잘리고 곧바로 세이브에 남는다
{
  gameState().setBgmVol(2); // 범위 밖은 상한으로
  gameState().setSfxVol(-1); // 범위 밖은 하한으로
  gameState().toggleScreenShake();
  assert.strictEqual(gameState().bgmVol, 1);
  assert.strictEqual(gameState().sfxVol, 0);
  assert.strictEqual(gameState().screenShake, false);
  const saved = JSON.parse(store['maou.save']);
  assert.strictEqual(saved.sfxVol, 0);
  assert.strictEqual(saved.screenShake, false);
  gameState().setSfxVol(1); // 뒤 검사에 영향 없게 되돌린다
  gameState().toggleScreenShake();
}

// resetRun: 스탯/골드/진행도/스킬/시청자 초기화, 기록 유지 + 세이브에도 반영
gameStore.setState({ gold: 9999, episode: 4, hero: { ...gameState().hero, maxHp: 500 }, viewers: 3000 });
gameState().resetRun();
assert.strictEqual(gameState().gold, 0);
assert.strictEqual(gameState().episode, 1);
assert.strictEqual(gameState().hero.maxHp, BASE_HERO.maxHp);
assert.strictEqual(gameState().viewers, 0);
assert.deepStrictEqual(gameState().skills, ['낙뢰']);
assert.deepStrictEqual(JSON.parse(store['maou.save']).skills, ['낙뢰']); // localStorage에서도 제거
assert.strictEqual(gameState().records.bestViewers, 5000); // 유지

// applyUpgrade: 골드 부족 시 실패, 충분 시 스탯 반영
gameStore.setState({ gold: 100 });
assert.strictEqual(gameState().applyUpgrade('hp'), false); // 200G 필요
gameStore.setState({ gold: 500 });
assert.strictEqual(gameState().applyUpgrade('hp'), true);
assert.strictEqual(gameState().gold, 300); // 500 - 200
assert.strictEqual(gameState().hero.maxHp, BASE_HERO.maxHp + UPGRADES.hp.delta);
assert.strictEqual(gameState().upgradeLevels.hp, 1);

// 사거리 상한(RANGE_CAP = 기본값의 3배): 카드/특성이 아무리 몰아줘도 이 값을 못 넘는다 (2026-07-31 피드백)
{
  gameStore.setState({ hero: { ...gameState().hero, range: BASE_HERO.range } });
  gameState().applyStatMods([{ stat: 'range', mode: 'flat', value: RANGE_CAP * 5 }]);
  assert.strictEqual(gameState().hero.range, RANGE_CAP, '사거리는 RANGE_CAP에서 잘린다');
  gameState().applyUpgrade('range'); // 상한에 이미 닿은 상태에서 강화를 사도 더 안 오른다
  assert.strictEqual(gameState().hero.range, RANGE_CAP, '업그레이드로도 상한을 못 넘는다');
}

// grantCard: 레벨은 그대로여도 statOf가 오른 값을 돌려줘야 한다 (#13 — 화면이 Lv만 보면 반영이 안 보였다)
{
  const { statOf } = await import('../src/data/upgrades.ts');
  const before = statOf('atk', gameState().hero);
  const lv = gameState().upgradeLevels.atk;
  gameState().grantCard({
    id: 'sharpBlade',
    rarity: 'common',
    name: '검술 수련',
    desc: '',
    mods: [{ stat: 'atk', mode: 'flat', value: 30 }],
  });
  assert.strictEqual(statOf('atk', gameState().hero), before + 30, '카드 상승분이 표시 값에 반영');
  assert.strictEqual(gameState().upgradeLevels.atk, lv, '상점 가격은 구매 이력만 따라간다');
}

// nextEpisode: peakViewers÷2와 stageViewerFloor(다음 화 목표 골드 비례) 중 큰 쪽으로 인계
{
  const { stageViewerFloor } = await import('../src/data/progression.ts');
  gameStore.setState({ episode: 1, lastRun: { outcome: 'clear', peakViewers: 10000, totalDonated: 0, kills: 0 } });
  gameState().nextEpisode();
  assert.strictEqual(gameState().episode, 2);
  assert.strictEqual(gameState().viewers, 5000, 'peak÷2가 하한보다 크면 그대로 인계');

  gameStore.setState({ episode: 2, lastRun: { outcome: 'clear', peakViewers: 10, totalDonated: 0, kills: 0 } });
  gameState().nextEpisode();
  assert.strictEqual(gameState().episode, 3);
  assert.strictEqual(gameState().viewers, stageViewerFloor(3), 'peak÷2가 하한보다 낮으면 하한으로 보정');
}

// upgradeCostRange: 지금 레벨 기준 가장 싼/비싼 업그레이드 가격 — 도네이션 상하한이 여기 연동
{
  const { upgradeCostRange, upgradeCost } = await import('../src/data/upgrades.ts');
  const levels = { hp: 0, atk: 0, atkSpd: 0, speed: 0, range: 0 };
  const { min, max } = upgradeCostRange(levels);
  assert.strictEqual(min, upgradeCost('speed', 0), '초기 상태 최저가는 경보법(180)');
  assert.strictEqual(max, upgradeCost('atkSpd', 0), '초기 상태 최고가는 속공 훈련(300)');
  const { min: min2 } = upgradeCostRange({ ...levels, speed: 3 });
  assert.ok(min2 > min, '레벨이 오르면 하한 기준 가격도 같이 오른다');
}

// learnSkill: 골드 차감 + 추가. 도감 기록(learnedSkills)에도 남아야 런이 끝나도 해금이 유지된다
gameStore.setState({ gold: 500, skills: ['낙뢰'] });
assert.strictEqual(gameState().learnSkill('시간정지', 500), true);
assert.deepStrictEqual(gameState().skills, ['낙뢰', '시간정지']);
assert.strictEqual(gameState().gold, 0);
assert.ok(gameState().records.learnedSkills.includes('시간정지'), '배운 스킬은 도감에 기록된다');
gameState().resetRun();
assert.deepStrictEqual(gameState().skills, ['낙뢰'], '보유 스킬은 런과 함께 초기화');
assert.ok(gameState().records.learnedSkills.includes('시간정지'), '도감 기록은 리셋에도 남는다');

// clearSave: 도감·기록까지 전부 지운다 (옵션 → 데이터 초기화)
gameState().clearSave();
assert.strictEqual(gameState().records.bestViewers, 0);
assert.strictEqual(gameState().records.bestEpisode, 1);
assert.deepStrictEqual(gameState().records.learnedSkills, []);
assert.strictEqual(JSON.parse(store['maou.save']).records.bestGold, 0, 'localStorage에서도 지워진다');

// ── 전투력: 요청 난이도가 이 하나만 보므로 기준점과 단조성이 맞아야 한다 ──
assert.strictEqual(heroPower(BASE_HERO), 1, '시작 스탯이 1.00 기준');

// 지수 합이 1 — 모든 스탯이 x배면 전투력도 x배 (atk·atkSpd는 곱이라 각각 √x)
{
  const x = 4;
  const all = {
    ...BASE_HERO,
    maxHp: BASE_HERO.maxHp * x,
    atk: BASE_HERO.atk * Math.sqrt(x),
    atkSpd: BASE_HERO.atkSpd * Math.sqrt(x),
    speed: BASE_HERO.speed * x,
    range: BASE_HERO.range * x,
  };
  assert.ok(Math.abs(heroPower(all) - x) < 0.01, `전 스탯 ${x}배면 전투력도 ${x}배 (실제 ${heroPower(all)})`);
}

// 어느 스탯을 올려도 전투력은 오른다 (안 세는 스탯이 있으면 그것만 찍어 요청을 쉽게 유지할 수 있다)
for (const k of ['maxHp', 'atk', 'atkSpd', 'speed', 'range'] as const) {
  assert.ok(heroPower({ ...BASE_HERO, [k]: BASE_HERO[k] * 2 }) > 1, `${k} 강화가 전투력에 반영 안 됨`);
}

// 한 스탯만 몰아줘도 폭주하지 않는다 (곱셈 기하평균)
assert.ok(heroPower({ ...BASE_HERO, maxHp: BASE_HERO.maxHp * 100 }) < 10, '단일 스탯 100배가 10배를 넘지 않음');

console.log('store OK');
