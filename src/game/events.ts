import Phaser from 'phaser';
import type { DonationTier, SkillOutcome, ViewerAlert } from '../formulas.ts';
import type { Card } from '../data/cards.ts';

// 순간적으로 터지는 사건 버스 (지속값은 store). 이벤트 계약은 BusEvents가 강제.
//
// 도네이션 1회 = 한 사이클, 진행 주체는 React(DonationEvent):
//   Battle ─donation:arrive→ React (Battle/Hud 일시정지)
//     └ 대박이면 React ─rhythm:start→ RhythmLane ─rhythm:result→ React(카드 등급) + Battle(스킬 예약)
//   React ─donation:end→ Battle (강화 적용 + 재개)
export interface ChatLine {
  who: string;
  msg: string;
  color: string;
}
export interface Donation {
  amount: number;
  donor: string;
  jackpot: boolean;
  tier: DonationTier; // 효과음 단계. 금액만으로는 판정할 수 없어(업그레이드 가격 연동) emit 쪽에서 계산해 싣는다
}

// HUD(React InfoLayer) 전용 스냅샷 — BattleScene 인스턴스 전용 필드(매 프레임 변함)만 담는다.
// 시청자수·골드·mode처럼 store에 이미 있는 값은 여기 안 넣는다(중복 전달 방지, useStore로 직접 구독).
// 스로틀 주기(HUD_SYNC_INTERVAL)로만 쏘아 React 리렌더가 프레임마다 터지지 않게 한다.
export interface HudTick {
  D: number; // 위험도(흥분도) 0~1
  tierLabel: string;
  tierColor: number; // 0xRRGGBB
  alert: ViewerAlert;
  critical: boolean;
  critT: number;
  modeCd: number; // 시점 전환 쿨타임 잔여
  boss: { name: string; hp: number; maxHp: number } | null;
  stageGold: number;
  target: number;
  req: { label: string; pct: number; t: number } | null;
}

export interface BusEvents {
  'chat:line': ChatLine;
  'donation:arrive': Donation;
  'donation:end': { card: Card };
  'rhythm:start': null;
  'rhythm:result': SkillOutcome;
  'combo:hit': { combo: number };
  'combo:reset': null;
  'battle:pause': null;
  'battle:resume': null;
  'hud:tick': HudTick;
  'mode:toggle': null; // React 시점 전환 버튼 → BattleScene.switchMode()
}

// ponytail: Phaser EventEmitter는 제네릭이 없어 as로 타입만 씌움 — 런타임은 그대로
interface TypedBus {
  on<K extends keyof BusEvents>(event: K, fn: (payload: BusEvents[K]) => void, context?: unknown): this;
  off<K extends keyof BusEvents>(event: K, fn?: (payload: BusEvents[K]) => void, context?: unknown): this;
  emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]): boolean;
}

export const bus = new Phaser.Events.EventEmitter() as unknown as TypedBus;

// 씬이 bus를 구독하는 유일한 경로. shutdown(씬 정지)과 destroy(game.destroy — HMR/언마운트) 양쪽에서 푼다.
// game.destroy는 shutdown을 쏘지 않는다: shutdown만 걸면 죽은 씬이 계속 콜백을 받아
// this.scene.manager === null로 던지고, 그 예외가 뒤이은 살아있는 씬의 핸들러까지 막는다.
export function busBind<K extends keyof BusEvents>(
  scene: Phaser.Scene,
  event: K,
  fn: (payload: BusEvents[K]) => void,
): void {
  bus.on(event, fn);
  const off = () => {
    bus.off(event, fn);
  };
  scene.events.once('shutdown', off);
  scene.events.once('destroy', off);
}
