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
  combo: number; // 현재 처치 콤보 (battleSim.ViewerState)
  noHitT: number; // 마지막 피격 이후 경과 시간(초)
  bossDmgRatio: number; // 요청 시작 시점 대비 깎은 보스 체력 비율 0~1
}
export interface RequestDef {
  text: string; // 채팅에 뜨는 요구. {n}은 확정된 need로 치환된다
  dur: number; // 제한시간(초)
  need: number; // 전투력 1.00 기준값 — 실제 목표는 startRequest가 스케일한다
  now(c: ReqCtx): number;
  noScale?: boolean; // 비율 목표(HP 등) — 전투력으로 늘리면 말이 안 된다
  max?: number; // 스케일 상한
}

// ponytail: 요청 빈도·보상 knob
export const REQ_FIRST = 12; // 방송 시작 후 첫 요청까지
export const REQ_GAP = 22; // 요청 하나가 끝나고 다음까지
export const REQ_WIN = 1.35; // 성공 시 시청자 배율
export const REQ_LOSE = 0.85;
export const REQ_SCALE = 0.5; // 전투력 2배당 목표치 +50% (로그 — 후반 강화에도 목표가 폭주하지 않는다)

// prettier-ignore
// 2026-08-10: 소환 관련 요청 제거 — 웨이브 편성 시스템으로 바뀌어 특정 몬스터를 원하는 시점에 소환할 수 없음.
// 보스 관련 요청도 제거 — 보스전에는 소환이 막혀 잡몹이 새로 나오지 않아 "보스만 노려" 같은 미션이 무의미.
// 2026-08-10 재구성: 극단적으로 단순화 — 처치와 콤보만. 복잡한 조건 전부 제거.
export const REQUESTS: RequestDef[] = [
  // 처치 미션 — 가장 기본적인 목표
  { text: '몬스터 {n}마리 잡아줘',       dur: 20, need: 5,  now: (c) => c.killsSince },
  { text: '{n}마리 처치 가보자',         dur: 25, need: 8,  now: (c) => c.killsSince },
  { text: '{n}마리 잡아보자',            dur: 30, need: 12, now: (c) => c.killsSince },
  { text: '{n}마리 잡자',                dur: 35, need: 15, now: (c) => c.killsSince },

  // 콤보 미션
  { text: '콤보 {n}개 쌓아봐',           dur: 25, need: 4,  now: (c) => c.combo, max: 12 },
  { text: '{n}콤보 가보자',              dur: 30, need: 7,  now: (c) => c.combo, max: 12 },
];

export interface ActiveRequest {
  def: RequestDef;
  need: number; // 전투력으로 확정된 이번 요청의 목표치
  label: string; // {n}이 치환된 최종 문구 (채팅·HUD가 그대로 쓴다)
  t: number; // 남은 시간
  kills0: number; // 요청 시작 시점의 누적 처치 수
  bossHp0: number; // 요청 시작 시점의 보스 HP (없으면 0) — bossDmgRatio 기준선
}

// 출제 = 전투력으로 목표치를 확정하는 시점. 이후 런 중에 용사가 더 강해져도 이번 목표는 안 움직인다.
export function startRequest(def: RequestDef, power: number, kills0: number, bossHp0 = 0): ActiveRequest {
  const scaled = Math.max(1, Math.round(def.need * (1 + Math.log2(Math.max(1, power)) * REQ_SCALE)));
  const need = def.noScale ? def.need : Math.min(scaled, def.max ?? Infinity);
  return { def, need, label: def.text.replace('{n}', String(need)), t: def.dur, kills0, bossHp0 };
}

// 한 프레임 적용하는 순수 리듀서 (formulas.stepCritical과 같은 패턴).
// r을 제자리 변이하고, 씬이 연출로 반응할 결과만 반환한다.
export type ReqEvent = 'success' | 'fail' | null;
export function stepRequest(r: ActiveRequest, c: ReqCtx, dt: number): ReqEvent {
  if (r.def.now(c) >= r.need) return 'success';
  r.t -= dt;
  return r.t <= 0 ? 'fail' : null;
}

export const reqProgress = (r: ActiveRequest, c: ReqCtx) => Math.min(1, Math.max(0, r.def.now(c) / r.need));

// 출제 가능 여부를 가르는 현재 방송 상태.
// 2026-08-10: 소환·보스 관련 요청 제거로 단순화 — 모든 요청이 항상 출제 가능.
export interface ReqPool {}

// 지금 낼 수 있는 요청 중 하나. 직전 요청은 제외 (같은 요구가 연달아 뜨면 티가 난다).
export function pickRequest(_p: ReqPool, rnd: () => number = Math.random, exclude?: RequestDef): RequestDef | null {
  const pool = REQUESTS.filter((r) => r !== exclude);
  return pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
}
