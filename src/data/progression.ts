// GDD 6장 진행 구조. 승리 조건 = targetDonation 누적 달성 (시간 제한 없음).
export interface EpisodeDef {
  targetDonation: number;
  targetViewers: number;
  recHp: number;
}

export const FINAL_EP = 6;

export const EPISODES: Record<number, EpisodeDef> = {
  1: { targetDonation: 3_000, targetViewers: 300, recHp: 100 },
  2: { targetDonation: 12_000, targetViewers: 1200, recHp: 260 },
  3: { targetDonation: 40_000, targetViewers: 4000, recHp: 420 },
  4: { targetDonation: 120_000, targetViewers: 12000, recHp: 620 },
  5: { targetDonation: 350_000, targetViewers: 35000, recHp: 900 },
  6: { targetDonation: 120_000, targetViewers: 50000, recHp: 900 }, // 최종화 — 축약 스테이지
};

export const targetDonation = (ep: number) => (EPISODES[ep] ?? EPISODES[FINAL_EP]).targetDonation;

export const HERO_TARGET_HP = 900; // GDD 3-6 최종화 목표 HP — 엔딩 판정 기준선
