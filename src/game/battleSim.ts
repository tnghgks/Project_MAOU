import { clamp, danger, hypeTier, viewerDrift, MIN_VIEWERS, type HypeTier } from '../formulas.ts';
import type { HeroEntity, MonsterEntity, Arrow } from './entities.ts';

// "엔티티용 formulas.ts" — 전투 시뮬 결정 로직을 Phaser 없이 모은다.
// 헬퍼는 plain 시뮬 필드(x/y/hp/타이머)만 변이하고, Phaser가 필요한 것(스프라이트/FX/사망·골드)은
// intent로 반환한다. 스프라이트 쓰기의 단일 소유자는 BattleScene. 덕분에 브라우저 없이 테스트된다.

// ── AI 튜닝 상수 (로직 옆에 둔다) ──
export const SUMMON_MIN_RADIUS = 150; // 용사 반경 이 안에는 소환 금지
export const NEAR_RADIUS = 200; // 위험도·회복 판정용 "근접" 반경
const SEEK_RANGE = 300; // 용사가 노리는 최대 탐지 거리
const REGEN_RATE = 0.1; // 근접 0마리일 때 초당 회복 비율
const RETREAT_HP = 0.25; // 이 비율 이하로 떨어지면 후퇴
const RETREAT_DUR = 2; // 후퇴 지속(초)
const RETREAT_CD = 6; // 후퇴 쿨다운(초)
const HOME_SPEED_MULT = 0.5; // 스폰 복귀 이동 속도 배율
const HOME_THRESHOLD = 20; // 스폰에서 이 거리 이내면 정지
const ARROW_SPEED = 300; // 화살 속도(px/s)
const ARROW_REACH = 8; // 화살이 목표점에 "도달"했다고 보는 거리
const ARROW_HERO_HIT = 30; // 목표점이 용사에서 이 안이면 명중

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

// 근접 몬스터 수 (위험도·회복 입력). update와 stepViewers/stepHero가 공유.
export function countNear(monsters: readonly MonsterEntity[], hero: HeroEntity): number {
  return monsters.filter((m) => !m.dead && dist(m, hero) < NEAR_RADIUS).length;
}

// ── 용사 AI ──
export interface HeroIntent {
  attack: MonsterEntity | null; // 이번 프레임 근접 공격 대상 (씬이 damageMonster로 처리)
  moved: boolean; // 수평 이동 여부 (flip 갱신 조건)
  movingLeft: boolean;
}
export function stepHero(
  hero: HeroEntity,
  monsters: readonly MonsterEntity[],
  nearCount: number,
  dt: number,
  home: { x: number; y: number },
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): HeroIntent {
  const H = hero;
  const alive = monsters.filter((m) => !m.dead);
  H.atkCd = Math.max(0, H.atkCd - dt);
  H.retreatT = Math.max(0, H.retreatT - dt);
  H.retreatCd = Math.max(0, H.retreatCd - dt);

  if (nearCount === 0) H.hp = Math.min(H.maxHp, H.hp + H.maxHp * REGEN_RATE * dt);
  if (H.hp / H.maxHp <= RETREAT_HP && H.retreatCd <= 0) {
    H.retreatT = RETREAT_DUR;
    H.retreatCd = RETREAT_CD;
  }

  let vx = 0,
    vy = 0;
  let attack: MonsterEntity | null = null;
  if (H.retreatT > 0 && alive.length) {
    // 몬스터 무리 반대 방향으로 도주
    let sx = 0,
      sy = 0;
    for (const m of alive) {
      sx += H.x - m.x;
      sy += H.y - m.y;
    }
    const len = Math.hypot(sx, sy) || 1;
    vx = (sx / len) * H.speed;
    vy = (sy / len) * H.speed;
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
        vx = ((target.x - H.x) / d) * H.speed;
        vy = ((target.y - H.y) / d) * H.speed;
      } else if (H.atkCd <= 0) {
        H.atkCd = 1 / H.atkSpd;
        attack = target;
      }
    } else if (dist(H, home) > HOME_THRESHOLD) {
      // 대상 없으면 스폰으로 천천히 복귀
      const d = dist(H, home);
      vx = ((home.x - H.x) / d) * H.speed * HOME_SPEED_MULT;
      vy = ((home.y - H.y) / d) * H.speed * HOME_SPEED_MULT;
    }
  }
  H.x = clamp(H.x + vx * dt, bounds.minX, bounds.maxX);
  H.y = clamp(H.y + vy * dt, bounds.minY, bounds.maxY);
  return { attack, moved: vx !== 0, movingLeft: vx < 0 };
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

// ── 시청자 시뮬 ── (viewers/peakViewers/drift 변이, 위험도·흥분도 반환)
export interface ViewerState {
  viewers: number;
  peakViewers: number;
  drift: number;
}
export interface ViewerStep {
  D: number;
  tier: HypeTier;
}
export function stepViewers(
  vs: ViewerState,
  hpRatio: number,
  nearCount: number,
  dt: number,
  rnd: () => number = Math.random,
): ViewerStep {
  const D = danger(hpRatio, nearCount);
  const tier = hypeTier(D);
  vs.drift = viewerDrift(vs.drift, dt, rnd);
  vs.viewers = Math.max(MIN_VIEWERS, vs.viewers * (1 + (tier.rate + vs.drift) * dt));
  vs.peakViewers = Math.max(vs.peakViewers, vs.viewers);
  return { D, tier };
}
