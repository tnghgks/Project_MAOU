import assert from 'node:assert';
import {
  buildArenaMap,
  CASTLE_OBJECTS,
  DESERT_OBJECTS,
  GRAVEYARD_OBJECTS,
  MAP_W,
  MAP_H,
  type PropDef,
} from '../src/game/arenaMap.ts';
import { ARENA } from '../src/game/layout.ts';

// ── 광산(4화~): 크기와 벽 테두리는 시드와 무관하게 고정 ──
for (const ep of [4, 5, 7]) {
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

// ── 코너 wang 스테이지(사막 1화 · 묘지 2화 · 마왕성 3화) ──
// 검증은 같다: 타일이 시트 범위 안이고, 낱장 소품이 아레나를 벗어나지 않는다. 소품 원점은 밑변
// 중앙이라 y가 곧 발 위치다. 위쪽 띠에 놓인 소품의 머리(y - h×2)가 음수면 아레나 밖 HUD를
// 침범한다 — 목록의 h가 실제 png 높이와 어긋나면 여기서 걸린다.
// tileCount는 시트 장수(사막·묘지 4×4=16, 마왕성 5×4에 17).
const WANG_STAGES: { ep: number; key: string; defs: PropDef[]; tileCount: number }[] = [
  { ep: 1, key: 'desert-tiles', defs: DESERT_OBJECTS, tileCount: 16 },
  { ep: 2, key: 'graveyard-tiles', defs: GRAVEYARD_OBJECTS, tileCount: 16 },
  { ep: 3, key: 'castle-tiles', defs: CASTLE_OBJECTS, tileCount: 17 },
];

for (const { ep, key, defs, tileCount } of WANG_STAGES) {
  const { ground, props, objects, tiles } = buildArenaMap(ep);
  assert.strictEqual(tiles.key, key);
  assert.strictEqual(tiles.spacing, 0);
  assert.strictEqual(ground.length, MAP_H);
  for (const row of ground) {
    assert.strictEqual(row.length, MAP_W);
    for (const t of row) assert.ok(t >= 0 && t < tileCount, `ep${ep} 타일 범위 이탈: ${t}`);
  }

  assert.ok(objects.length > 0, `ep${ep} 소품이 하나도 안 깔렸다`);
  const H = new Map(defs.map((o) => [o.key, o.h]));
  for (const o of objects) {
    const h = H.get(o.key);
    assert.ok(h !== undefined, `ep${ep} 모르는 소품 키: ${o.key}`);
    assert.ok(o.x >= 0 && o.x <= ARENA.w, `ep${ep} 소품 x 이탈: ${o.x}`);
    assert.ok(o.y <= ARENA.h, `ep${ep} 소품이 아레나 아래로 내려갔다: ${o.y}`);
    assert.ok(o.y - h! * 2 >= 0, `ep${ep} 소품 머리가 아레나 위로 삐져나왔다: ${o.key} y=${o.y}`);
  }
}

// 사막·묘지는 타일 소품을 안 쓴다 (낱장 이미지로 얹는다)
for (const ep of [1, 2]) {
  const { props, propTiles } = buildArenaMap(ep);
  assert.ok(
    props.every((row) => row.every((t) => t === -1)),
    `ep${ep} 타일 소품 사용`,
  );
  assert.strictEqual(propTiles, undefined, `ep${ep}은 소품 시트를 따로 안 쓴다`);
}

// ── 마왕성(3화): 소품 레이어는 카펫 전용이다 ──
{
  const { props, propTiles, objects } = buildArenaMap(3);
  assert.strictEqual(propTiles!.key, 'castle-carpet-tiles');
  // 카펫은 아레나 세로 한가운데 띠에만 깔린다 — 위아래는 바닥이 그대로 비쳐야 한다.
  props.forEach((row, y) => {
    const laid = row.filter((t) => t !== -1).length;
    if (y >= 5 && y <= 11) assert.strictEqual(laid, MAP_W, `카펫이 끊겼다 y=${y}`);
    else assert.strictEqual(laid, 0, `카펫이 띠를 벗어났다 y=${y}`);
    for (const t of row) assert.ok(t === -1 || (t >= 0 && t < 17), `카펫 타일 범위 이탈: ${t}`);
  });
  // 옥좌·간판은 카펫 오른쪽 끝에 고정 — 흩뿌린 소품과 달리 시드가 바뀌어도 안 움직인다.
  const throne = objects.find((o) => o.key === 'gilded-throne')!;
  assert.ok(throne.x > ARENA.w - 100, `옥좌가 카펫 끝에 없다: ${throne.x}`);
  assert.ok(
    objects.every((o) => o.atlas === 'props-throne-room'),
    '마왕성 소품은 전부 아틀라스 프레임이다',
  );
}

// 소품 키는 화별로 안 겹친다 — 겹치면 BootScene이 한 키를 두 파일로 로드해 한쪽이 덮인다.
{
  const keys = [...DESERT_OBJECTS, ...GRAVEYARD_OBJECTS].map((o) => o.key);
  assert.strictEqual(new Set(keys).size, keys.length, '소품 키 중복');
  assert.strictEqual(new Set(CASTLE_OBJECTS.map((o) => o.key)).size, CASTLE_OBJECTS.length, '마왕성 프레임 중복');
}

// 광산은 낱장 소품을 안 쓴다
assert.deepStrictEqual(buildArenaMap(4).objects, []);

// ── 같은 화는 같은 맵, 다른 화는 다른 맵 ──
const j = (ep: number) => JSON.stringify(buildArenaMap(ep));
assert.strictEqual(j(2), j(2));
assert.notStrictEqual(j(1), j(2));
assert.notStrictEqual(j(2), j(3));

console.log('arenaMap ok');
