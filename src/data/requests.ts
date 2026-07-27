import type { MonsterId } from './monsters.ts';

// 시청자 요청 — 방송 중 "지금 뭘 해야 하나"를 만드는 유일한 장치.
// 채팅으로 요구가 뜨고, 제한시간 안에 조건을 채우면 시청자가 몰리고 못 채우면 빠진다.
// 신규 요청 = 아래 REQUESTS에 한 줄.
//
// 전부 도달형(now >= need). 진행률 표시가 공짜로 나오고, 유지형("N초간 ~하지 마")은 아직 필요 없다.
export interface ReqCtx {
  count: (t: MonsterId) => number; // 살아있는 종류별 수
  total: number;
  hpRatio: number;
  killsSince: number; // 요청 시작 후 처치 수
}
export interface RequestDef {
  text: string; // 채팅에 뜨는 요구
  dur: number; // 제한시간(초)
  need: number;
  now(c: ReqCtx): number;
  needs?: MonsterId[]; // 이 몬스터가 해금돼야 출제
}

// ponytail: 요청 빈도·보상 knob
export const REQ_FIRST = 12; // 방송 시작 후 첫 요청까지
export const REQ_GAP = 22; // 요청 하나가 끝나고 다음까지
export const REQ_WIN = 1.35; // 성공 시 시청자 배율
export const REQ_LOSE = 0.85;

// prettier-ignore
export const REQUESTS: RequestDef[] = [
  { text: '슬라임 12마리 동시에 풀어봐 ㅋㅋ', dur: 25, need: 12,  now: (c) => c.count('slime'),  needs: ['slime'] },
  { text: '궁수부대 8마리 일제사격 보고싶다', dur: 25, need: 8,   now: (c) => c.count('archer'), needs: ['archer'] },
  { text: '골렘 3마리 동시에 ㄱㄱ',           dur: 25, need: 3,   now: (c) => c.count('golem'),  needs: ['golem'] },
  { text: '한 화면에 25마리 채워봐',          dur: 30, need: 25,  now: (c) => c.total },
  { text: '20마리 잡히는 거 보고싶다',        dur: 25, need: 20,  now: (c) => c.killsSince },
  { text: '용사 피 30% 밑으로 만들어봐',      dur: 30, need: 0.7, now: (c) => 1 - c.hpRatio },
  { text: '폭탄 박쥐 6마리 터뜨려줘',         dur: 20, need: 6,   now: (c) => c.count('bat'),    needs: ['bat'] },
  { text: '정예 기사 2명 붙여봐',            dur: 25, need: 2,   now: (c) => c.count('knight'), needs: ['knight'] },
];

export interface ActiveRequest {
  def: RequestDef;
  t: number; // 남은 시간
  kills0: number; // 요청 시작 시점의 누적 처치 수
}

// 한 프레임 적용하는 순수 리듀서 (formulas.stepCritical과 같은 패턴).
// r을 제자리 변이하고, 씬이 연출로 반응할 결과만 반환한다.
export type ReqEvent = 'success' | 'fail' | null;
export function stepRequest(r: ActiveRequest, c: ReqCtx, dt: number): ReqEvent {
  if (r.def.now(c) >= r.def.need) return 'success';
  r.t -= dt;
  return r.t <= 0 ? 'fail' : null;
}

export const reqProgress = (r: ActiveRequest, c: ReqCtx) => Math.min(1, Math.max(0, r.def.now(c) / r.def.need));

// 해금된 몬스터로 가능한 요청 중 하나. 직전 요청은 제외 (같은 요구가 연달아 뜨면 티가 난다).
export function pickRequest(
  unlocked: readonly MonsterId[],
  rnd: () => number = Math.random,
  exclude?: RequestDef,
): RequestDef | null {
  const pool = REQUESTS.filter((r) => r !== exclude && (r.needs ?? []).every((m) => unlocked.includes(m)));
  return pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
}
