import { MONSTERS, type MonsterId } from './monsters.ts';
import { clamp } from '../formulas.ts';

// 웨이브 편성 (2026-08-09 구조 개편). 예전엔 방송 중 숫자키로 한 마리씩 직접 소환했다 —
// 비용도 쿨다운도 없어서 "가장 싼 걸 연타"가 언제나 최적이었고, 그래서 초반이 루즈했다.
// 지금은 방송 "전"에 웨이브 5칸을 짜고, 방송 중엔 그 편성이 자동으로 투입된다.
// 플레이어가 방송 중 건드릴 수 있는 건 다음 웨이브를 앞당기는 즉시 호출(SPACE) 하나뿐이다.
//
// 신규 몬스터를 편성에 넣는 데 필요한 작업은 monsters.ts에 cost 한 칸을 채우는 것뿐 —
// 여기 목록을 따로 유지하지 않는다.

export const WAVE_SLOTS = 5; // 편성 칸 수
export const WAVE_INTERVAL = 16; // 자동 투입 간격(초). ponytail: 방송 템포 knob
export const WAVE_ENTRY_MAX = 12; // 한 칸에 넣을 수 있는 최대 마릿수 (동시 생존 상한과 UI 폭 양쪽 고려)
export const WAVE_TYPES_MAX = 3; // 한 웨이브에 섞을 수 있는 몬스터 종류 수

// 편성 포인트 예산 — 화가 오를수록 커진다. ponytail: 편성 난이도 knob
export const LINEUP_BUDGET_BASE = 40;
export const LINEUP_BUDGET_STEP = 15;

// 편성한 5웨이브를 다 쓰면 처음으로 돌아가되 마릿수가 불어난다. 목표 골드를 채울 때까지 방송이
// 이어져야 하는데 편성이 5웨이브에서 끊기면 그 뒤로 아무것도 안 나오기 때문이다.
export const WAVE_CYCLE_GROWTH = 0.5; // 사이클마다 +50%
export const WAVE_CYCLE_MAX = 3; // 배수 상한 (1 + 3*0.5 = 2.5배) — 무한 증식 방지

export interface WaveEntry {
  type: MonsterId;
  count: number;
}
export type Wave = readonly WaveEntry[];
export type Lineup = readonly Wave[]; // 길이 = WAVE_SLOTS

export const lineupBudget = (ep: number) => LINEUP_BUDGET_BASE + Math.max(0, ep - 1) * LINEUP_BUDGET_STEP;

export const entryCost = (e: WaveEntry) => MONSTERS[e.type].cost * e.count;
export const waveCost = (w: Wave) => w.reduce((s, e) => s + entryCost(e), 0);
export const lineupCost = (l: Lineup) => l.reduce((s, w) => s + waveCost(w), 0);

/** 이번 화에 편성 가능한 몬스터. unlock 99(보스)는 편성 대상이 아니다. */
export function summonableAt(ep: number): MonsterId[] {
  return (Object.keys(MONSTERS) as MonsterId[]).filter((id) => MONSTERS[id].unlock <= ep && MONSTERS[id].unlock < 99);
}

export const emptyLineup = (): Lineup => Array.from({ length: WAVE_SLOTS }, () => [] as Wave);

/** 이 편성으로 방송에 나갈 수 있는가. UI의 "방송 시작" 버튼과 씬 진입이 같은 규칙을 본다. */
export type LineupError = 'empty' | 'overBudget' | 'locked' | 'tooManyTypes' | 'tooManyCount';
export function validateLineup(l: Lineup, ep: number): LineupError | null {
  const allowed = summonableAt(ep);
  if (!l.some((w) => w.length > 0)) return 'empty'; // 한 칸이라도 차 있어야 방송이 굴러간다
  if (lineupCost(l) > lineupBudget(ep)) return 'overBudget';
  for (const w of l) {
    if (w.length > WAVE_TYPES_MAX) return 'tooManyTypes';
    for (const e of w) {
      if (!allowed.includes(e.type)) return 'locked';
      if (e.count < 1 || e.count > WAVE_ENTRY_MAX) return 'tooManyCount';
    }
  }
  return null;
}

/** 웨이브 인덱스(0부터) → 이번에 실제로 투입할 목록. 빈 칸은 건너뛰므로 5칸을 다 안 채워도 된다. */
export function waveAt(l: Lineup, index: number): WaveEntry[] {
  const waves = l.filter((w) => w.length > 0);
  if (!waves.length) return [];
  const cycle = Math.min(WAVE_CYCLE_MAX, Math.floor(index / waves.length));
  const mult = 1 + cycle * WAVE_CYCLE_GROWTH;
  return waves[index % waves.length].map((e) => ({
    type: e.type,
    count: Math.max(1, Math.round(e.count * mult)),
  }));
}

/** 편성한 웨이브 수 (빈 칸 제외) — HUD가 "3/5 웨이브"를 그릴 때 쓴다. */
export const filledWaves = (l: Lineup) => l.filter((w) => w.length > 0).length;

export interface WaveTimer {
  waveT: number; // 다음 투입까지 남은 시간(초)
}
/** 한 프레임 적용하는 순수 리듀서 (formulas.stepCritical·requests.stepRequest와 같은 패턴).
 *  s를 제자리 변이하고, 씬이 반응할 사실("지금 투입해라")만 반환한다 — 스폰·연출은 BattleScene 몫.
 *  간격 리셋을 여기 한 곳에 모아 둔 이유: 즉시 호출(SPACE)도 같은 규칙으로 타이머를 되감아야
 *  연타로 간격을 벌어먹는 걸 막을 수 있는데, 규칙이 두 군데로 흩어지면 한쪽만 고치기 쉽다. */
export function stepWave(s: WaveTimer, dt: number): boolean {
  s.waveT -= dt;
  if (s.waveT > 0) return false;
  s.waveT = WAVE_INTERVAL;
  return true;
}

/** 편성에 들어간 몬스터 종류. 시청자 요청 출제 풀이 이걸 본다 —
 *  안 데려온 몬스터를 요구하면 달성할 방법이 아예 없기 때문이다. */
export function lineupMonsters(l: Lineup): MonsterId[] {
  const seen = new Set<MonsterId>();
  for (const w of l) for (const e of w) seen.add(e.type);
  return [...seen];
}

// 슬롯별 예산 비중 — 합이 1.0이라 자동 편성은 절대 예산을 넘지 않는다. 뒤로 갈수록 무겁게 깔아
// 방송 후반이 저절로 고조되게 한다.
const WAVE_BUDGET_RATIO = [0.12, 0.16, 0.2, 0.24, 0.28];
const clampCount = (n: number) => clamp(Math.floor(n), 0, WAVE_ENTRY_MAX);

/** 기본 편성 — 첫 방송의 시작점이자 편성 화면의 "자동 편성" 버튼. 항상 validateLineup을 통과한다. */
export function defaultLineup(ep: number): Lineup {
  const pool = summonableAt(ep).sort((a, b) => MONSTERS[a].cost - MONSTERS[b].cost);
  if (!pool.length) return emptyLineup();
  const cheapest = pool[0];
  const budget = lineupBudget(ep);

  return WAVE_BUDGET_RATIO.map((ratio, i) => {
    const slot = Math.floor(budget * ratio);
    // 웨이브가 뒤로 갈수록 더 비싼 몬스터를 앞세운다 — 다섯 칸이 다 똑같으면 편성한 티가 안 난다
    const lead = pool[Math.min(i, pool.length - 1)];
    const leadCount = clampCount((slot * 0.6) / MONSTERS[lead].cost);
    const left = slot - leadCount * MONSTERS[lead].cost;
    const fillCount = clampCount(left / MONSTERS[cheapest].cost);

    // 같은 몬스터면 두 칸으로 쪼개지 말고 한 칸에 합친다
    if (lead === cheapest) return [{ type: lead, count: Math.max(1, clampCount(leadCount + fillCount)) }];

    const entries: WaveEntry[] = [];
    if (leadCount > 0) entries.push({ type: lead, count: leadCount });
    if (fillCount > 0) entries.push({ type: cheapest, count: fillCount });
    return entries.length ? entries : [{ type: cheapest, count: 1 }];
  });
}
