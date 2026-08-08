import { clamp, danger, hypeTier, viewerDrift, MIN_VIEWERS, type HypeTier } from '../formulas.ts';
import type { HeroEntity, MonsterEntity, Arrow } from './entities.ts';
import { hasTrait, INFINITE_DANCE_RATE, INFINITE_DANCE_MAX, INFINITE_DANCE_RESET_IDLE, type TraitId } from '../data/traits.ts';
import { ATTACK_RELEASE_SEC, SARGAS_THROW_RELEASE_SEC, SARGAS_STOMP_LAND_SEC } from './anims.ts'; // 값만 가져온다 — anims의 Phaser는 type import라 런타임에 없다

// "엔티티용 formulas.ts" — 전투 시뮬 결정 로직을 Phaser 없이 모은다.
// 헬퍼는 plain 시뮬 필드(x/y/hp/타이머)만 변이하고, Phaser가 필요한 것(스프라이트/FX/사망·골드)은
// intent로 반환한다. 스프라이트 쓰기의 단일 소유자는 BattleScene. 덕분에 브라우저 없이 테스트된다.

// ── AI 튜닝 상수 (로직 옆에 둔다) ──
export const SUMMON_MIN_RADIUS = 150; // 용사 반경 이 안에는 소환 금지
export const NEAR_RADIUS = 200; // 회복(REGEN_DELAY) 판정용 "근접" 반경 — 위험도(danger)는 더 이상 이걸 안 본다
const REGEN_RATE = 0.05; // 근접 0마리일 때 초당 회복 비율
const REGEN_DELAY = 1.5; // 근접 0마리가 이 시간(초) 이상 유지돼야 회복 시작 — 스치듯 벌린 거리로는 안 참다
const REGEN_FLAT_INTERVAL = 5; // 응급 처치(regenFlat) 고정 회복 주기(초)
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

// 근접 몬스터 수 (회복 입력). update와 stepHero가 공유.
export function countNear(monsters: readonly MonsterEntity[], hero: HeroEntity): number {
  return monsters.filter((m) => !m.dead && dist(m, hero) < NEAR_RADIUS).length;
}

// ── 용사 AI ──
// 스프라이트는 3장(남/동/북)만 만들고 서쪽은 동쪽을 flipX — 씬이 west→east+flip으로 매핑한다.
export type Facing = 'south' | 'east' | 'west' | 'north';
export interface HeroIntent {
  attacks: MonsterEntity[]; // 이번 프레임 휘두르기에 맞은 전원 (씬이 damageMonster로 처리)
  swung: boolean; // 쿨다운이 돌아 공격 자체는 발동했는가 — 사거리 안에 대상이 없어도(attacks가 비어도) true일 수 있다
  facing: Facing | null; // null = 정지 (씬이 걷기 애니메이션을 멈춘다)
  /** 휘두른 방향(rad). null = 이번 프레임엔 공격 없음. 판정 반원의 중심축이자 씬의 참격 각도 —
   *  씬이 대상 좌표로 각도를 다시 구하면 판정과 연출이 어긋날 수 있어 여기서 한 번만 정한다. */
  swingAngle: number | null;
}
// 4방향 → 단위 벡터. 용사 모드 조준축.
const FACING_VEC: Record<Facing, [number, number]> = {
  east: [1, 0],
  west: [-1, 0],
  north: [0, -1],
  south: [0, 1],
};
// 속도 벡터 → 바라보는 방향. 용사·몬스터가 공유한다.
// 대각선은 수평 우선 — 측면 뷰가 4방향 중 가장 잘 읽힌다.
export function facingOf(vx: number, vy: number): Facing | null {
  if (vx === 0 && vy === 0) return null;
  if (Math.abs(vx) >= Math.abs(vy)) return vx < 0 ? 'west' : 'east';
  return vy < 0 ? 'north' : 'south';
}

// 용사는 항상 수동 조작(방향키 이동 + 사거리·시야 안이면 자동 공격) — 자동 AI(추적·후퇴·복귀)는 없다.
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
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  input: HeroInput,
  traits: readonly TraitId[] = [],
): HeroIntent {
  const H = hero;
  const alive = monsters.filter((m) => !m.dead);
  H.atkCd = Math.max(0, H.atkCd - dt);
  H.dashT = Math.max(0, H.dashT - dt);
  H.dashCd = Math.max(0, H.dashCd - dt);
  H.invulnT = Math.max(0, H.invulnT - dt);
  H.timeSlashT = Math.max(0, H.timeSlashT - dt);
  // 무한의 검무: 이번 프레임 이동/공속에 곱할 배율은 "지난 프레임까지 쌓인" 스택으로 정한다
  // (이번 프레임 이동 여부는 이 함수 끝에서야 확정되므로) — 기저 스탯은 그대로 두고 매 사용처에서만 곱한다.
  const dancing = hasTrait(traits, 'infiniteDance');
  const buffMult = 1 + (dancing ? H.moveBuffStack : 0);

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

  let vx = 0,
    vy = 0;
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
  // 조준은 바라보는 쪽 고정. 정지하면 마지막 방향이 남으므로(facingOf가 null) 제자리 공격도 방향이 정해진다.
  H.facing = facingOf(vx, vy) ?? H.facing;
  const [ux, uy] = FACING_VEC[H.facing];
  // 근접은 단일 타겟이 아니라 휘두르기 — 사거리 안에서 (ux,uy) 쪽 180°가 맞는다.
  // 반평면 판정은 내적 ≥ 0 — atan2 각도 차이와 달리 ±π 경계에서 뒤집히지 않는다.
  const hits = alive.filter((m) => dist(m, H) <= H.range && (m.x - H.x) * ux + (m.y - H.y) * uy >= 0);
  let attacks: MonsterEntity[] = [];
  let swung = false;
  let swingAngle: number | null = null;
  // 앞이 비었으면 휘두르지 않는다 — 등 뒤 몬스터 때문에 쿨다운만 날리는 헛스윙이 된다
  if (hits.length && H.atkCd <= 0) {
    H.atkCd = 1 / (H.atkSpd * buffMult);
    H.atkCount++;
    swung = true;
    attacks = hits;
    swingAngle = Math.atan2(uy, ux);
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
  return { attacks, swung, facing: facingOf(vx, vy), swingAngle };
}

// ── 몬스터 AI ── (사망/스프라이트 처리는 씬 소유: suicide도 씬이 m.dead 세팅)
// facing은 모든 의도에 들어간다 — 씬이 공격·대기 모션도 방향을 골라 재생해야 하기 때문이다.
// 원거리 공격은 두 박자다: draw(시위를 당기기 시작) → … → arrow(놓는 순간). 그 사이는 idle이라
// 씬이 모션을 새로 걸지 않는다 — 이미 도는 공격 애니메이션을 끊지 않으려는 것.
export type BossPattern = 'rock' | 'stomp' | 'charge';
export type MonsterIntent =
  | { kind: 'move'; facing: Facing }
  | { kind: 'melee'; facing: Facing; dmg: number; suicide: boolean }
  | { kind: 'draw'; facing: Facing }
  | { kind: 'arrow'; facing: Facing; x: number; y: number; tx: number; ty: number; dmg: number }
  | { kind: 'idle'; facing: Facing }
  // ── 보스(사이클롭스/사르가스) 전용 — stepBossGolem만 반환한다 ──
  // charge는 돌진 목표를 윈드업 "시작" 시점에 고정하고 여기 실어 보낸다 — 씬이 그 좌표로
  // 조준선을 그려야 플레이어가 "어디까지/어느 쪽으로" 돌진하는지 미리 보고 피할 수 있다.
  | {
      kind: 'bossTelegraph';
      facing: Facing;
      pattern: BossPattern;
      windup: number;
      chargeTx?: number;
      chargeTy?: number;
    } // 패턴 결정 프레임(윈드업 시작, 1회)
  | { kind: 'bossRock'; facing: Facing; x: number; y: number; tx: number; ty: number; dmg: number } // 돌 던지기 발사 프레임
  | { kind: 'bossStomp'; facing: Facing; x: number; y: number; radius: number; dmg: number } // 스톰핑 판정 프레임
  | { kind: 'bossChargeMove'; facing: Facing } // 돌진 이동 중(매 프레임)
  | { kind: 'bossChargeHit'; facing: Facing; dmg: number }; // 돌진 중 용사와 충돌

// 기절/공격 넉백 처리 — stepMonster·stepBossGolem이 공유한다. null이면 AI 계속 진행.
// 넉백이 기절보다 먼저인 이유는 stepMonster 원본 순서 그대로: 넉백 슬라이드 중엔 경직 여부와
// 무관하게 밀려나야 자연스럽다('idle' 반환 시 위치를 안 갱신해 넉백이 멈춰 보이는 버그가 났었다).
function stepStunOrKb(m: MonsterEntity, hero: HeroEntity, dt: number): MonsterIntent | null {
  if (m.kbT && m.kbT > 0) {
    m.kbT = Math.max(0, m.kbT - dt);
    m.x += (m.kbVx ?? 0) * dt;
    m.y += (m.kbVy ?? 0) * dt;
    return { kind: 'move', facing: facingOf(hero.x - m.x, hero.y - m.y) ?? 'south' };
  }
  // 기절/빙결(경직 포함) 중엔 AI 자체를 건너뛴다 — heavyStrike 경직·frostStrike 빙결이 여길 통해 먹힌다.
  // 당기던 중이었다면 windupT는 그대로 멈춰 있다가 풀린 뒤 이어진다.
  if (m.stunT && m.stunT > 0) {
    m.stunT -= dt;
    return { kind: 'idle', facing: facingOf(hero.x - m.x, hero.y - m.y) ?? 'south' };
  }
  return null;
}

export function stepMonster(m: MonsterEntity, hero: HeroEntity, dt: number): MonsterIntent {
  const H = hero;
  m.atkCd = Math.max(0, m.atkCd - dt);
  const stunOrKb = stepStunOrKb(m, H, dt);
  if (stunOrKb) return stunOrKb;

  // 활을 당기는 중이면 다른 판단을 하지 않는다 — 제자리에 서서 조준하고, 놓는 프레임에 쏜다.
  // 그 사이 용사가 사거리 밖으로 빠져도 이미 시작한 사격은 끝까지 간다(도중에 취소하면
  // 시위를 당기던 그림만 남고 화살이 안 나가 보인다). 조준점은 놓는 순간의 용사 위치다.
  if (m.windupT > 0) {
    m.windupT = Math.max(0, m.windupT - dt);
    const aim = facingOf(H.x - m.x, H.y - m.y) ?? 'south';
    if (m.windupT > 0) return { kind: 'idle', facing: aim };
    return { kind: 'arrow', facing: aim, x: m.x, y: m.y, tx: H.x, ty: H.y, dmg: m.def.dmg };
  }

  const d = dist(m, H);
  if (d > m.def.range) {
    const vx = ((H.x - m.x) / d) * m.def.speed;
    const vy = ((H.y - m.y) / d) * m.def.speed;
    m.x += vx * dt;
    m.y += vy * dt;
    // 용사 쪽으로 이동 중이므로 속도가 0일 수 없다 (d > range > 0)
    return { kind: 'move', facing: facingOf(vx, vy) ?? 'south' };
  }
  // 사거리 안에선 걸음을 멈추고 용사를 본다 — 공격·대기 모션이 볼 방향이다.
  // 완전히 겹쳐 방향이 안 나오면 남쪽(정면): 어차피 코앞이라 어느 쪽이든 읽힌다.
  const facing = facingOf(H.x - m.x, H.y - m.y) ?? 'south';
  if (m.atkCd <= 0) {
    m.atkCd = m.def.atkCd; // 주기는 "쏘기로 마음먹은 순간" 기준 — 당기는 시간이 사격 간격을 늘리지 않는다
    if (m.def.ranged) {
      m.windupT = ATTACK_RELEASE_SEC;
      return { kind: 'draw', facing };
    }
    return { kind: 'melee', facing, dmg: m.def.dmg, suicide: !!m.def.suicide };
  }
  return { kind: 'idle', facing };
}

// ── 보스: 사이클롭스(사르가스, boss_golem) 전용 3패턴 AI — GDD 보스전 1탄.
// stepMonster와 별개 함수인 이유: 일반 몬스터는 "쫓아와서 때리기" 한 가지뿐이라 windupT 하나로
// 충분했지만, 보스는 윈드업 → 발동 → 무방비(recover) → 다음 패턴 대기(cooldown)까지 4단계 상태머신이
// 필요하다. m.bossPhase/bossPattern/bossT(+ 돌진 목표 chargeTx/Ty)에 프레임마다 상태를 싣는다.
// ponytail: 보스 밸런스 knob — 전부 여기 상수로
// 2026-08-07: 보스전 중엔 도네이션·소환·미션을 전부 막아 순수 실력전으로 만들었다(BattleScene) —
// 그만큼 난이도를 hp(monsters.ts)와 패턴 쉴 틈(GOLEM_PATTERN_CD)으로 올렸다. 개별 타격 피해량은
// 안 건드렸다(방금 낮춘 값 그대로) — "한 대에 훅 간다"가 아니라 "쉴 틈이 없다"로 어려워야 한다.
export const GOLEM_PATTERN_CD = 2.4; // 3.2 → 2.4: recover 종료 후 다음 패턴까지 대기(초) — 텀이 짧아졌다
// 던지기·스톰핑 윈드업은 아트가 정한다 — 사르가스엔 그 패턴 전용 모션이 있고(돌을 줍고 들어 올리는
// throwing · 뛰어올라 내려찍는 attack) 윈드업이 곧 그 모션이 도는 시간이다. 텔레그래프 길이를 여기서
// 따로 정하면 돌을 아직 줍는 중인데 돌이 날아가는 식으로 그림과 판정이 어긋난다. 조절은 anims.ts에서.
export const GOLEM_ROCK_WINDUP = SARGAS_THROW_RELEASE_SEC; // "던진다" 텔레그래프 — 원거리라 여유 있게
export const GOLEM_ROCK_DMG = 22;
export const GOLEM_STOMP_WINDUP = SARGAS_STOMP_LAND_SEC;
export const GOLEM_STOMP_DMG = 26;
export const GOLEM_STOMP_RADIUS = 170; // 150 → 170: 덩치(scale 1.35)가 커진 만큼 판정 반경도 같이
export const GOLEM_STOMP_RANGE = 220; // 이 거리 안이어야 스톰핑을 고른다 — 너무 멀면 애초에 안 닿는다
// 2026-08-07 하향(피드백: "너무 빠르고 부딪히면 거의 죽는다·어디까지 따라오는지 모르겠다"):
// 목표를 윈드업 "종료" 시점이 아니라 "시작" 시점에 고정하도록 바꿔서(아래 cooldown 분기) 실제
// 회피 가능 시간(windup 전체)을 벌어주고, 씬이 그 구간에 조준선을 그릴 수 있게 했다 — 속도·피해도 같이 낮췄다.
export const GOLEM_CHARGE_WINDUP = 0.9; // 0.55 → 0.9: 돌 던지기와 통일, 회피 시간 증가
export const GOLEM_CHARGE_SPEED = 260; // 420 → 260: 화살(300)보다도 느리게
export const GOLEM_CHARGE_DMG = 24; // 34 → 24: 스톰핑(26)과 비슷한 수준으로 — 돌진만 유독 즉사급이던 것 완화
export const GOLEM_CHARGE_MAX_T = 1.2; // 못 맞히고 이 시간 넘게 달리면 스스로 멈춘다(빗나간 돌진)
export const GOLEM_CHARGE_HIT_RADIUS = 62; // 46 → 62: 덩치(scale 1.35)에 맞춰 몸통 판정도 같이 키웠다
export const GOLEM_RECOVER_T = 1.2; // 0.8 → 1.2: 패턴 종료 후 무방비 — 플레이어에게 반격 타이밍을 더 준다

export function stepBossGolem(
  m: MonsterEntity,
  hero: HeroEntity,
  dt: number,
  rnd: () => number = Math.random,
): MonsterIntent {
  const H = hero;
  m.atkCd = Math.max(0, m.atkCd - dt); // 보스는 안 쓰지만 다른 시스템(hitFx 등)이 필드 존재를 가정할 수 있어 맞춰둔다
  const stunOrKb = stepStunOrKb(m, H, dt);
  if (stunOrKb) return stunOrKb;
  const lookHero = () => facingOf(H.x - m.x, H.y - m.y) ?? 'south';

  if (m.bossPhase === 'windup') {
    m.bossT = (m.bossT ?? 0) - dt;
    if (m.bossT > 0) return { kind: 'idle', facing: lookHero() };
    const pattern = m.bossPattern!;
    if (pattern === 'charge') {
      // 목표는 이미 윈드업 "시작" 시점(아래 cooldown 분기)에 chargeTx/Ty로 고정돼 있다 —
      // 여기서 다시 잡지 않는다. 그래야 씬이 그 좌표로 윈드업 내내 조준선을 그릴 수 있다.
      m.bossPhase = 'active';
      m.bossT = GOLEM_CHARGE_MAX_T;
      return { kind: 'bossChargeMove', facing: lookHero() };
    }
    m.bossPhase = 'recover';
    m.bossT = GOLEM_RECOVER_T;
    return pattern === 'rock'
      ? { kind: 'bossRock', facing: lookHero(), x: m.x, y: m.y, tx: H.x, ty: H.y, dmg: GOLEM_ROCK_DMG }
      : { kind: 'bossStomp', facing: lookHero(), x: m.x, y: m.y, radius: GOLEM_STOMP_RADIUS, dmg: GOLEM_STOMP_DMG };
  }

  if (m.bossPhase === 'active') {
    m.bossT = (m.bossT ?? 0) - dt;
    const tx = m.chargeTx ?? H.x;
    const ty = m.chargeTy ?? H.y;
    if (Math.hypot(H.x - m.x, H.y - m.y) <= GOLEM_CHARGE_HIT_RADIUS) {
      m.bossPhase = 'recover';
      m.bossT = GOLEM_RECOVER_T;
      return { kind: 'bossChargeHit', facing: lookHero(), dmg: GOLEM_CHARGE_DMG };
    }
    const d = Math.hypot(tx - m.x, ty - m.y);
    if (d < 4 || m.bossT <= 0) {
      // 목표 지점에 도달(빗나감) 또는 최대 시간 초과 — 멈추고 무방비로
      m.bossPhase = 'recover';
      m.bossT = GOLEM_RECOVER_T;
      return { kind: 'idle', facing: lookHero() };
    }
    const vx = ((tx - m.x) / d) * GOLEM_CHARGE_SPEED;
    const vy = ((ty - m.y) / d) * GOLEM_CHARGE_SPEED;
    m.x += vx * dt;
    m.y += vy * dt;
    return { kind: 'bossChargeMove', facing: facingOf(vx, vy) ?? lookHero() };
  }

  if (m.bossPhase === 'recover') {
    m.bossT = (m.bossT ?? 0) - dt;
    if (m.bossT > 0) return { kind: 'idle', facing: lookHero() };
    m.bossPhase = 'cooldown';
    m.bossT = GOLEM_PATTERN_CD;
    return { kind: 'idle', facing: lookHero() };
  }

  // cooldown(+ 최초 미초기화 상태도 여기로 떨어진다) — 다음 패턴을 기다리며 슬금슬금 다가간다.
  m.bossT = (m.bossT ?? 0) - dt;
  const d = Math.hypot(H.x - m.x, H.y - m.y);
  if (m.bossT > 0) {
    if (d > GOLEM_STOMP_RADIUS * 0.5) {
      const vx = ((H.x - m.x) / d) * m.def.speed;
      const vy = ((H.y - m.y) / d) * m.def.speed;
      m.x += vx * dt;
      m.y += vy * dt;
      return { kind: 'move', facing: facingOf(vx, vy) ?? 'south' };
    }
    return { kind: 'idle', facing: lookHero() };
  }
  // 거리에 맞는 패턴만 후보로 — 스톰핑은 닿는 거리에서만, 던지기는 멀 때만 의미가 있다. 돌진은 항상 가능.
  const near = d <= GOLEM_STOMP_RANGE;
  const pattern: BossPattern = near ? (rnd() < 0.5 ? 'stomp' : 'charge') : rnd() < 0.5 ? 'rock' : 'charge';
  const windup =
    pattern === 'rock' ? GOLEM_ROCK_WINDUP : pattern === 'stomp' ? GOLEM_STOMP_WINDUP : GOLEM_CHARGE_WINDUP;
  m.bossPattern = pattern;
  m.bossPhase = 'windup';
  m.bossT = windup;
  if (pattern === 'charge') {
    // 목표를 지금(윈드업 시작) 고정 — 윈드업 내내 이 좌표로 조준선을 그려 회피 여지를 준다.
    m.chargeTx = H.x;
    m.chargeTy = H.y;
    return { kind: 'bossTelegraph', facing: lookHero(), pattern, windup, chargeTx: H.x, chargeTy: H.y };
  }
  return { kind: 'bossTelegraph', facing: lookHero(), pattern, windup };
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
  dt: number,
  cap: number = Infinity,
  rnd: () => number = Math.random,
): ViewerStep {
  vs.comboT = Math.max(0, vs.comboT - dt);
  if (vs.comboT <= 0) vs.combo = 0;
  const D = danger(hpRatio);
  const tier = hypeTier(D);
  vs.drift = viewerDrift(vs.drift, dt, rnd);
  const rate = tier.rate + vs.drift;
  const room = clamp(1 - vs.viewers / cap, 0, 1); // 상승세만 감쇠, 하락세는 그대로 통과
  vs.viewers = Math.max(MIN_VIEWERS, vs.viewers * (1 + (rate > 0 ? rate * room : rate) * dt));
  vs.peakViewers = Math.max(vs.peakViewers, vs.viewers);
  return { D, tier };
}
