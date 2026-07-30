import type Phaser from 'phaser';
import type { HeroStats } from './store.ts';
import type { MonsterId, MonsterDef } from '../data/monsters.ts';
import type { Facing } from './battleSim.ts';

// 전투 중 시뮬레이션 엔티티 타입 (씬 로컬). 스토어의 HeroStats(영구 스탯)와 별개로
// 매 프레임 변이되는 런타임 상태(x/y/hp/쿨다운)를 담는다 — 의도적 이중 모델(React 리렌더 회피).
export interface HeroEntity {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  atkSpd: number;
  speed: number;
  range: number;
  // 도네이션 카드 확장 스탯 — HeroStats와 1:1, spawnHero가 복사한다.
  defense: number;
  dodge: number;
  critChance: number;
  critMult: number;
  lifesteal: number;
  knockback: number;
  regenFlat: number;
  goldBonus: number;
  atkCd: number;
  retreatT: number; // 자동 AI 전용 — 수동 조작 중엔 안 쓴다
  retreatCd: number;
  dashT: number; // 대시 남은 시간 (용사 모드)
  dashCd: number;
  invulnT: number; // 무적 남은 시간 — hurtHero가 읽는다
  safeT: number; // 근접 몬스터 0마리 지속 시간 — REGEN_DELAY 넘어야 자동 회복 시작
  regenTickT: number; // 응급 처치(regenFlat) 고정 회복까지 남은 시간 — 안전 상태 벗어나면 리셋
  // 특성 카드 전용 런타임 상태 — traits.ts 파생 함수가 읽고 BattleScene이 프레임마다 갱신.
  atkCount: number; // 누적 공격 횟수 — 3번째/10번째마다 발동하는 특성용
  moveBuffStack: number; // 무한의 검무: 이동 중 쌓이는 공속·이속 가산 배율(0~0.5)
  moveIdleT: number; // 무한의 검무: 정지 지속 시간 — 1초 넘으면 스택 초기화
  timeSlashT: number; // 시공간 베기: 남은 피해 증폭 창(초)
  firstAtkDone: boolean; // 거합도: 이번 전투 첫 공격을 이미 썼는가
  phoenixUsed: boolean; // 불사조의 깃털: 이번 런에 이미 발동했는가
  /** 마지막으로 향한 방향. 용사 모드 공격 판정의 기준이라 시뮬이 들고 있어야 한다 —
   *  씬의 facingDir은 서/동을 flipX로 합쳐 3방향이라 여기서 쓸 수 없다. */
  facing: Facing;
}

export interface MonsterEntity {
  type: MonsterId;
  def: MonsterDef;
  hp: number;
  x: number;
  y: number;
  atkCd: number;
  spr: Phaser.GameObjects.Sprite;
  /** 실제로 로드된 아틀라스 키. 스폰 시점에 확정한다 — def.char가 있어도 파일이 없으면
   *  undefined가 되고, 그때 spr은 대체 상자다. 매 프레임 textures.exists를 다시 묻지 않으려고 캐시한다. */
  char?: string;
  dead?: boolean;
  stunT?: number; // 기절/빙결 남은 시간 — stepMonster가 이 동안 AI를 건너뛴다
  dotT?: number; // 화상/출혈 남은 시간
  dotDps?: number; // 위 dot의 초당 피해
}

export interface Arrow {
  x: number;
  y: number;
  tx: number;
  ty: number;
  spr: Phaser.GameObjects.Image;
  dmg: number;
}

// 스토어 스탯 → 전투 엔티티. 이중 모델 브리지를 한 곳에 모아 create()의 수동 필드 복사를 없앤다.
export function spawnHero(s: HeroStats, at: { x: number; y: number }): HeroEntity {
  return {
    x: at.x,
    y: at.y,
    hp: s.maxHp,
    maxHp: s.maxHp,
    atk: s.atk,
    atkSpd: s.atkSpd,
    speed: s.speed,
    range: s.range,
    defense: s.defense,
    dodge: s.dodge,
    critChance: s.critChance,
    critMult: s.critMult,
    lifesteal: s.lifesteal,
    knockback: s.knockback,
    regenFlat: s.regenFlat,
    goldBonus: s.goldBonus,
    atkCd: 0,
    retreatT: 0,
    retreatCd: 0,
    dashT: 0,
    dashCd: 0,
    invulnT: 0,
    safeT: 0,
    regenTickT: 0,
    atkCount: 0,
    moveBuffStack: 0,
    moveIdleT: 0,
    timeSlashT: 0,
    firstAtkDone: false,
    phoenixUsed: false,
    facing: 'south',
  };
}

// 스킬이 전투에 개입하기 위한 좁은 표면 — 스킬 데이터가 BattleScene 구체 클래스에 의존하지 않도록.
// BattleScene.castSkill이 씬 헬퍼(hitFx/freezeUntil/time 등)를 백엔드로 이 객체를 구성해 넘긴다.
export interface SkillContext {
  readonly hero: HeroEntity;
  readonly monsters: readonly MonsterEntity[];
  hit(m: MonsterEntity, dmg: number): void; // 데미지 + 타격 이펙트
  fxCircle(x: number, y: number, r: number): void; // 위치 강타 연출
  heal(ratio: number): void; // hero.hp = min(maxHp, hp + maxHp*ratio)
  freeze(ms: number): void; // 몬스터 시간 정지
  now(): number; // 씬 시계(ms)
  randBetween(a: number, b: number): number; // 정수 난수 [a, b]
}
