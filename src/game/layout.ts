// 캔버스·아레나 지오메트리 (GDD 5-1). 좌표계는 세로 720 고정, 가로만 창 비율을 따라간다.
// 16:9보다 넓은 창에서 좌우 레터박스(검은 여백) 대신 아레나가 그만큼 넓어진다 —
// 세로 상수(40 / 544 / 584)는 그대로 살아있고 픽셀 비율도 1:1이라 왜곡이 없다.
// 폭은 로드 시점에 한 번만 정한다. ponytail: 창을 리사이즈하면 Phaser FIT이 축소로 흡수 —
// 다시 꽉 채우려면 새로고침. 실시간 대응은 타일맵 재생성까지 끌고 오므로 안 한다.
const CHROME_H = 140; // styles.css --chrome-h (상단바 + 방송정보) — 캔버스가 못 쓰는 세로
const TILE = 32; // 배경 타일 16px × scale 2. 폭은 이 배수여야 타일맵이 딱 떨어진다
const MIN_W = 1280; // 16:9. 좁은 창은 기존대로 레터박스
const MAX_W = 2560;
function fitWidth(): number {
  if (typeof window === 'undefined') return MIN_W; // node 테스트
  const h = Math.max(1, window.innerHeight - CHROME_H);
  const w = Math.round((720 * window.innerWidth) / h / TILE) * TILE;
  return Math.min(MAX_W, Math.max(MIN_W, w));
}

export const CANVAS = { W: fitWidth(), H: 720 } as const;
export const TILE_PX = TILE;
// 세로 배치: HUD 0~40 · 아레나 40~584 · 소환 카드 바 584~720.
// 리듬 레인은 별도 층을 쓰지 않고 소환 바를 그대로 덮는다 — 리액션 중엔 전투가 멈춰 카드를 못 쓴다.
// ARENA.h는 타일(32px) 배수여야 배경 타일맵이 딱 떨어진다: 544 = 17칸.
export const ARENA = { x: 0, y: 40, w: CANVAS.W, h: 544 } as const;
export const SUMMON_Y = ARENA.y + ARENA.h; // 소환 카드 바 상단 = 아레나 하단
export const CX = ARENA.x + ARENA.w / 2; // 용사 스폰 · 무적 시 복귀 지점

// 소환/이동이 아레나 안쪽 여백에 머물도록 하는 공용 경계 (스킬·시뮬이 공유).
// 배경 타일맵 벽이 사방 32px(16px 타일 ×2)이라 그 안쪽으로 물린다.
const WALL = 36;
export const arenaBounds = {
  minX: ARENA.x + WALL,
  maxX: ARENA.x + ARENA.w - WALL,
  minY: ARENA.y + WALL,
  maxY: SUMMON_Y - WALL,
} as const;
