import type { MonsterId } from './monsters.ts';

// GDD 6장 진행 구조. 승리 조건 2단계 (시간 제한 없음):
//   1) 몬스터 처치 골드 + 후원 골드가 targetGold 도달 → 보스 등장
//   2) 보스 격파 → 스테이지 클리어
export interface EpisodeDef {
  targetGold: number;
  boss: MonsterId;
}

export const FINAL_EP = 3;

// ponytail: 난이도 knob — 목표 골드와 보스는 여기만 만진다
export const EPISODES: Record<number, EpisodeDef> = {
  1: { targetGold: 1_000, boss: 'boss_golem' },
  2: { targetGold: 2_000, boss: 'boss_knight' },
  3: { targetGold: 3_000, boss: 'boss_maou' }, // 최종화 — 마왕이 직접 나선다
};

const episodeDef = (ep: number) => EPISODES[ep] ?? EPISODES[FINAL_EP];
export const targetGold = (ep: number) => episodeDef(ep).targetGold;
export const bossOf = (ep: number) => episodeDef(ep).boss;

export const HERO_TARGET_HP = 900; // GDD 3-6 최종화 목표 HP — 엔딩 판정 기준선
