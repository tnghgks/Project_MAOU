// 캔버스·아레나 지오메트리 (GDD 5-1). 좌표계는 1280x720 기준.
// 채팅이 React 채팅 컬럼(캔버스 밖)으로 빠지면서 아레나가 캔버스 전폭을 쓴다.
export const CANVAS = { W: 1280, H: 720 } as const;
export const ARENA = { x: 0, y: 40, w: 1280, h: 520 } as const;
export const SUMMON_Y = 560; // 소환 바
export const CX = ARENA.x + ARENA.w / 2; // 용사 스폰 · 무적 시 복귀 지점

// 소환/이동이 아레나 안쪽 20px 여백에 머물도록 하는 공용 경계 (스킬·시뮬이 공유)
export const arenaBounds = {
  minX: ARENA.x + 20,
  maxX: ARENA.x + ARENA.w - 20,
  minY: ARENA.y + 20,
  maxY: SUMMON_Y - 20,
} as const;
