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

const { gameStore, gameState, saveGame, loadGame, heroPower, BASE_HERO } = await import('../src/game/store.ts');

// save → 오염 → load 라운드트립: 해금·기록만 복원
gameStore.setState({ skills: ['낙뢰', '화염참격'], records: { bestViewers: 5000, bestGold: 12000 } });
saveGame();
gameStore.setState({ skills: ['낙뢰'], records: { bestViewers: 0, bestGold: 0 } });
loadGame();
assert.deepStrictEqual(gameState().skills, ['낙뢰', '화염참격']);
assert.strictEqual(gameState().records.bestViewers, 5000);
assert.strictEqual(gameState().records.bestGold, 12000);

// resetRun: 스탯/골드/진행도/스킬/시청자 초기화, 기록 유지 + 세이브에도 반영
gameStore.setState({ gold: 9999, episode: 4, hero: { ...gameState().hero, maxHp: 500 }, viewers: 3000 });
gameState().resetRun();
assert.strictEqual(gameState().gold, 0);
assert.strictEqual(gameState().episode, 1);
assert.strictEqual(gameState().hero.maxHp, 100);
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
assert.strictEqual(gameState().hero.maxHp, 180); // 100 + 80
assert.strictEqual(gameState().upgradeLevels.hp, 1);

// learnSkill: 골드 차감 + 추가
gameStore.setState({ gold: 500, skills: ['낙뢰'] });
assert.strictEqual(gameState().learnSkill('시간정지', 500), true);
assert.deepStrictEqual(gameState().skills, ['낙뢰', '시간정지']);
assert.strictEqual(gameState().gold, 0);

// ── 전투력: 요청 난이도가 이 하나만 보므로 기준점과 단조성이 맞아야 한다 ──
assert.strictEqual(heroPower(BASE_HERO), 1, '시작 스탯이 1.00 기준');

// 지수 합이 1 — 모든 스탯이 x배면 전투력도 x배 (atk·atkSpd는 곱이라 각각 √x)
{
  const x = 4;
  const all = {
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
