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
// 목표 골드는 GDD 6장 "예상 획득 골드" 표를 따른다 (2026-07-28 하향 조정 — 해당 섹션은 GDD에도
// "검토 필요"로 표시돼 있어 추후 다시 바뀔 수 있다).
export const EPISODES: Record<number, EpisodeDef> = {
  1: { targetGold: 1_000, boss: 'boss_golem' },
  2: { targetGold: 3_000, boss: 'boss_knight' },
  3: { targetGold: 5_000, boss: 'boss_maou' }, // 최종화 — 마왕이 직접 나선다
};

const episodeDef = (ep: number) => EPISODES[ep] ?? EPISODES[FINAL_EP];
export const targetGold = (ep: number) => episodeDef(ep).targetGold;
export const bossOf = (ep: number) => episodeDef(ep).boss;

export const HERO_TARGET_HP = 900; // GDD 3-6 최종화 목표 HP — 엔딩 판정 기준선

export const START_VIEWERS = 12; // 1화 시작 시청자 수

// 스테이지 인계 시청자 수 하한 — 다음 화가 요구하는 목표 골드가 클수록 최소 시청자 규모도 같이
// 키운다. 안 그러면 어려운 스테이지일수록 도네이션 빈도·금액까지 낮은 채로 시작해 목표 달성이
// 갈수록 힘들어진다 (BattleScene은 이전 화 peakViewers÷2와 이 하한 중 큰 쪽을 시작값으로 쓴다).
export function stageViewerFloor(ep: number): number {
  return Math.round(START_VIEWERS * (targetGold(ep) / targetGold(1)));
}

// 시청자 상한 (피드백 2026-08-03): stepViewers가 이 값에 가까워질수록 상승률을 깎는 소프트캡으로 쓴다.
// "9만 명이 넘는 건 말이 안 된다" — 캡도 stageViewerFloor와 같은 스케일(targetGold 비)을 따라 화별로
// 커진다. 1화 5,000명 상한이면 500G짜리 강화도 못 살 만큼 적진 않되, 첫 방송이 억 단위로 튀진 않는다.
export const VIEWER_CAP_BASE = 5_000;
export function viewerCap(ep: number): number {
  return Math.round(VIEWER_CAP_BASE * (targetGold(ep) / targetGold(1)));
}
