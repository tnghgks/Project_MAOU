import assert from 'node:assert';
import { buildArenaMap, MAP_W, MAP_H } from '../src/game/arenaMap.ts';

// ── 크기와 벽 테두리는 시드와 무관하게 고정 ──
for (const ep of [1, 3, 7]) {
  const { ground, props } = buildArenaMap(ep);
  assert.strictEqual(ground.length, MAP_H);
  assert.strictEqual(props.length, MAP_H);
  for (const row of ground) assert.strictEqual(row.length, MAP_W);

  // 좌우 벽 (상·하단 마감행 제외)
  for (let y = 1; y < MAP_H - 1; y++) {
    assert.strictEqual(ground[y][0], 13, `ep${ep} 좌벽 y=${y}`);
    assert.strictEqual(ground[y][MAP_W - 1], 15, `ep${ep} 우벽 y=${y}`);
  }
  // 광맥은 벽·경계행을 침범하지 않는다 (y<3 이면 벽 정면/경계를 덮은 것)
  for (let y = 0; y < 3; y++) {
    assert.ok(!ground[y].includes(42), `ep${ep} 광맥이 벽을 덮음 y=${y}`);
  }
  // 소품은 벽에 붙은 두 줄에만
  props.forEach((row, y) => {
    if (y !== 3 && y !== MAP_H - 3)
      assert.ok(
        row.every((t) => t === -1),
        `ep${ep} 소품 이탈 y=${y}`,
      );
  });
}

// ── 같은 화는 같은 맵, 다른 화는 다른 맵 ──
const j = (ep: number) => JSON.stringify(buildArenaMap(ep));
assert.strictEqual(j(2), j(2));
assert.notStrictEqual(j(1), j(2));

console.log('arenaMap ok');
