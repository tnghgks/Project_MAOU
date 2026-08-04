import assert from 'node:assert';
import { buildArenaMap, DESERT_OBJECTS, MAP_W, MAP_H } from '../src/game/arenaMap.ts';
import { ARENA } from '../src/game/layout.ts';

// ── 광산(2화~): 크기와 벽 테두리는 시드와 무관하게 고정 ──
for (const ep of [2, 3, 7]) {
  const { ground, props, tiles } = buildArenaMap(ep);
  assert.strictEqual(tiles.key, 'tiles');
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

// ── 사막(1화): wang 시트 범위 안이고, 소품이 아레나를 벗어나지 않는다 ──
// 소품 원점은 밑변 중앙이라 y가 곧 발 위치다. 위쪽 띠에 놓인 소품의 머리(y - h×2)가 음수면
// 아레나 밖 HUD를 침범한다 — DESERT_OBJECTS의 h가 실제 png 높이와 어긋나면 여기서 걸린다.
{
  const { ground, props, objects, tiles } = buildArenaMap(1);
  assert.strictEqual(tiles.key, 'desert-tiles');
  assert.strictEqual(ground.length, MAP_H);
  for (const row of ground) {
    assert.strictEqual(row.length, MAP_W);
    for (const t of row) assert.ok(t >= 0 && t < 16, `사막 타일 범위 이탈: ${t}`);
  }
  assert.ok(
    props.every((row) => row.every((t) => t === -1)),
    '사막은 타일 소품을 안 쓴다 (낱장 이미지로 얹는다)',
  );

  assert.ok(objects.length > 0, '사막 소품이 하나도 안 깔렸다');
  const H = new Map(DESERT_OBJECTS.map((o) => [o.key, o.h]));
  for (const o of objects) {
    const h = H.get(o.key);
    assert.ok(h !== undefined, `모르는 소품 키: ${o.key}`);
    assert.ok(o.x >= 0 && o.x <= ARENA.w, `소품 x 이탈: ${o.x}`);
    assert.ok(o.y <= ARENA.h, `소품이 아레나 아래로 내려갔다: ${o.y}`);
    assert.ok(o.y - h! * 2 >= 0, `소품 머리가 아레나 위로 삐져나왔다: ${o.key} y=${o.y}`);
  }
}

// 광산은 낱장 소품을 안 쓴다
assert.deepStrictEqual(buildArenaMap(2).objects, []);

// ── 같은 화는 같은 맵, 다른 화는 다른 맵 ──
const j = (ep: number) => JSON.stringify(buildArenaMap(ep));
assert.strictEqual(j(2), j(2));
assert.notStrictEqual(j(1), j(2));

console.log('arenaMap ok');
