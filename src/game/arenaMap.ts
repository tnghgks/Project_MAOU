// 아레나 배경 타일맵을 에피소드 시드로 절차 생성한다.
// 16×16 타일을 scale 2로 깔아 ARENA에 정확히 맞춘다 — 가로 칸 수는 캔버스 폭을 따라간다.
// 테마는 화별로 갈린다: 1화 = 사막(desert-tiles.png), 2화 = 묘지(graveyard-tiles.png),
// 3화 = 마왕성(castle-tiles.png), 나머지 = 광산(tilemap.png).
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
const CASTLE_TILES: ArenaTiles = { key: 'castle-tiles', spacing: 0 };
const CASTLE_CARPET_TILES: ArenaTiles = { key: 'castle-carpet-tiles', spacing: 0 };

// 타일이 아니라 낱장 이미지로 얹는 소품. 좌표는 ARENA 좌상단 기준 px, 원점은 밑변 중앙(바닥에 세운다).
// atlas가 있으면 key는 그 아틀라스 안의 프레임 이름이다 (마왕성 소품은 한 장으로 묶여 온다).
export type ArenaObject = { key: string; x: number; y: number; atlas?: string };

// 소품 원본 목록의 한 항목. h는 원본 픽셀 높이(타일과 같이 scale 2로 그려진다) —
// 배치가 높이를 알아야 위쪽 띠에 놓인 소품이 아레나 밖(HUD)으로 안 삐져나온다.
export type PropDef = { key: string; h: number };

// propTiles는 소품 레이어가 바닥과 다른 시트를 쓸 때만 온다 (마왕성 카펫).
export type ArenaMap = {
  ground: number[][];
  props: number[][];
  objects: ArenaObject[];
  tiles: ArenaTiles;
  propTiles?: ArenaTiles;
};

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
  if (episode === 3) return buildCastleMap(episode);
  return buildMineMap(episode);
}

// ── 코너 wang 공용 (사막·묘지·마왕성) ────────────────────────────────────────
// 전부 pixellab이 뽑은 코너 wang 셋(16px, spacing 0)을 쓴다. 타일이 아니라 코너 격자를 칠한다 —
// wang 셋은 타일 네 귀퉁이의 지형 조합으로 그림을 고른다.
// 코너 마스크(TL + TR×2 + BL×4 + BR×8, 비트 1 = 시트의 상위 지형) → 시트 안에서의 타일 번호.
// 시트마다 타일 순서가 다르므로 테이블도 시트마다 하나씩 둔다.
const WANG = [6, 5, 2, 3, 10, 1, 4, 13, 7, 14, 11, 0, 9, 8, 15, 12]; // 4×4 16장 (사막·묘지)
// 마왕성 시트는 5×4에 17장이 담겨 있다 (16번 = 전부 상위 지형, 15번은 6번과 같은 그림).
const CASTLE_WANG = [6, 9, 8, 1, 4, 5, 13, 0, 3, 14, 7, 2, 11, 10, 12, 16];

// 웅덩이 knob: 반지름 범위(칸)와 몇 칸당 하나를 찍을지.
type Blobs = { rx: [number, number]; ry: [number, number]; per: number };

// 바탕 지형을 깔고 그 위에 반대쪽 지형 웅덩이를 찍는다. blobIsUpper = 웅덩이가 시트의 상위 지형인지
// (사막은 황토=하위 웅덩이, 묘지는 이끼=상위 웅덩이). 바탕은 언제나 그 반대쪽.
// 아레나 폭이 창 비율을 따라 40~80칸으로 변하므로 개수도 폭을 따라간다. 가로로는 균등하게
// 나눠 깐다 — 완전 랜덤이면 한 덩어리로 뭉쳐 가운데만 뒤덮는다.
function wangGround(rng: Rng, blobIsUpper: boolean, { rx, ry, per }: Blobs, wang = WANG): number[][] {
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

  return cornersToTiles(corner, wang);
}

// 코너 격자(MAP_H+1 × MAP_W+1) → 타일 격자. 타일 하나는 자기 네 귀퉁이 코너를 본다.
function cornersToTiles(corner: boolean[][], wang: number[]): number[][] {
  return Array.from({ length: MAP_H }, (_, y) =>
    Array.from({ length: MAP_W }, (_, x) => {
      const c = [corner[y][x], corner[y][x + 1], corner[y + 1][x], corner[y + 1][x + 1]];
      return wang[c.reduce((m, up, i) => m | (up ? 1 << i : 0), 0)];
    }),
  );
}

// 소품은 위/아래 가장자리 띠(BAND)에만 세운다 — 난전이 벌어지는 중앙을 비워 캐릭터를 안 가린다.
// 가로는 웅덩이와 같이 균등 분할 + 지터. 소품 원점이 밑변이라 y는 발이 닿는 지점이다.
const BAND = 48;

function scatterProps(rng: Rng, defs: PropDef[], per: number, atlas?: string): ArenaObject[] {
  const objects: ArenaObject[] = [];
  const count = Math.round(MAP_W / per);
  const shift = rng.between(0, defs.length - 1);
  for (let i = 0; i < count; i++) {
    // 종류는 돌려쓴다 — 매번 뽑으면 같은 덤불만 서너 개 서는 판이 나온다.
    const o = defs[(i + shift) % defs.length];
    objects.push({
      key: o.key,
      atlas,
      x: Math.min(ARENA.w, Math.max(0, Math.round(((i + 0.5) * ARENA.w) / count) + rng.between(-24, 24))),
      // 위쪽 띠는 스프라이트 높이(×2)만큼 내려야 머리가 아레나 밖 HUD로 안 삐져나온다.
      y: rng.pick([o.h * 2 + rng.between(0, BAND), ARENA.h - rng.between(0, BAND)]),
    });
  }
  return objects;
}

// ── 광산 (4화~) ──────────────────────────────────────────────────────────────
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

// ── 마왕성 옥좌의 방 (3화 · 최종화) ──────────────────────────────────────────
// 바닥은 castle-tiles.png = 흑요석 판석(하위)↔금 간 판석·잔해(상위) wang 셋. 잔해가 웅덩이로
// 번진다 — 두 지형이 같은 판석이라 얼룩이 아니라 "여기저기 깨진 바닥"으로 보인다.
// 그 위에 castle-carpet-tiles.png(붉은 카펫↔같은 판석)로 카펫을 한 줄 깐다. 시트가 둘이므로
// 카펫은 바닥이 아니라 소품 레이어에 올린다 (propTiles).
export const CASTLE_ATLAS = 'props-throne-room'; // public/assets/castle/props-throne-room.{png,json}

// 카펫이 덮는 코너 격자 행. 타일 5~11행(= 아레나 세로 160~384px)이 카펫이 되고 위아래 한 줄씩이
// 금박 테두리로 마감된다. ponytail: 카펫 폭 knob
const CARPET_ROWS: [number, number] = [6, 11];

// 옥좌는 카펫 오른쪽 끝에, ON AIR 간판은 그 뒤에 고정한다 — 무대가 어디를 향하는지 한눈에 보인다.
// 나머지는 위·아래 띠에 흩뿌린다. h는 아틀라스 json의 원본 프레임 높이.
const CASTLE_FIXED: PropDef[] = [
  { key: 'gilded-throne', h: 59 },
  { key: 'onair-sign', h: 38 },
];

// 흩뿌리는 소품. key = 아틀라스 프레임 이름. 순서는 묘지와 같은 이유로 종류를 섞어 둔다 —
// 좁은 창에선 앞쪽 8칸만 쓰이므로 금덩이만 늘어선 판이 나오면 안 된다.
export const CASTLE_OBJECTS: PropDef[] = [
  ...CASTLE_FIXED,
  { key: 'treasure-chest', h: 70 },
  { key: 'onair-sign-alt', h: 38 },
  { key: 'marble-pillar', h: 49 },
  { key: 'coin-mound', h: 38 },
  { key: 'banquet-table', h: 40 },
  { key: 'statue-plinth', h: 66 },
  { key: 'potted-plant', h: 38 },
  { key: 'trophy-stack', h: 68 },
  { key: 'fan-letters', h: 42 },
  { key: 'wine-rack', h: 63 },
  { key: 'gold-ingots', h: 30 },
  { key: 'framed-portrait', h: 56 },
  { key: 'armchair', h: 47 },
  { key: 'camera-tripod', h: 68 },
  { key: 'coins-scattered', h: 21 },
  { key: 'folding-screen', h: 58 },
  { key: 'crown-cushion', h: 31 },
  { key: 'display-cabinet', h: 63 },
  { key: 'coin-pouch', h: 27 },
  { key: 'purple-banner', h: 53 },
  { key: 'side-table', h: 34 },
  { key: 'certificate-easel', h: 69 },
  { key: 'gold-rug', h: 39 },
  { key: 'trophy-pedestal', h: 66 },
  { key: 'coin-pile-small', h: 28 },
  { key: 'banquet-table-alt', h: 40 },
  { key: 'milestone-plaque', h: 47 },
  { key: 'vault-door', h: 68 },
  { key: 'gold-ingots-stack', h: 33 },
  { key: 'stained-glass-panel', h: 34 },
  { key: 'coin-mound-large', h: 50 },
];

// 카펫 한 줄. 코너 격자를 CARPET_ROWS 밖은 판석(상위), 안쪽은 카펫(하위)으로 칠한다.
// 전부 판석인 칸은 -1로 비워 바닥 레이어가 그대로 비치게 한다 — 두 시트의 판석이 미세하게
// 달라서, 겹칠 필요가 없는 칸까지 덮으면 카펫 주변만 색이 뜬다.
function carpetRunner(): number[][] {
  const corner = Array.from(
    { length: MAP_H + 1 },
    (_, y) => Array(MAP_W + 1).fill(y < CARPET_ROWS[0] || y > CARPET_ROWS[1]) as boolean[],
  );
  const allStone = CASTLE_WANG[15];
  return cornersToTiles(corner, CASTLE_WANG).map((row) => row.map((t) => (t === allStone ? -1 : t)));
}

function buildCastleMap(episode: number): ArenaMap {
  const rng = seeded(episode * 2654435761);
  const carpetY = ARENA.h / 2;
  return {
    ground: wangGround(rng, true, { rx: [3, 7], ry: [2, 4], per: 13 }, CASTLE_WANG),
    props: carpetRunner(),
    objects: [
      // 실내라 바깥 스테이지보다 촘촘하게 — 빈 돌바닥이 넓으면 방이 아니라 마당으로 보인다.
      // 오른쪽 끝은 비운다: 맵이 시드로 고정이라 옥좌·간판과 한 번 겹치면 매 방송 겹친 채로 나온다.
      ...scatterProps(rng, CASTLE_OBJECTS.slice(CASTLE_FIXED.length), 4, CASTLE_ATLAS).filter(
        (o) => o.x < ARENA.w - 160,
      ),
      { key: 'gilded-throne', atlas: CASTLE_ATLAS, x: ARENA.w - 80, y: carpetY + 48 },
      { key: 'onair-sign', atlas: CASTLE_ATLAS, x: ARENA.w - 80, y: carpetY - 130 },
    ],
    tiles: CASTLE_TILES,
    propTiles: CASTLE_CARPET_TILES,
  };
}

const blank = () => Array.from({ length: MAP_H }, () => Array(MAP_W).fill(-1) as number[]);
