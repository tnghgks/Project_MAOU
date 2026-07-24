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

const { gameStore, gameState, saveGame, loadGame } = await import('../src/game/store.ts');

// save → 오염 → load 라운드트립: 해금·기록만 복원
gameStore.setState({ skills: ['낙뢰', '화염참격'], records: { bestViewers: 5000, bestGold: 12000 } });
saveGame();
gameStore.setState({ skills: ['낙뢰'], records: { bestViewers: 0, bestGold: 0 } });
loadGame();
assert.deepStrictEqual(gameState().skills, ['낙뢰', '화염참격']);
assert.strictEqual(gameState().records.bestViewers, 5000);
assert.strictEqual(gameState().records.bestGold, 12000);

// resetRun: 스탯/골드/진행도 초기화, 해금·기록 유지
gameStore.setState({ gold: 9999, episode: 4, hero: { ...gameState().hero, maxHp: 500 } });
gameState().resetRun();
assert.strictEqual(gameState().gold, 0);
assert.strictEqual(gameState().episode, 1);
assert.strictEqual(gameState().hero.maxHp, 100);
assert.deepStrictEqual(gameState().skills, ['낙뢰', '화염참격']); // 유지
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

console.log('store OK');
