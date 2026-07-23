import assert from 'node:assert';

// localStorage 스텁 (Node엔 없음)
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

const { GameState, save, load, resetRun } = await import('../src/state.js');

// save → 오염 → load 라운드트립: 해금·기록만 복원
GameState.skills = ['낙뢰', '화염참격'];
GameState.records = { bestViewers: 5000, bestGold: 12000 };
save();
GameState.skills = ['낙뢰'];
GameState.records = { bestViewers: 0, bestGold: 0 };
load();
assert.deepStrictEqual(GameState.skills, ['낙뢰', '화염참격']);
assert.strictEqual(GameState.records.bestViewers, 5000);
assert.strictEqual(GameState.records.bestGold, 12000);

// resetRun: 스탯/골드/진행도 초기화, 해금·기록은 유지
GameState.gold = 9999;
GameState.episode = 4;
GameState.hero.maxHp = 500;
GameState.upgradeLevels.hp = 5;
resetRun();
assert.strictEqual(GameState.gold, 0);
assert.strictEqual(GameState.episode, 1);
assert.strictEqual(GameState.hero.maxHp, 100);
assert.strictEqual(GameState.upgradeLevels.hp, 0);
assert.deepStrictEqual(GameState.skills, ['낙뢰', '화염참격']); // 유지
assert.strictEqual(GameState.records.bestViewers, 5000); // 유지

console.log('state OK');
