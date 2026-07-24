import type Phaser from 'phaser';
import type { HeroStats } from './store.ts';
import type { MonsterId, MonsterDef } from '../data/monsters.ts';

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
  atkCd: number;
  retreatT: number;
  retreatCd: number;
}

export interface MonsterEntity {
  type: MonsterId;
  def: MonsterDef;
  hp: number;
  x: number;
  y: number;
  atkCd: number;
  spr: Phaser.GameObjects.Image;
  dead?: boolean;
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
    atkCd: 0,
    retreatT: 0,
    retreatCd: 0,
  };
}

// 스킬이 전투에 개입하기 위한 좁은 표면 — 스킬 데이터가 BattleScene 구체 클래스에 의존하지 않도록.
// BattleScene.fireSkill이 씬 헬퍼(hitFx/freezeUntil/time 등)를 백엔드로 이 객체를 구성해 넘긴다.
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
