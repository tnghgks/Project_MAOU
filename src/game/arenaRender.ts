import type Phaser from 'phaser';
import { buildArenaMap } from './arenaMap.ts';
import { ARENA } from './layout.ts';

// 전투 아레나 배경을 씬에 깐다 — 타일맵 2겹(바닥·소품) + 낱장 소품.
// 배치 자체는 arenaMap이 에피소드 시드로 정하고, 여기서는 Phaser에 올리기만 한다.
// (던전 상점은 이 경로를 안 쓴다 — 늘 같은 방이라 그려진 배경 한 장이다: scenes/ShopScene.ts)
// ponytail: Phaser에 의존하므로 arenaMap과 파일을 나눈다 — arenaMap은 node 테스트가 window 없이 돌린다.
export function drawArena(scene: Phaser.Scene, episode: number) {
  // MAP_W×17 타일맵을 scale 2로 깔면 ARENA(세로 544)에 맞는다.
  // 쓸 타일셋(사막/묘지/마왕성/광산)도 화별로 arenaMap이 정해서 같이 넘겨준다.
  const { ground, props, objects, tiles: sheet, propTiles: propSheet } = buildArenaMap(episode);
  const map = scene.make.tilemap({ data: ground, tileWidth: 16, tileHeight: 16 });
  // 텍스처가 없으면 null이 온다. 그대로 진행하면 putTilesAt이 터져 씬이 통째로 죽는다 —
  // 배경은 없어도 게임은 굴러가니 건너뛴다.
  const tiles = map.addTilesetImage(sheet.key, sheet.key, 16, 16, 0, sheet.spacing);
  if (tiles) {
    map.createLayer(0, tiles, ARENA.x, ARENA.y)!.setScale(2).setDepth(-10);
    // 소품 레이어는 보통 바닥과 같은 시트를 쓰지만, 마왕성만 카펫 시트를 따로 얹는다.
    // 레이어마다 타일셋이 따로라 두 시트 다 인덱스 0부터 센다.
    const propTiles = propSheet
      ? map.addTilesetImage(propSheet.key, propSheet.key, 16, 16, 0, propSheet.spacing)
      : null;
    map
      .createBlankLayer('Props', propTiles ?? tiles, ARENA.x, ARENA.y)!
      .setScale(2)
      .setDepth(-9)
      .putTilesAt(props, 0, 0);
  } else {
    console.warn(`[arena] 타일셋 텍스처(${sheet.key})가 없어 배경을 건너뛴다 — 부트 에셋 로드를 확인`);
  }
  // 낱장 소품(사막·묘지·마왕성). 타일맵 위·엔티티 아래에 깔린다. 원점이 밑변이라 y가 곧 발이 닿는 지점.
  // 마왕성 소품은 아틀라스 한 장이라 텍스처는 atlas, 프레임이 key다.
  // 로드 실패한 텍스처는 건너뛴다 — 없는 키로 그리면 초록 상자가 배경에 박힌다.
  for (const o of objects)
    if (scene.textures.exists(o.atlas ?? o.key))
      scene.add
        .image(ARENA.x + o.x, ARENA.y + o.y, o.atlas ?? o.key, o.atlas ? o.key : undefined)
        .setOrigin(0.5, 1)
        .setScale(2)
        .setDepth(-9);
}
