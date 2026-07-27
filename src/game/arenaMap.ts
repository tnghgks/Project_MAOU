// 아레나 배경 타일맵을 에피소드 시드로 절차 생성한다.
// 16×16 타일을 scale 2로 깔아 ARENA에 정확히 맞춘다 — 가로 칸 수는 캔버스 폭을 따라간다.
// 타일 인덱스는 assets/Tilemap/tilemap.png(12열) 기준 0-based. 빈 칸은 -1.
// ponytail: Phaser를 import하지 않는다 — node 테스트가 window 없이 이 모듈을 돌려야 한다
// (layout도 window 없으면 기본 폭으로 떨어진다).
import { ARENA, TILE_PX } from './layout.ts';

export const MAP_W = ARENA.w / TILE_PX;
export const MAP_H = ARENA.h / TILE_PX;

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

export type ArenaMap = { ground: number[][]; props: number[][] };

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
  const props = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(-1) as number[]);
  for (let i = 0; i < rng.between(6, 11); i++) {
    const y = rng.pick([3, MAP_H - 3]);
    props[y][rng.between(2, MAP_W - 3)] = rng.pick(PROPS);
  }

  return { ground, props };
}
