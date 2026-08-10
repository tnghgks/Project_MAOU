import { clamp, danger, hypeTier, viewerDrift, MIN_VIEWERS, type HypeTier } from '../formulas.ts';
import type { HeroEntity, MonsterEntity, Arrow } from './entities.ts';
import {
  hasTrait,
  INFINITE_DANCE_RATE,
  INFINITE_DANCE_MAX,
  INFINITE_DANCE_RESET_IDLE,
  type TraitId,
} from '../data/traits.ts';
import { ATTACK_RELEASE_SEC, SARGAS_THROW_RELEASE_SEC, SARGAS_STOMP_LAND_SEC } from './anims.ts'; // 값만 가져온다 — anims의 Phaser는 type import라 런타임에 없다

// "엔티티용 formulas.ts" — 전투 시뮬 결정 로직을 Phaser 없이 모은다.
// 헬퍼는 plain 시뮬 필드(x/y/hp/타이머)만 변이하고, Phaser가 필요한 것(스프라이트/FX/사망·골드)은
// intent로 반환한다. 스프라이트 쓰기의 단일 소유자는 BattleScene. 덕분에 브라우저 없이 테스트된다.

// ── AI 튜닝 상수 (로직 옆에 둔다) ──
export const SUMMON_MIN_RADIUS = 150; // 용사 반경 이 안에는 소환 금지
export const NEAR_RADIUS = 200; // 회복(REGEN_DELAY) 판정용 "근접" 반경 — 위험도(danger)는 더 이상 이걸 안 본다
const REGEN_RATE = 0.1; // 0.05 → 0.1 (2026-08-10): 비전투 회복은 전투 중 재생(HeroEntity.regen)의 두 배로 벌어야 "거리를 벌어 숨 돌린다"가 선택지가 된다
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

// ── 역할 기믹 (monsters.ts의 armor/aura를 실제 전투에 먹이는 두 함수) ──

/** armor로 다 막혀도 최소 이만큼은 들어간다. 0이면 공격력이 armor 이하인 동안 영원히 못 죽인다. */
export const ARMOR_MIN_DMG = 1;
export const armorReduce = (dmg: number, armor = 0) => Math.max(ARMOR_MIN_DMG, dmg - armor);

/** 오라 몬스터 주변 아군의 버프 배율을 매 프레임 통째로 다시 칠한다.
 *  누적이 아니라 재계산인 이유: 오라 몬스터가 죽거나 서로 멀어지면 버프도 즉시 풀려야 하는데
 *  누적 방식은 해제 시점을 놓친다. 겹친 오라는 곱하지 않고 가장 센 것 하나만 먹는다 —
 *  주술사를 여러 마리 겹쳐 세워 배율을 폭주시키는 편성을 막는다. */
export function applyAuras(monsters: readonly MonsterEntity[]): void {
  const sources = monsters.filter((m) => !m.dead && m.def.aura);
  for (const m of monsters) {
    let atk = 1;
    let spd = 1;
    for (const s of sources) {
      // 자기 자신은 안 버프한다 — 주술사가 스스로 세지면 "약한데 남을 강하게 한다"는 역할이 흐려진다
      if (s === m) continue;
      const a = s.def.aura!;
      if (dist(m, s) > a.radius) continue;
      atk = Math.max(atk, a.atk);
      spd = Math.max(spd, a.speed);
    }
    m.auraAtk = atk;
    m.auraSpd = spd;
  }
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

// 용사는 항상 수동 조작(WASD 이동 + 사거리·시야 안이면 자동 공격) — 자동 AI(추적·후퇴·복귀)는 없다.
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

  // 체력 재생 스탯(카드) — 적이 있든 없든 항상 돈다. 아래 비전투 회복과 별개로 더해지므로
  // 거리를 벌면 둘이 겹쳐 훨씬 빨리 찬다.
  if (H.regen > 0) H.hp = Math.min(H.maxHp, H.hp + H.regen * dt);

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
export type BossPattern =
  // 사르가스 (boss_golem)
  | 'rock'
  | 'stomp'
  | 'charge'
  // 베르하르트 (boss_knight)
  | 'swordbeam' | 'spaceSlash' | 'knightCharge'
  // 그림하르트 (boss_maou, 최종보스)
  | 'energyBall' | 'lightRain' | 'meteor' | 'warp';
export type MonsterIntent =
  | { kind: 'move'; facing: Facing }
  | { kind: 'melee'; facing: Facing; dmg: number; suicide: boolean }
  | { kind: 'draw'; facing: Facing }
  | { kind: 'arrow'; facing: Facing; x: number; y: number; tx: number; ty: number; dmg: number }
  | { kind: 'idle'; facing: Facing }
  // ── 보스(사이클롭스/사르가스) 전용 — stepBossGolem만 반환한다 ──
  // charge는 돌진 목표를 윈드업 "시작" 시점에 고정하고 여기 실어 보낸다 — 씬이 그 좌표로
  // 조준선을 그려야 플레이어가 "어디까지/어느 쪽으로" 돌진하는지 미리 보고 피할 수 있다.
  // areaPoints: 빛의 심판(그림하르트) 낙뢰 예고 지점 — charge와 같은 이유로 윈드업 "시작"
  // 시점에 확정해 여기 실어 보낸다. 씬이 이 좌표들에 경고 원을 그려야 플레이어가 미리 피한다.
  // (메테오는 위치 기반이 아니라 bossMeteorCharge의 채널링-저지 방식이라 여긴 안 쓴다.)
  | {
      kind: 'bossTelegraph';
      facing: Facing;
      pattern: BossPattern;
      windup: number;
      chargeTx?: number;
      chargeTy?: number;
      areaPoints?: Array<{ x: number; y: number }>;
    } // 패턴 결정 프레임(윈드업 시작, 1회)
  | { kind: 'bossRock'; facing: Facing; x: number; y: number; tx: number; ty: number; dmg: number } // 돌 던지기 발사 프레임
  | { kind: 'bossStomp'; facing: Facing; x: number; y: number; radius: number; dmg: number } // 스톰핑 판정 프레임
  | { kind: 'bossChargeMove'; facing: Facing } // 돌진 이동 중(매 프레임)
  | { kind: 'bossChargeHit'; facing: Facing; dmg: number } // 돌진 중 용사와 충돌
  | { kind: 'bossChargeWall'; facing: Facing; stun: number } // 돌진이 맵 끝에 처박힘 — stun초 자멸 기절
  // ── 베르하르트(기사) 전용 ──
  | {
      kind: 'bossSwordbeam';
      facing: Facing;
      x: number;
      y: number;
      beams: Array<{ tx: number; ty: number }>;
      dmg: number;
    } // 검기 3개 발사
  | { kind: 'bossSpaceSlashCharge'; facing: Facing; x: number; y: number; threshold: number } // 공간 가르기 시작 (threshold: 저지에 필요한 데미지)
  | { kind: 'bossSpaceSlashFail'; facing: Facing; x: number; y: number; radius: number; dmg: number } // 공간 가르기 저지 실패 → 광역 공격
  | { kind: 'bossKnightChargeMove'; facing: Facing } // 베르하르트 돌진 이동 중
  | { kind: 'bossKnightChargeHit'; facing: Facing; dmg: number } // 베르하르트 돌진 충돌
  // ── 그림하르트(최종보스) 전용 ──
  | { kind: 'bossEnergyBall'; facing: Facing; x: number; y: number; beams: Array<{ tx: number; ty: number }>; dmg: number } // 에너지볼 부채꼴 발사
  | { kind: 'bossLightRain'; facing: Facing; points: Array<{ x: number; y: number }>; radius: number; dmg: number } // 빛의 심판 낙뢰 판정
  | { kind: 'bossMeteorCharge'; facing: Facing; x: number; y: number; threshold: number } // 메테오 채널링 시작 (threshold: 저지에 필요한 데미지)
  | { kind: 'bossMeteor'; facing: Facing; dmg: number } // 메테오 저지 실패 — 위치 무관 고정 피해
  | { kind: 'bossWarpStart'; facing: Facing; healRatio: number; summonCount: number } // 워프 시작 — 사라짐+회복+소환
  | { kind: 'bossWarpEnd'; facing: Facing; x: number; y: number }; // 워프 종료 — 재등장 좌표

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
    return { kind: 'arrow', facing: aim, x: m.x, y: m.y, tx: H.x, ty: H.y, dmg: m.def.dmg * (m.auraAtk ?? 1) };
  }

  // 오라 버프(주술사)는 기저 스탯을 안 건드리고 쓰는 자리에서만 곱한다 — applyAuras가 매 프레임
  // 다시 칠하므로 버프원이 사라지면 다음 프레임에 저절로 원래 수치로 돌아온다.
  const d = dist(m, H);
  if (d > m.def.range) {
    const spd = m.def.speed * (m.auraSpd ?? 1);
    const vx = ((H.x - m.x) / d) * spd;
    const vy = ((H.y - m.y) / d) * spd;
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
    return { kind: 'melee', facing, dmg: m.def.dmg * (m.auraAtk ?? 1), suicide: !!m.def.suicide };
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
export const GOLEM_STOMP_RADIUS = 119; // 170 → 119 (2026-08-10 너프 -30%): 덩치를 핑계로 키웠더니 스톰핑 사거리 안에선 사실상 회피가 불가능했다
export const GOLEM_STOMP_RANGE = 220; // 이 거리 안이어야 스톰핑을 고른다 — 너무 멀면 애초에 안 닿는다
// 2026-08-07 하향(피드백: "너무 빠르고 부딪히면 거의 죽는다·어디까지 따라오는지 모르겠다"):
// 목표를 윈드업 "종료" 시점이 아니라 "시작" 시점에 고정하도록 바꿔서(아래 cooldown 분기) 실제
// 회피 가능 시간(windup 전체)을 벌어주고, 씬이 그 구간에 조준선을 그릴 수 있게 했다 — 속도·피해도 같이 낮췄다.
export const GOLEM_CHARGE_WINDUP = 0.9; // 0.55 → 0.9: 돌 던지기와 통일, 회피 시간 증가
export const GOLEM_CHARGE_SPEED = 260; // 420 → 260: 화살(300)보다도 느리게
export const GOLEM_CHARGE_DMG = 24; // 34 → 24: 스톰핑(26)과 비슷한 수준으로 — 돌진만 유독 즉사급이던 것 완화
// 2026-08-10: 돌진은 더 이상 "용사 앞에서 멈추는" 유도 공격이 아니다. 윈드업 시작 시점의 용사
// 방향으로 GOLEM_CHARGE_DIST만큼 직진하고, 그 선 위에서 용사와 겹치면 들이받는다 — 옆으로 한 발만
// 비켜도 보스가 뒤로 지나가 버리는 정직한 패턴이 된다. 대신 벽에 처박히면 크게 자멸한다.
export const GOLEM_CHARGE_DIST = 340; // 돌진 사거리(px) — 목표 지점이 아니라 이 길이가 패턴을 정의한다
export const GOLEM_CHARGE_WALL_STUN = 3; // 맵 끝에 부딪히면 이만큼 기절(초) — 최대 반격 기회
export const GOLEM_CHARGE_MAX_T = 1.6; // 1.2 → 1.6: DIST/SPEED(≈1.31s)보다 커야 시간이 아니라 거리가 돌진을 끝낸다
export const GOLEM_CHARGE_HIT_RADIUS = 62; // 46 → 62: 덩치(scale 1.35)에 맞춰 몸통 판정도 같이 키웠다
export const GOLEM_RECOVER_T = 1.2; // 0.8 → 1.2: 패턴 종료 후 무방비 — 플레이어에게 반격 타이밍을 더 준다

// ── 베르하르트(2탄 보스, boss_knight) 패턴 상수 ──
export const KNIGHT_PATTERN_CD = 2.0; // 패턴 간 대기 시간
export const KNIGHT_RECOVER_T = 1.0; // 패턴 종료 후 무방비 시간

// 검기 발산 (가장 빈번한 패턴). 2026-08-10 상향(피드백: "수를 늘려달라") 3발 → 5발.
export const KNIGHT_SWORDBEAM_WINDUP = 0.7; // 검기 발사 전 윈드업
export const KNIGHT_SWORDBEAM_DMG = 20; // 검기 1개당 피해
export const KNIGHT_SWORDBEAM_SPEED = 320; // 검기 속도
export const KNIGHT_SWORDBEAM_COUNT = 5; // 3 → 5
export const KNIGHT_SWORDBEAM_SPREAD = Math.PI / 9; // 발 사이 20도(총 80도 부채꼴)

// 공간 가르기: 일정 데미지를 넣지 않으면 광역 공격
export const KNIGHT_SPACESLASH_WINDUP = 3.5; // 공간 가르기 준비 시간 (2.5 → 3.5: 저지할 시간 증가)
export const KNIGHT_SPACESLASH_THRESHOLD = 200; // 이 데미지 이상 넣어야 저지 가능 (120 → 200: 더 많은 피해 필요)
export const KNIGHT_SPACESLASH_DMG = 50; // 저지 실패 시 광역 피해
export const KNIGHT_SPACESLASH_RADIUS = 250; // 광역 범위
export const KNIGHT_SPACESLASH_RANGE = 250; // 공간 가르기 발동 최대 거리 (대시 3번 정도 거리)

// 돌진: 사르가스와 유사하지만 칼을 휘두르면서
export const KNIGHT_CHARGE_WINDUP = 0.8;
export const KNIGHT_CHARGE_SPEED = 280; // 사르가스보다 약간 빠름
export const KNIGHT_CHARGE_DMG = 28;
export const KNIGHT_CHARGE_MAX_T = 1.3;
export const KNIGHT_CHARGE_HIT_RADIUS = 56;

// bounds를 넘기면 돌진이 맵 끝에 부딪히는 순간을 판정한다. 안 넘기면(테스트 등) 벽이 없는 셈 —
// 씬은 arenaBounds를 그대로 넘겨준다.
export function stepBossGolem(
  m: MonsterEntity,
  hero: HeroEntity,
  dt: number,
  rnd: () => number = Math.random,
  bounds: { minX: number; maxX: number; minY: number; maxY: number } | null = null,
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
      // 돌진 거리를 다 쓰거나 최대 시간 초과 — 멈추고 무방비로
      m.bossPhase = 'recover';
      m.bossT = GOLEM_RECOVER_T;
      return { kind: 'idle', facing: lookHero() };
    }
    const vx = ((tx - m.x) / d) * GOLEM_CHARGE_SPEED;
    const vy = ((ty - m.y) / d) * GOLEM_CHARGE_SPEED;
    const nx = m.x + vx * dt;
    const ny = m.y + vy * dt;
    // 맵 끝에 처박힘 — 돌진 거리를 다 쓰기 전에 벽이 먼저 오면 자멸한다. 기절은 stepStunOrKb가
    // 소비하고, 그동안 recover 타이머(bossT)는 멈춰 있다가 정신을 차린 뒤에 이어진다.
    if (bounds && (nx < bounds.minX || nx > bounds.maxX || ny < bounds.minY || ny > bounds.maxY)) {
      m.x = clamp(nx, bounds.minX, bounds.maxX);
      m.y = clamp(ny, bounds.minY, bounds.maxY);
      m.stunT = GOLEM_CHARGE_WALL_STUN;
      m.bossPhase = 'recover';
      m.bossT = GOLEM_RECOVER_T;
      return { kind: 'bossChargeWall', facing: lookHero(), stun: GOLEM_CHARGE_WALL_STUN };
    }
    m.x = nx;
    m.y = ny;
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
    // 용사 위치가 아니라 "용사 쪽으로 GOLEM_CHARGE_DIST만큼" 뻗은 끝점이다 — 앞에서 멈추지 않고
    // 정해진 길이를 끝까지 달린다(d는 cooldown 분기에서 이미 잰 용사까지의 거리, 0일 수 없다).
    const ux = d > 0 ? (H.x - m.x) / d : 0;
    const uy = d > 0 ? (H.y - m.y) / d : 1;
    m.chargeTx = m.x + ux * GOLEM_CHARGE_DIST;
    m.chargeTy = m.y + uy * GOLEM_CHARGE_DIST;
    return {
      kind: 'bossTelegraph',
      facing: lookHero(),
      pattern,
      windup,
      chargeTx: m.chargeTx,
      chargeTy: m.chargeTy,
    };
  }
  return { kind: 'bossTelegraph', facing: lookHero(), pattern, windup };
}

// ── 베르하르트(2탄 보스, boss_knight) AI ──
export function stepBossKnight(
  m: MonsterEntity,
  hero: HeroEntity,
  dt: number,
  rnd: () => number = Math.random,
): MonsterIntent {
  const H = hero;
  m.atkCd = Math.max(0, m.atkCd - dt);
  const stunOrKb = stepStunOrKb(m, H, dt);
  if (stunOrKb) return stunOrKb;
  const lookHero = () => facingOf(H.x - m.x, H.y - m.y) ?? 'south';

  // windup: 패턴 예고 단계
  if (m.bossPhase === 'windup') {
    m.bossT = (m.bossT ?? 0) - dt;
    if (m.bossT > 0) return { kind: 'idle', facing: lookHero() };

    const pattern = m.bossPattern!;
    if (pattern === 'knightCharge') {
      m.bossPhase = 'active';
      m.bossT = KNIGHT_CHARGE_MAX_T;
      return { kind: 'bossKnightChargeMove', facing: lookHero() };
    }
    if (pattern === 'spaceSlash') {
      // 공간 가르기 저지 여부 확인
      const damageTaken = m.channelDamageTaken ?? 0;
      if (damageTaken >= KNIGHT_SPACESLASH_THRESHOLD) {
        // 저지 성공 - 그냥 무방비로
        m.bossPhase = 'recover';
        m.bossT = KNIGHT_RECOVER_T;
        m.channelDamageTaken = 0;
        return { kind: 'idle', facing: lookHero() };
      }
      // 저지 실패 - 광역 공격
      m.bossPhase = 'recover';
      m.bossT = KNIGHT_RECOVER_T;
      m.channelDamageTaken = 0;
      return {
        kind: 'bossSpaceSlashFail',
        facing: lookHero(),
        x: m.x,
        y: m.y,
        radius: KNIGHT_SPACESLASH_RADIUS,
        dmg: KNIGHT_SPACESLASH_DMG,
      };
    }
    // swordbeam: 검기 KNIGHT_SWORDBEAM_COUNT개 부채꼴 발사(그림하르트 에너지볼과 같은 구성)
    m.bossPhase = 'recover';
    m.bossT = KNIGHT_RECOVER_T;
    const angle = Math.atan2(H.y - m.y, H.x - m.x);
    const half = (KNIGHT_SWORDBEAM_COUNT - 1) / 2;
    const beams = Array.from({ length: KNIGHT_SWORDBEAM_COUNT }, (_, i) => {
      const a = angle + (i - half) * KNIGHT_SWORDBEAM_SPREAD;
      return { tx: m.x + Math.cos(a) * 600, ty: m.y + Math.sin(a) * 600 };
    });
    return { kind: 'bossSwordbeam', facing: lookHero(), x: m.x, y: m.y, beams, dmg: KNIGHT_SWORDBEAM_DMG };
  }

  // active: 돌진 중
  if (m.bossPhase === 'active') {
    m.bossT = (m.bossT ?? 0) - dt;
    const tx = m.chargeTx ?? H.x;
    const ty = m.chargeTy ?? H.y;
    // 용사와 충돌 체크
    if (Math.hypot(H.x - m.x, H.y - m.y) <= KNIGHT_CHARGE_HIT_RADIUS) {
      m.bossPhase = 'recover';
      m.bossT = KNIGHT_RECOVER_T;
      return { kind: 'bossKnightChargeHit', facing: lookHero(), dmg: KNIGHT_CHARGE_DMG };
    }
    const d = Math.hypot(tx - m.x, ty - m.y);
    if (d < 4 || m.bossT <= 0) {
      // 목표 지점 도달 또는 시간 초과
      m.bossPhase = 'recover';
      m.bossT = KNIGHT_RECOVER_T;
      return { kind: 'idle', facing: lookHero() };
    }
    const vx = ((tx - m.x) / d) * KNIGHT_CHARGE_SPEED;
    const vy = ((ty - m.y) / d) * KNIGHT_CHARGE_SPEED;
    m.x += vx * dt;
    m.y += vy * dt;
    return { kind: 'bossKnightChargeMove', facing: facingOf(vx, vy) ?? lookHero() };
  }

  // recover: 패턴 종료 후 무방비
  if (m.bossPhase === 'recover') {
    m.bossT = (m.bossT ?? 0) - dt;
    if (m.bossT > 0) return { kind: 'idle', facing: lookHero() };
    m.bossPhase = 'cooldown';
    m.bossT = KNIGHT_PATTERN_CD;
    return { kind: 'idle', facing: lookHero() };
  }

  // cooldown: 다음 패턴 대기
  m.bossT = (m.bossT ?? 0) - dt;
  const d = Math.hypot(H.x - m.x, H.y - m.y);
  if (m.bossT > 0) {
    // 중거리 유지 (너무 가까우면 물러나고, 너무 멀면 접근)
    const idealDist = 200;
    if (Math.abs(d - idealDist) > 50) {
      const vx = ((H.x - m.x) / d) * m.def.speed * (d < idealDist ? -0.5 : 1);
      const vy = ((H.y - m.y) / d) * m.def.speed * (d < idealDist ? -0.5 : 1);
      m.x += vx * dt;
      m.y += vy * dt;
      return { kind: 'move', facing: facingOf(vx, vy) ?? 'south' };
    }
    return { kind: 'idle', facing: lookHero() };
  }

  // 매우 가까운 거리에서는 기본 칼 휘두르기 (윈드업 없이 즉시 공격)
  const veryClose = d <= 80;
  if (veryClose) {
    m.bossPhase = 'recover';
    m.bossT = KNIGHT_RECOVER_T;
    return { kind: 'melee', facing: lookHero(), dmg: m.def.dmg, suicide: false };
  }

  // 패턴 선택
  const r = rnd();
  let pattern: BossPattern;
  const near = d <= 200;
  const spaceSlashRange = d <= KNIGHT_SPACESLASH_RANGE; // 공간 가르기는 특정 거리 이내에서만

  if (near) {
    // 근거리: swordbeam 40%, knightCharge 40%, spaceSlash 20% (거리 내일 때만)
    if (spaceSlashRange && r < 0.2) pattern = 'spaceSlash';
    else if (r < 0.6) pattern = 'swordbeam';
    else pattern = 'knightCharge';
  } else {
    // 원거리: swordbeam 70%, knightCharge 30% (공간 가르기는 거리 밖이면 제외)
    if (spaceSlashRange && r < 0.1) pattern = 'spaceSlash';
    else if (r < 0.7) pattern = 'swordbeam';
    else pattern = 'knightCharge';
  }

  const windup =
    pattern === 'swordbeam'
      ? KNIGHT_SWORDBEAM_WINDUP
      : pattern === 'spaceSlash'
        ? KNIGHT_SPACESLASH_WINDUP
        : KNIGHT_CHARGE_WINDUP;

  m.bossPattern = pattern;
  m.bossPhase = 'windup';
  m.bossT = windup;

  if (pattern === 'knightCharge') {
    m.chargeTx = H.x;
    m.chargeTy = H.y;
    return { kind: 'bossTelegraph', facing: lookHero(), pattern, windup, chargeTx: H.x, chargeTy: H.y };
  }
  if (pattern === 'spaceSlash') {
    m.channelDamageTaken = 0; // 초기화
    return { kind: 'bossSpaceSlashCharge', facing: lookHero(), x: m.x, y: m.y, threshold: KNIGHT_SPACESLASH_THRESHOLD };
  }
  return { kind: 'bossTelegraph', facing: lookHero(), pattern, windup };
}

// ── 그림하르트(최종보스, boss_maou) 패턴 상수 ──
// 최종보스답게 텀이 셋 중 가장 짧다(MAOU_PATTERN_CD) — 대신 개별 타격 피해는 앞선 두 보스와
// 비슷한 수준으로 맞췄다. "쉴 틈이 없다"는 golem/knight 하향 때 잡은 방향을 그대로 잇는다.
export const MAOU_PATTERN_CD = 1.6;
export const MAOU_RECOVER_T = 1.0;

// 에너지볼: 기본 견제기 — 부채꼴 5연발(검기 3연발보다 넓고 촘촘하게, 그림하르트가 마법사형이라는 인상을 준다).
// 사거리 안에서 한 줄로 맞을 때만 각 발이 명중하므로 개별 피해는 낮게 잡는다.
export const MAOU_ENERGYBALL_WINDUP = 0.75;
export const MAOU_ENERGYBALL_DMG = 18;
export const MAOU_ENERGYBALL_SPEED = 260;
export const MAOU_ENERGYBALL_COUNT = 5;
// 2026-08-07 하향(피드백: "더 촘촘해야 할 것 같다"): 5발이 중심축 기준 ±2칸씩 벌어지므로 총 span은
// 이 값의 4배다 — 애초에 "발 사이 25도(총 100도)"를 노렸는데 실제로는 50도(총 200도)로 계산돼 있어
// 부채꼴이 절반 화면을 덮을 만큼 헐렁했다. 15도 간격(총 60도)으로 확 좁혀 진짜 촘촘한 탄막으로.
export const MAOU_ENERGYBALL_SPREAD = Math.PI / 12; // 15도 × 4칸 = 총 60도

// 빛의 심판: 무작위 지점 + 용사 현재 위치, 총 MAOU_LIGHTRAIN_COUNT곳에 낙뢰 예고 → 윈드업 끝나면 전부 동시 타격.
// 지점은 윈드업 "시작" 시점(패턴 선택 프레임)에 고정 — charge류와 같은 원칙으로, 씬이 그 좌표에
// 경고 원을 그려야 회피가 성립한다. 용사가 그 자리에 그대로 있으면 최소 1곳(현재 위치)은 반드시 맞는다.
export const MAOU_LIGHTRAIN_WINDUP = 1.4;
export const MAOU_LIGHTRAIN_COUNT = 4;
export const MAOU_LIGHTRAIN_RADIUS = 70;
export const MAOU_LIGHTRAIN_DMG = 24;
export const MAOU_LIGHTRAIN_SCATTER_MIN = 80; // 용사 위치 기준 나머지 낙뢰 지점을 흩뿌리는 반경
export const MAOU_LIGHTRAIN_SCATTER_MAX = 340;

// 메테오: 위치로 피하는 패턴이 아니라 베르하르트의 공간 가르기와 같은 "채널링-저지" 패턴이다
// (2026-08-07 재설계, 피드백: "범위 지정하지 말고 전체 데미지로, 용사가 데미지를 먹이면 멈추는
// 형태가 맞을 거 같다"). 윈드업 동안 보스에게 MAOU_METEOR_THRESHOLD 이상 피해를 넣으면 저지되고,
// 못 넣으면 회피 불가 고정 피해가 들어간다 — 자리를 옮겨서 피하는 게 아니라 화력으로 끊어야 한다.
// 2026-08-07 상향(피드백: "실행 시간이 너무 빠르다"): 2.0초는 화면을 가로질러 떨어지는 운석 연출을
// 담기엔 너무 촉박했다 — 공간 가르기(3.5초)에 가깝게 늘려 낙하가 실제로 무겁게 보일 시간을 준다.
export const MAOU_METEOR_WINDUP = 3.2;
export const MAOU_METEOR_THRESHOLD = 150; // 이 데미지 이상 넣어야 저지된다
export const MAOU_METEOR_DMG = 45; // 저지 실패 시 고정 피해 — 위치 무관, 막지 못하면 그대로 맞는다

// 워프: HP가 임계값 아래로 떨어지면(한 임계값당 1회) 사라져서 몬스터를 불러내고 스스로 회복한다.
// 사르가스/베르하르트에는 없는 "체력 관문형" 패턴 — 무작위 순환(energyBall/lightRain)과 달리
// HP만 보고 확정 발동하므로 cooldown 분기에서 무작위 뽑기보다 먼저 확인한다.
export const MAOU_WARP_HP_THRESHOLDS = [0.6, 0.3] as const; // 60%, 30% — 두 번의 재정비 구간
export const MAOU_WARP_WINDUP = 0.7; // 사라지기 직전 짧은 채널링 — "곧 사라진다"를 예고
export const MAOU_WARP_DURATION = 3.2; // 사라져 있는 시간(초) — 이 동안 몸통은 화면 밖, 공격이 안 닿는다
export const MAOU_WARP_HEAL_RATIO = 0.15; // 최대체력의 15%를 사라지는 순간 즉시 회복
export const MAOU_WARP_SUMMON_COUNT = 4;
export const MAOU_WARP_REAPPEAR_DIST = 260; // 재등장 시 용사로부터 이만큼 떨어진 곳에 나타난다

export function stepBossMaou(
  m: MonsterEntity,
  hero: HeroEntity,
  dt: number,
  rnd: () => number = Math.random,
): MonsterIntent {
  const H = hero;
  m.atkCd = Math.max(0, m.atkCd - dt);
  const stunOrKb = stepStunOrKb(m, H, dt);
  if (stunOrKb) return stunOrKb;
  const lookHero = () => facingOf(H.x - m.x, H.y - m.y) ?? 'south';

  if (m.bossPhase === 'windup') {
    m.bossT = (m.bossT ?? 0) - dt;
    if (m.bossT > 0) return { kind: 'idle', facing: lookHero() };
    const pattern = m.bossPattern!;
    if (pattern === 'warp') {
      m.bossPhase = 'active';
      m.bossT = MAOU_WARP_DURATION;
      return { kind: 'bossWarpStart', facing: lookHero(), healRatio: MAOU_WARP_HEAL_RATIO, summonCount: MAOU_WARP_SUMMON_COUNT };
    }
    if (pattern === 'meteor') {
      // 공간 가르기와 같은 저지 판정 — 위치가 아니라 이 윈드업 동안 넣은 피해량으로 갈린다.
      m.bossPhase = 'recover';
      m.bossT = MAOU_RECOVER_T;
      const dmgTaken = m.channelDamageTaken ?? 0;
      m.channelDamageTaken = 0;
      if (dmgTaken >= MAOU_METEOR_THRESHOLD) return { kind: 'idle', facing: lookHero() }; // 저지 성공
      return { kind: 'bossMeteor', facing: lookHero(), dmg: MAOU_METEOR_DMG };
    }
    m.bossPhase = 'recover';
    m.bossT = MAOU_RECOVER_T;
    if (pattern === 'energyBall') {
      const angle = Math.atan2(H.y - m.y, H.x - m.x);
      const half = (MAOU_ENERGYBALL_COUNT - 1) / 2;
      const beams = Array.from({ length: MAOU_ENERGYBALL_COUNT }, (_, i) => {
        const a = angle + (i - half) * MAOU_ENERGYBALL_SPREAD;
        return { tx: m.x + Math.cos(a) * 700, ty: m.y + Math.sin(a) * 700 };
      });
      return { kind: 'bossEnergyBall', facing: lookHero(), x: m.x, y: m.y, beams, dmg: MAOU_ENERGYBALL_DMG };
    }
    // lightRain: 지점은 이미 윈드업 시작 시점(cooldown 분기)에 m.areaPoints로 고정돼 있다.
    return {
      kind: 'bossLightRain',
      facing: lookHero(),
      points: m.areaPoints ?? [{ x: H.x, y: H.y }],
      radius: MAOU_LIGHTRAIN_RADIUS,
      dmg: MAOU_LIGHTRAIN_DMG,
    };
  }

  // active: 워프 중 — 몸통은 화면 밖(씬이 이미 옮겼다), 시간만 흘려보낸다.
  if (m.bossPhase === 'active') {
    m.bossT = (m.bossT ?? 0) - dt;
    if (m.bossT > 0) return { kind: 'idle', facing: lookHero() };
    m.bossPhase = 'recover';
    m.bossT = MAOU_RECOVER_T;
    // 재등장 좌표 — 용사 기준 무작위 방향으로 MAOU_WARP_REAPPEAR_DIST만큼. 아레나 경계는 씬이 클램프한다.
    const ang = rnd() * Math.PI * 2;
    const rx = H.x + Math.cos(ang) * MAOU_WARP_REAPPEAR_DIST;
    const ry = H.y + Math.sin(ang) * MAOU_WARP_REAPPEAR_DIST;
    return { kind: 'bossWarpEnd', facing: lookHero(), x: rx, y: ry };
  }

  if (m.bossPhase === 'recover') {
    m.bossT = (m.bossT ?? 0) - dt;
    if (m.bossT > 0) return { kind: 'idle', facing: lookHero() };
    m.bossPhase = 'cooldown';
    m.bossT = MAOU_PATTERN_CD;
    return { kind: 'idle', facing: lookHero() };
  }

  // cooldown(+ 최초 미초기화 상태) — 다음 패턴을 기다리며 적당한 거리를 유지한다.
  m.bossT = (m.bossT ?? 0) - dt;
  const d = Math.hypot(H.x - m.x, H.y - m.y);
  if (m.bossT > 0) {
    const idealDist = 220;
    if (Math.abs(d - idealDist) > 50) {
      const vx = ((H.x - m.x) / d) * m.def.speed * (d < idealDist ? -0.5 : 1);
      const vy = ((H.y - m.y) / d) * m.def.speed * (d < idealDist ? -0.5 : 1);
      m.x += vx * dt;
      m.y += vy * dt;
      return { kind: 'move', facing: facingOf(vx, vy) ?? 'south' };
    }
    return { kind: 'idle', facing: lookHero() };
  }

  // HP 관문 확인 — 무작위 패턴 뽑기보다 우선한다. 임계값 하나당 딱 한 번만 발동(warpPhase로 추적).
  // 내림차순 배열이라 낮은 HP일수록 여러 임계값을 동시에 만족한다(예: 20%면 60%·30% 둘 다) — "몇 개나
  // 넘었는가"(crossedCount)를 warpPhase와 비교해야 한다. findIndex는 항상 첫(가장 관대한) 항목만
  // 찾아서 이미 60%를 쓴 뒤 30%까지 떨어져도 재발동을 못 잡는 버그가 났었다.
  const hpRatio = m.hp / m.def.hp;
  const crossedCount = MAOU_WARP_HP_THRESHOLDS.filter((t) => hpRatio <= t).length;
  let pattern: BossPattern;
  if (crossedCount > (m.warpPhase ?? 0)) {
    pattern = 'warp';
    m.warpPhase = crossedCount; // 한 프레임에 여러 임계값을 한꺼번에 넘어도 이번엔 1회만(가장 깊은 단계로 점프)
  } else {
    // energyBall 45% · lightRain 30% · meteor 25% — 메테오는 셋 중 가장 아프고 느려서(윈드업 2초)
    // "가끔 나오는 대형기" 정도 비중으로 낮춰뒀다. 매번 나오면 위협감이 무뎌진다.
    const r = rnd();
    pattern = r < 0.45 ? 'energyBall' : r < 0.75 ? 'lightRain' : 'meteor';
  }
  const windup =
    pattern === 'energyBall'
      ? MAOU_ENERGYBALL_WINDUP
      : pattern === 'lightRain'
        ? MAOU_LIGHTRAIN_WINDUP
        : pattern === 'meteor'
          ? MAOU_METEOR_WINDUP
          : MAOU_WARP_WINDUP;
  m.bossPattern = pattern;
  m.bossPhase = 'windup';
  m.bossT = windup;

  if (pattern === 'meteor') {
    // 공간 가르기(spaceSlash)와 같은 이유로 일반 bossTelegraph 대신 전용 intent를 쓴다 — 씬이
    // "저지 데미지 얼마나 필요한지"까지 보여줘야 해서 pattern/windup만으로는 정보가 부족하다.
    m.channelDamageTaken = 0;
    return { kind: 'bossMeteorCharge', facing: lookHero(), x: m.x, y: m.y, threshold: MAOU_METEOR_THRESHOLD };
  }

  if (pattern === 'lightRain') {
    // 지점을 지금(윈드업 시작) 고정 — 하나는 반드시 용사 현재 위치, 나머지는 그 주변에 흩뿌린다.
    const points = [{ x: H.x, y: H.y }];
    for (let i = 1; i < MAOU_LIGHTRAIN_COUNT; i++) {
      const ang = rnd() * Math.PI * 2;
      const r2 = MAOU_LIGHTRAIN_SCATTER_MIN + rnd() * (MAOU_LIGHTRAIN_SCATTER_MAX - MAOU_LIGHTRAIN_SCATTER_MIN);
      points.push({ x: H.x + Math.cos(ang) * r2, y: H.y + Math.sin(ang) * r2 });
    }
    m.areaPoints = points;
    return { kind: 'bossTelegraph', facing: lookHero(), pattern, windup, areaPoints: points };
  }
  return { kind: 'bossTelegraph', facing: lookHero(), pattern, windup };
}

// ── 화살 ── ('travel'=이동 계속 · {hit}=용사 피격 후 소멸 · 'expire'=빗나가 소멸)
export type ArrowResult = 'travel' | { hit: number } | 'expire';
export function stepArrow(a: Arrow, hero: HeroEntity, dt: number): ArrowResult {
  const d = dist(a, { x: a.tx, y: a.ty });

  // 비행 중 충돌 체크 (검기 등)
  if (a.checkMidair) {
    const heroDistance = Math.hypot(a.x - hero.x, a.y - hero.y);
    if (heroDistance < ARROW_HERO_HIT * 1.5) {
      // 검기는 범위가 더 넓음
      return { hit: a.dmg };
    }
  }

  if (d < ARROW_REACH) {
    return Math.hypot(a.tx - hero.x, a.ty - hero.y) < ARROW_HERO_HIT ? { hit: a.dmg } : 'expire';
  }
  const speed = a.speed ?? ARROW_SPEED; // 발사체별 속도 사용, 없으면 기본 화살 속도
  a.x += ((a.tx - a.x) / d) * speed * dt;
  a.y += ((a.ty - a.y) / d) * speed * dt;
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
