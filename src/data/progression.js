// GDD 6장 진행 구조. 1-based (index 0 미사용). 최종화(6)는 별도.
export const EPISODES = [
  null,
  { ep: 1, targetViewers: 300, recHp: 100 },
  { ep: 2, targetViewers: 1200, recHp: 260 },
  { ep: 3, targetViewers: 4000, recHp: 420 },
  { ep: 4, targetViewers: 12000, recHp: 620 },
  { ep: 5, targetViewers: 35000, recHp: 900 },
];
export const FINAL_EP = 6;
export const HERO_TARGET_HP = 900; // GDD 3-6 최종화 목표 HP — 엔딩 판정 기준선
