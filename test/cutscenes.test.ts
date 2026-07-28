import assert from 'node:assert';
import { gameStore, gameState } from '../src/game/store.ts';
import { CUTSCENES, stageCut, bossCut, endingCut } from '../src/data/cutscenes.ts';

// ── 큐: 한 장씩 소비하고, 다 비었을 때만 after가 정확히 한 번 ──
let done = 0;
gameState().playCuts(['intro', stageCut(1)], () => done++);
assert.strictEqual(gameStore.getState().cuts.length, 2);
gameState().advanceCut();
assert.strictEqual(done, 0, '큐가 남았는데 after가 불렸다');
gameState().advanceCut();
assert.strictEqual(done, 1);
assert.strictEqual(gameStore.getState().cuts.length, 0);

// 큐가 빈 뒤 한 번 더 밀어도 after는 재실행되지 않는다 (스킵 연타 방어)
gameState().advanceCut();
assert.strictEqual(done, 1);

// after 없이도 안전
gameState().playCuts('intro');
gameState().advanceCut();
assert.strictEqual(gameStore.getState().cuts.length, 0);

// ── 진행 흐름이 요구하는 id는 모두 등록돼 있어야 한다 ──
assert.ok(CUTSCENES.intro);
for (const ep of [1, 2, 3]) {
  assert.ok(CUTSCENES[stageCut(ep)], `${ep}화 진입 컷씬 없음`);
  assert.ok(CUTSCENES[bossCut(ep)], `${ep}화 보스 컷씬 없음`);
}
for (const k of ['bad', 'best', 'hidden']) assert.ok(CUTSCENES[endingCut(k)], `${k} 엔딩 컷씬 없음`);

console.log('cutscenes.test.ts ok');
