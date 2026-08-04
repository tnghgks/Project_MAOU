// 아레나 배경 타일맵을 에피소드 시드로 절차 생성한다.
// 16×16 타일을 scale 2로 깔아 ARENA에 정확히 맞춘다 — 가로 칸 수는 캔버스 폭을 따라간다.
// 테마는 화별로 갈린다: 1화 = 사막(desert-tiles.png), 나머지 = 광산(tilemap.png).
// ponytail: Phaser를 import하지 않는다 — node 테스트가 window 없이 이 모듈을 돌려야 한다
// (layout도 window 없으면 기본 폭으로 떨어진다).
import { ARENA, TILE_PX } from './layout.ts';

export const MAP_W = ARENA.w / TILE_PX;
export const MAP_H = ARENA.h / TILE_PX;

// BootScene이 로드한 텍스처 키와 시트의 타일 간격. addTilesetImage에 그대로 넘어간다.
export type ArenaTiles = { key: string; spacing: number };
const MINE_TILES: ArenaTiles = { key: 'tiles', spacing: 1 };
const DESERT_TILES: ArenaTiles = { key: 'desert-tiles', spacing: 0 };

// 타일이 아니라 낱장 이미지로 얹는 소품. 좌표는 ARENA 좌상단 기준 px, 원점은 밑변 중앙(바닥에 세운다).
export type ArenaObject = { key: string; x: number; y: number };

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

// 같은 에피소드는 항상 같은 맵 — 방송을 다시 봐도 무대가 유지된다.
export function buildArenaMap(episode: number): ArenaMap {
  return episode === 1 ? buildDesertMap(episode) : buildMineMap(episode);
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
// desert-tiles.png = pixellab이 뽑은 황토↔모래 코너 wang 셋(4×4, 16px, spacing 0).
// 코너 마스크(TL + TR×2 + BL×4 + BR×8, 비트 1 = 모래) → 시트 안에서의 타일 번호.
const WANG = [6, 5, 2, 3, 10, 1, 4, 13, 7, 14, 11, 0, 9, 8, 15, 12];

// pixellab export의 지형 id.
const OCHRE = 1; // 갈라진 황토 바닥
const SAND = 2; // 잔물결 이는 고운 모래

// 사막 소품 — public/assets/desert/<key>.png. h는 원본 픽셀 높이(타일과 같이 scale 2로 그려진다).
// 배치가 높이를 알아야 위쪽 띠에 놓인 소품이 아레나 밖(HUD)으로 안 삐져나온다.
export const DESERT_OBJECTS: { key: string; h: number }[] = [
  { key: 'desert-shrub-1', h: 68 },
  { key: 'desert-shrub-2', h: 43 },
  { key: 'desert-shrub-3', h: 35 },
  { key: 'desert-skull-1', h: 42 },
  { key: 'desert-skull-2', h: 36 },
  { key: 'desert-pot', h: 15 },
];

function buildDesertMap(episode: number): ArenaMap {
  const rng = seeded(episode * 2654435761);

  // 타일이 아니라 코너 격자를 칠한다 — wang 셋은 타일 네 귀퉁이의 지형 조합으로 그림을 고른다.
  const corner = Array.from({ length: MAP_H + 1 }, () => Array(MAP_W + 1).fill(SAND) as number[]);
  const blob = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = 0; y <= MAP_H; y++)
      for (let x = 0; x <= MAP_W; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) corner[y][x] = OCHRE;
  };

  // 황토 웅덩이. 아레나 폭이 창 비율을 따라 40~80칸으로 변하므로 개수도 폭을 따라간다.
  // 가로로는 균등하게 나눠 깐다 — 완전 랜덤이면 한 덩어리로 뭉쳐 가운데만 뒤덮는다.
  const n = Math.round(MAP_W / 14);
  for (let i = 0; i < n; i++)
    blob(
      Math.round(((i + 0.5) * MAP_W) / n) + rng.between(-3, 3),
      rng.between(3, MAP_H - 3),
      rng.between(4, 7),
      rng.between(2, 4),
    );

  const ground = Array.from({ length: MAP_H }, (_, y) =>
    Array.from({ length: MAP_W }, (_, x) => {
      const c = [corner[y][x], corner[y][x + 1], corner[y + 1][x], corner[y + 1][x + 1]];
      return WANG[c.reduce((m, t, i) => m | (t === SAND ? 1 << i : 0), 0)];
    }),
  );

  // 소품은 위/아래 가장자리 띠(BAND)에만 세운다 — 난전이 벌어지는 중앙을 비워 캐릭터를 안 가린다.
  // 가로는 웅덩이와 같이 균등 분할 + 지터. 소품 원점이 밑변이라 y는 발이 닿는 지점이다.
  const BAND = 48;
  const objects: ArenaObject[] = [];
  const count = Math.round(MAP_W / 6);
  const shift = rng.between(0, DESERT_OBJECTS.length - 1);
  for (let i = 0; i < count; i++) {
    // 종류는 돌려쓴다 — 매번 뽑으면 같은 덤불만 서너 개 서는 판이 나온다.
    const o = DESERT_OBJECTS[(i + shift) % DESERT_OBJECTS.length];
    objects.push({
      key: o.key,
      x: Math.min(ARENA.w, Math.max(0, Math.round(((i + 0.5) * ARENA.w) / count) + rng.between(-24, 24))),
      // 위쪽 띠는 스프라이트 높이(×2)만큼 내려야 머리가 아레나 밖 HUD로 안 삐져나온다.
      y: rng.pick([o.h * 2 + rng.between(0, BAND), ARENA.h - rng.between(0, BAND)]),
    });
  }

  // ponytail: 소품은 순수 장식이다 — 충돌·엄폐 없음. 필요해지면 battleSim에 장애물로 넘긴다.
  return { ground, props: blank(), objects, tiles: DESERT_TILES };
}

const blank = () => Array.from({ length: MAP_H }, () => Array(MAP_W).fill(-1) as number[]);
