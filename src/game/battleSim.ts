import { clamp, danger, hypeTier, viewerDrift, MIN_VIEWERS, type HypeTier } from '../formulas.ts';
import type { HeroEntity, MonsterEntity, Arrow } from './entities.ts';
import { hasTrait, INFINITE_DANCE_RATE, INFINITE_DANCE_MAX, INFINITE_DANCE_RESET_IDLE, type TraitId } from '../data/traits.ts';

// "엔티티용 formulas.ts" — 전투 시뮬 결정 로직을 Phaser 없이 모은다.
// 헬퍼는 plain 시뮬 필드(x/y/hp/타이머)만 변이하고, Phaser가 필요한 것(스프라이트/FX/사망·골드)은
// intent로 반환한다. 스프라이트 쓰기의 단일 소유자는 BattleScene. 덕분에 브라우저 없이 테스트된다.

// ── AI 튜닝 상수 (로직 옆에 둔다) ──
export const SUMMON_MIN_RADIUS = 150; // 용사 반경 이 안에는 소환 금지
export const NEAR_RADIUS = 200; // 위험도·회복 판정용 "근접" 반경
const SEEK_RANGE = 300; // 용사가 노리는 최대 탐지 거리
const REGEN_RATE = 0.05; // 근접 0마리일 때 초당 회복 비율
const REGEN_DELAY = 1.5; // 근접 0마리가 이 시간(초) 이상 유지돼야 회복 시작 — 스치듯 벌린 거리로는 안 참다
const REGEN_FLAT_INTERVAL = 5; // 응급 처치(regenFlat) 고정 회복 주기(초)
const RETREAT_HP = 0.25; // 이 비율 이하로 떨어지면 후퇴
const RETREAT_DUR = 2; // 후퇴 지속(초)
const RETREAT_CD = 6; // 후퇴 쿨다운(초)
const HOME_SPEED_MULT = 0.5; // 스폰 복귀 이동 속도 배율
const HOME_THRESHOLD = 20; // 스폰에서 이 거리 이내면 정지
const ARROW_SPEED = 300; // 화살 속도(px/s)
const ARROW_REACH = 8; // 화살이 목표점에 "도달"했다고 보는 거리
const ARROW_HERO_HIT = 30; // 목표점이 용사에서 이 안이면 명중
// 대시 (용사 모드 전용). MAX_ALIVE=60 상황을 빠져나가는 유일한 수단이라 밸런스의 중심.
export const DASH_SPEED = 3; // 대시 중 이동 속도 배율
export const DASH_DUR = 0.18; // 대시 지속(초) — 이 동안 무적
export const DASH_CD = 2.5; // ponytail: 회피 난이도 knob
// 피격 무적(i-frame). 동일 프레임에 몬스터 여럿에게 동시에 맞아도 데미지는 한 번만 들어가게.
export const HIT_INVULN_DUR = 0.4;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

// 근접 몬스터 수 (위험도·회복 입력). update와 stepViewers/stepHero가 공유.
export function countNear(monsters: readonly MonsterEntity[], hero: HeroEntity): number {
  return monsters.filter((m) => !m.dead && dist(m, hero) < NEAR_RADIUS).length;
}

// ── 용사 AI ──
export interface HeroIntent {
  attacks: MonsterEntity[]; // 이번 프레임 휘두르기에 맞은 전원 (씬이 damageMonster로 처리)
  swung: boolean; // 쿨다운이 돌아 공격 자체는 발동했는가 — 사거리 안에 대상이 없어도(attacks가 비어도) true일 수 있다
  moved: boolean; // 수평 이동 여부 (flip 갱신 조건)
  movingLeft: boolean;
}
// 용사 모드 입력. 넘기면 자동 AI(추적·후퇴·복귀)를 대체한다 — 공격만 기존대로 자동.
export interface HeroInput {
  dx: number;
  dy: number;
  dash: boolean;
}
export function stepHero(
  hero: HeroEntity,
  monsters: readonly MonsterEntity[],
  nearCount: number,
  dt: number,
  home: { x: number; y: number },
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  input?: HeroInput,
  traits: readonly TraitId[] = [],
): HeroIntent {
  const H = hero;
  const alive = monsters.filter((m) => !m.dead);
  H.atkCd = Math.max(0, H.atkCd - dt);
  H.retreatT = Math.max(0, H.retreatT - dt);
  H.retreatCd = Math.max(0, H.retreatCd - dt);
  H.dashT = Math.max(0, H.dashT - dt);
  H.dashCd = Math.max(0, H.dashCd - dt);
  H.invulnT = Math.max(0, H.invulnT - dt);
  H.timeSlashT = Math.max(0, H.timeSlashT - dt);
  // 무한의 검무: 이번 프레임 이동/공속에 곱할 배율은 "지난 프레임까지 쌓인" 스택으로 정한다
  // (이번 프레임 이동 여부는 이 함수 끝에서야 확정되므로) — 기저 스탯은 그대로 두고 매 사용처에서만 곱한다.
  const dancing = hasTrait(traits, 'infiniteDance');
  const buffMult = 1 + (dancing ? H.moveBuffStack : 0);

  // 자동 회복은 수동 조작에서도 유지 — 구석 도망은 시청자 이탈로 이미 벌점이 걸려 있다
  if (nearCount === 0) {
    H.safeT += dt;
    if (H.safeT >= REGEN_DELAY) {
      H.hp = Math.min(H.maxHp, H.hp + H.maxHp * REGEN_RATE * dt);
      // 응급 처치: 비전투(안전) 상태 유지 중 5초마다 고정량 추가 회복
      if (H.regenFlat > 0) {
        H.regenTickT -= dt;
        if (H.regenTickT <= 0) {
          H.hp = Math.min(H.maxHp, H.hp + H.regenFlat);
          H.regenTickT = REGEN_FLAT_INTERVAL;
        }
      }
    }
  } else {
    H.safeT = 0;
    H.regenTickT = 0;
  }
  // 자동 후퇴는 조작권을 뺏으므로 수동 조작 중엔 발동시키지 않는다
  if (!input && H.hp / H.maxHp <= RETREAT_HP && H.retreatCd <= 0) {
    H.retreatT = RETREAT_DUR;
    H.retreatCd = RETREAT_CD;
  }

  let vx = 0,
    vy = 0;
  // 근접은 단일 타겟이 아니라 휘두르기 — 사거리 안 전원이 맞는다
  let attacks: MonsterEntity[] = [];
  let swung = false;
  const swing = () => alive.filter((m) => dist(m, H) <= H.range);
  if (input) {
    if (input.dash && H.dashCd <= 0) {
      H.dashT = DASH_DUR;
      H.dashCd = DASH_CD;
      H.invulnT = DASH_DUR; // 대시 = 관통 회피. 제자리 대시도 무적은 붙는다 (패닉 버튼)
    }
    const len = Math.hypot(input.dx, input.dy);
    if (len) {
      const spd = H.speed * buffMult * (H.dashT > 0 ? DASH_SPEED : 1);
      vx = (input.dx / len) * spd;
      vy = (input.dy / len) * spd;
    }
    // 이동은 수동, 공격은 사거리 안 최근접 자동 (다수 몬스터 상황에 조준은 손이 모자란다)
    let target: MonsterEntity | null = null,
      best = H.range;
    for (const m of alive) {
      const d = dist(m, H);
      if (d < best) {
        best = d;
        target = m;
      }
    }
    if (target && H.atkCd <= 0) {
      H.atkCd = 1 / (H.atkSpd * buffMult);
      H.atkCount++;
      swung = true;
      attacks = swing();
    }
  } else if (H.retreatT > 0 && alive.length) {
    // 몬스터 무리 반대 방향으로 도주
    let sx = 0,
      sy = 0;
    for (const m of alive) {
      sx += H.x - m.x;
      sy += H.y - m.y;
    }
    const len = Math.hypot(sx, sy) || 1;
    vx = (sx / len) * H.speed * buffMult;
    vy = (sy / len) * H.speed * buffMult;
  } else {
    // 가장 가까운 대상 추적 → 사거리 안이면 공격
    let target: MonsterEntity | null = null,
      best = SEEK_RANGE;
    for (const m of alive) {
      const d = dist(m, H);
      if (d < best) {
        best = d;
        target = m;
      }
    }
    if (target) {
      const d = best;
      if (d > H.range) {
        vx = ((target.x - H.x) / d) * H.speed * buffMult;
        vy = ((target.y - H.y) / d) * H.speed * buffMult;
      } else if (H.atkCd <= 0) {
        H.atkCd = 1 / (H.atkSpd * buffMult);
        H.atkCount++;
        swung = true;
        attacks = swing();
      }
    } else if (dist(H, home) > HOME_THRESHOLD) {
      // 대상 없으면 스폰으로 천천히 복귀
      const d = dist(H, home);
      vx = ((home.x - H.x) / d) * H.speed * HOME_SPEED_MULT;
      vy = ((home.y - H.y) / d) * H.speed * HOME_SPEED_MULT;
    }
  }
  if (dancing) {
    if (vx !== 0 || vy !== 0) {
      H.moveIdleT = 0;
      H.moveBuffStack = Math.min(INFINITE_DANCE_MAX, H.moveBuffStack + INFINITE_DANCE_RATE * dt);
    } else {
      H.moveIdleT += dt;
      if (H.moveIdleT >= INFINITE_DANCE_RESET_IDLE) H.moveBuffStack = 0;
    }
  }
  H.x = clamp(H.x + vx * dt, bounds.minX, bounds.maxX);
  H.y = clamp(H.y + vy * dt, bounds.minY, bounds.maxY);
  return { attacks, swung, moved: vx !== 0, movingLeft: vx < 0 };
}

// ── 몬스터 AI ── (사망/스프라이트 처리는 씬 소유: suicide도 씬이 m.dead 세팅)
export type MonsterIntent =
  | { kind: 'move'; flipLeft: boolean }
  | { kind: 'melee'; dmg: number; suicide: boolean }
  | { kind: 'arrow'; x: number; y: number; tx: number; ty: number; dmg: number }
  | { kind: 'idle' };
export function stepMonster(m: MonsterEntity, hero: HeroEntity, dt: number): MonsterIntent {
  const H = hero;
  m.atkCd = Math.max(0, m.atkCd - dt);
  // 기절/빙결(경직 포함) 중엔 AI 자체를 건너뛴다 — heavyStrike 경직·frostStrike 빙결이 여길 통해 먹힌다.
  if (m.stunT && m.stunT > 0) {
    m.stunT -= dt;
    return { kind: 'idle' };
  }
  const d = dist(m, H);
  if (d > m.def.range) {
    m.x += ((H.x - m.x) / d) * m.def.speed * dt;
    m.y += ((H.y - m.y) / d) * m.def.speed * dt;
    return { kind: 'move', flipLeft: H.x < m.x };
  }
  if (m.atkCd <= 0) {
    m.atkCd = m.def.atkCd;
    if (m.def.ranged) return { kind: 'arrow', x: m.x, y: m.y, tx: H.x, ty: H.y, dmg: m.def.dmg };
    return { kind: 'melee', dmg: m.def.dmg, suicide: !!m.def.suicide };
  }
  return { kind: 'idle' };
}

// ── 화살 ── ('travel'=이동 계속 · {hit}=용사 피격 후 소멸 · 'expire'=빗나가 소멸)
export type ArrowResult = 'travel' | { hit: number } | 'expire';
export function stepArrow(a: Arrow, hero: HeroEntity, dt: number): ArrowResult {
  const d = dist(a, { x: a.tx, y: a.ty });
  if (d < ARROW_REACH) {
    return Math.hypot(a.tx - hero.x, a.ty - hero.y) < ARROW_HERO_HIT ? { hit: a.dmg } : 'expire';
  }
  a.x += ((a.tx - a.x) / d) * ARROW_SPEED * dt;
  a.y += ((a.ty - a.y) / d) * ARROW_SPEED * dt;
  return 'travel';
}

// ── 시청자 시뮬 ── (viewers/peakViewers/drift/combo 변이, 위험도·흥분도 반환)
export const COMBO_WINDOW = 2; // ponytail: 이 안에 다음 타격이 나면 콤보 유지 — 난이도 knob
export interface ViewerState {
  viewers: number;
  peakViewers: number;
  drift: number;
  combo: number; // 타격 콤보 — ComboMeter 표시 + FULL 도네이션 확률 보정용 (danger()엔 반영 안 함)
  comboT: number; // 콤보 유지 잔여 시간
}
export interface ViewerStep {
  D: number;
  tier: HypeTier;
}
// 타격 1회 (처치 여부 무관). 창이 살아있으면 이어붙이고, 끊겼으면 1부터 다시.
export function bumpCombo(vs: ViewerState) {
  vs.combo = vs.comboT > 0 ? vs.combo + 1 : 1;
  vs.comboT = COMBO_WINDOW;
}
// cap: 상한 근처일수록 상승률을 깎는 소프트캡(로지스틱형) — 하락엔 안 걸린다.
// 피드백(2026-08-03): 상한이 없어 1화에서 9만 명까지 폭주했다. 기본값 Infinity는 캡 없는
// 기존 동작(과 기존 테스트)을 그대로 보존한다 — 실제 캡은 BattleScene이 progression.viewerCap()로 넘긴다.
export function stepViewers(
  vs: ViewerState,
  hpRatio: number,
  nearCount: number,
  dt: number,
  cap: number = Infinity,
  rnd: () => number = Math.random,
): ViewerStep {
  vs.comboT = Math.max(0, vs.comboT - dt);
  if (vs.comboT <= 0) vs.combo = 0;
  const D = danger(hpRatio, nearCount);
  const tier = hypeTier(D);
  vs.drift = viewerDrift(vs.drift, dt, rnd);
  const rate = tier.rate + vs.drift;
  const room = clamp(1 - vs.viewers / cap, 0, 1); // 상승세만 감쇠, 하락세는 그대로 통과
  vs.viewers = Math.max(MIN_VIEWERS, vs.viewers * (1 + (rate > 0 ? rate * room : rate) * dt));
  vs.peakViewers = Math.max(vs.peakViewers, vs.viewers);
  return { D, tier };
}
