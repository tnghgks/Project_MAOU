// 아레나 배경 타일맵을 에피소드 시드로 절차 생성한다.
// 16×16 타일을 scale 2로 깔아 ARENA에 정확히 맞춘다 — 가로 칸 수는 캔버스 폭을 따라간다.
// 테마는 화별로 갈린다: 1화 = 사막(desert-tiles.png), 2화 = 묘지(graveyard-tiles.png),
// 나머지 = 광산(tilemap.png).
// ponytail: Phaser를 import하지 않는다 — node 테스트가 window 없이 이 모듈을 돌려야 한다
// (layout도 window 없으면 기본 폭으로 떨어진다).
import { ARENA, TILE_PX } from './layout.ts';

export const MAP_W = ARENA.w / TILE_PX;
export const MAP_H = ARENA.h / TILE_PX;

// BootScene이 로드한 텍스처 키와 시트의 타일 간격. addTilesetImage에 그대로 넘어간다.
export type ArenaTiles = { key: string; spacing: number };
const MINE_TILES: ArenaTiles = { key: 'tiles', spacing: 1 };
const DESERT_TILES: ArenaTiles = { key: 'desert-tiles', spacing: 0 };
const GRAVEYARD_TILES: ArenaTiles = { key: 'graveyard-tiles', spacing: 0 };

// 타일이 아니라 낱장 이미지로 얹는 소품. 좌표는 ARENA 좌상단 기준 px, 원점은 밑변 중앙(바닥에 세운다).
export type ArenaObject = { key: string; x: number; y: number };

// 소품 원본 목록의 한 항목. h는 원본 픽셀 높이(타일과 같이 scale 2로 그려진다) —
// 배치가 높이를 알아야 위쪽 띠에 놓인 소품이 아레나 밖(HUD)으로 안 삐져나온다.
export type PropDef = { key: string; h: number };

export type ArenaMap = { ground: number[][]; props: number[][]; objects: ArenaObject[]; tiles: ArenaTiles };

// mulberry32 — 시드 하나로 재현 가능한 난수. 맵 배치 외엔 쓰지 않는다.
function seeded(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    between: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(arr: T[]) => arr[Math.floor(next() * arr.length)],
  };
}

type Rng = ReturnType<typeof seeded>;

// 같은 에피소드는 항상 같은 맵 — 방송을 다시 봐도 무대가 유지된다.
export function buildArenaMap(episode: number): ArenaMap {
  if (episode === 1) return buildDesertMap(episode);
  if (episode === 2) return buildGraveyardMap(episode);
  return buildMineMap(episode);
}

// ── 코너 wang 공용 (사막·묘지) ───────────────────────────────────────────────
// 두 스테이지 다 pixellab이 뽑은 4×4 코너 wang 셋(16px, spacing 0)을 쓴다. 타일이 아니라
// 코너 격자를 칠한다 — wang 셋은 타일 네 귀퉁이의 지형 조합으로 그림을 고른다.
// 코너 마스크(TL + TR×2 + BL×4 + BR×8, 비트 1 = 시트의 상위 지형) → 시트 안에서의 타일 번호.
const WANG = [6, 5, 2, 3, 10, 1, 4, 13, 7, 14, 11, 0, 9, 8, 15, 12];

// 웅덩이 knob: 반지름 범위(칸)와 몇 칸당 하나를 찍을지.
type Blobs = { rx: [number, number]; ry: [number, number]; per: number };

// 바탕 지형을 깔고 그 위에 반대쪽 지형 웅덩이를 찍는다. blobIsUpper = 웅덩이가 시트의 상위 지형인지
// (사막은 황토=하위 웅덩이, 묘지는 이끼=상위 웅덩이). 바탕은 언제나 그 반대쪽.
// 아레나 폭이 창 비율을 따라 40~80칸으로 변하므로 개수도 폭을 따라간다. 가로로는 균등하게
// 나눠 깐다 — 완전 랜덤이면 한 덩어리로 뭉쳐 가운데만 뒤덮는다.
function wangGround(rng: Rng, blobIsUpper: boolean, { rx, ry, per }: Blobs): number[][] {
  const corner = Array.from({ length: MAP_H + 1 }, () => Array(MAP_W + 1).fill(!blobIsUpper) as boolean[]);

  const n = Math.round(MAP_W / per);
  for (let i = 0; i < n; i++) {
    const cx = Math.round(((i + 0.5) * MAP_W) / n) + rng.between(-3, 3);
    const cy = rng.between(3, MAP_H - 3);
    const ex = rng.between(rx[0], rx[1]);
    const ey = rng.between(ry[0], ry[1]);
    for (let y = 0; y <= MAP_H; y++)
      for (let x = 0; x <= MAP_W; x++) if (((x - cx) / ex) ** 2 + ((y - cy) / ey) ** 2 <= 1) corner[y][x] = blobIsUpper;
  }

  return Array.from({ length: MAP_H }, (_, y) =>
    Array.from({ length: MAP_W }, (_, x) => {
      const c = [corner[y][x], corner[y][x + 1], corner[y + 1][x], corner[y + 1][x + 1]];
      return WANG[c.reduce((m, up, i) => m | (up ? 1 << i : 0), 0)];
    }),
  );
}

// 소품은 위/아래 가장자리 띠(BAND)에만 세운다 — 난전이 벌어지는 중앙을 비워 캐릭터를 안 가린다.
// 가로는 웅덩이와 같이 균등 분할 + 지터. 소품 원점이 밑변이라 y는 발이 닿는 지점이다.
const BAND = 48;

function scatterProps(rng: Rng, defs: PropDef[], per: number): ArenaObject[] {
  const objects: ArenaObject[] = [];
  const count = Math.round(MAP_W / per);
  const shift = rng.between(0, defs.length - 1);
  for (let i = 0; i < count; i++) {
    // 종류는 돌려쓴다 — 매번 뽑으면 같은 덤불만 서너 개 서는 판이 나온다.
    const o = defs[(i + shift) % defs.length];
    objects.push({
      key: o.key,
      x: Math.min(ARENA.w, Math.max(0, Math.round(((i + 0.5) * ARENA.w) / count) + rng.between(-24, 24))),
      // 위쪽 띠는 스프라이트 높이(×2)만큼 내려야 머리가 아레나 밖 HUD로 안 삐져나온다.
      y: rng.pick([o.h * 2 + rng.between(0, BAND), ARENA.h - rng.between(0, BAND)]),
    });
  }
  return objects;
}

// ── 광산 (2화~) ──────────────────────────────────────────────────────────────
// 타일 인덱스는 assets/Tilemap/tilemap.png(12열) 기준 0-based. 빈 칸은 -1.
// 벽 9-slice + 바닥
const T = {
  topL: 1,
  top: 2,
  topR: 3, // 벽 상단 윤곽
  left: 13,
  right: 15, // 좌우 벽
  face: 40, // 벽 정면 브릭
  edge: 50, // 벽 밑 바닥 경계
  botL: 25,
  bot: 26,
  botR: 27, // 벽 하단 마감
  floor: 48,
  vein: 42, // 바닥에 박힌 금광맥
};

const PROPS = [54, 66, 64, 120]; // 광차 · 배럴 · 크리스탈 · 불광석

function buildMineMap(episode: number): ArenaMap {
  const rng = seeded(episode * 2654435761);

  const ground = Array.from({ length: MAP_H }, (_, y) =>
    Array.from({ length: MAP_W }, (_, x) => {
      if (y === 0) return x === 0 ? T.topL : x === MAP_W - 1 ? T.topR : T.top;
      if (y === MAP_H - 1) return x === 0 ? T.botL : x === MAP_W - 1 ? T.botR : T.bot;
      if (x === 0) return T.left;
      if (x === MAP_W - 1) return T.right;
      if (y === 1) return T.face;
      if (y === 2) return T.edge;
      return T.floor;
    }),
  );

  // 광맥은 바닥 안쪽에만 — 벽·경계행을 덮지 않는다.
  for (let i = 0; i < rng.between(5, 9); i++) {
    ground[rng.between(3, MAP_H - 2)][rng.between(1, MAP_W - 2)] = T.vein;
  }

  // 소품은 벽에 붙은 두 줄에만 깔아 전투가 벌어지는 중앙을 비워둔다.
  const props = blank();
  for (let i = 0; i < rng.between(6, 11); i++) {
    const y = rng.pick([3, MAP_H - 3]);
    props[y][rng.between(2, MAP_W - 3)] = rng.pick(PROPS);
  }

  return { ground, props, objects: [], tiles: MINE_TILES };
}

// ── 사막 (1화) ───────────────────────────────────────────────────────────────
// desert-tiles.png = 황토(하위)↔모래(상위) wang 셋. 바탕이 모래고 황토가 웅덩이로 번진다.
// 사막 소품 — public/assets/desert/<key>.png.
export const DESERT_OBJECTS: PropDef[] = [
  { key: 'desert-shrub-1', h: 68 },
  { key: 'desert-shrub-2', h: 43 },
  { key: 'desert-shrub-3', h: 35 },
  { key: 'desert-skull-1', h: 42 },
  { key: 'desert-skull-2', h: 36 },
  { key: 'desert-pot', h: 15 },
];

function buildDesertMap(episode: number): ArenaMap {
  const rng = seeded(episode * 2654435761);
  // ponytail: 소품은 순수 장식이다 — 충돌·엄폐 없음. 필요해지면 battleSim에 장애물로 넘긴다.
  return {
    ground: wangGround(rng, false, { rx: [4, 7], ry: [2, 4], per: 14 }),
    props: blank(),
    objects: scatterProps(rng, DESERT_OBJECTS, 6),
    tiles: DESERT_TILES,
  };
}

// ── 묘지 (2화) ───────────────────────────────────────────────────────────────
// graveyard-tiles.png = 축축한 흙(하위)↔이끼 낀 화강암(상위) wang 셋. 사막과 반대로 흙이 바탕이고
// 이끼가 웅덩이로 번진다 — 사막의 넓은 모래벌판보다 좁고 자잘한 얼룩이라 반지름을 줄였다.
// 묘지 소품 — public/assets/graveyard/<key>.png.
// 순서는 종류를 섞어 둔다: 폭이 좁은 창에선 목록 앞쪽 8칸만 쓰이므로 알파벳순이면 뼈·십자가만
// 늘어선 판이 나온다 (scatterProps가 목록을 앞에서부터 돌려쓴다).
export const GRAVEYARD_OBJECTS: PropDef[] = [
  { key: 'graveyard-marker', h: 30 },
  { key: 'graveyard-leaves-1', h: 40 },
  { key: 'graveyard-headstone-1', h: 54 },
  { key: 'graveyard-bones-1', h: 21 },
  { key: 'graveyard-cross-1', h: 43 },
  { key: 'graveyard-tree-1', h: 87 },
  { key: 'graveyard-flagstone-1', h: 45 },
  { key: 'graveyard-skull-1', h: 60 },
  { key: 'graveyard-fence-1', h: 40 },
  { key: 'graveyard-leaves-2', h: 43 },
  { key: 'graveyard-headstone-2', h: 56 },
  { key: 'graveyard-pit', h: 53 },
  { key: 'graveyard-cross-2', h: 34 },
  { key: 'graveyard-tree-2', h: 76 },
  { key: 'graveyard-bones-2', h: 26 },
  { key: 'graveyard-tomb', h: 52 },
  { key: 'graveyard-leaves-3', h: 33 },
  { key: 'graveyard-cross-3', h: 39 },
  { key: 'graveyard-tree-3', h: 71 },
  { key: 'graveyard-skull-2', h: 38 },
  { key: 'graveyard-flagstone-2', h: 28 },
  { key: 'graveyard-fence-2', h: 31 },
];

function buildGraveyardMap(episode: number): ArenaMap {
  const rng = seeded(episode * 2654435761);
  return {
    ground: wangGround(rng, true, { rx: [3, 6], ry: [2, 3], per: 11 }),
    props: blank(),
    objects: scatterProps(rng, GRAVEYARD_OBJECTS, 5),
    tiles: GRAVEYARD_TILES,
  };
}

const blank = () => Array.from({ length: MAP_H }, () => Array(MAP_W).fill(-1) as number[]);
