import Phaser from 'phaser';
import type { SkillOutcome } from '../formulas.ts';
import type { UpgradeKey } from '../data/upgrades.ts';

// 순간적으로 터지는 사건 버스 (지속값은 store). 이벤트 계약은 BusEvents가 강제.
// Phaser → React: 'chat:line' · 'donation:arrive' / Phaser(Rhythm) → Phaser(Battle): 'rhythm:result'
// React → Phaser: 'hero:upgraded' — 전투 중 상점 구매를 씬 로컬 hero에 반영
export interface ChatLine {
  who: string;
  msg: string;
  color: string;
}
export interface Donation {
  amount: number;
  donor: string;
}

interface BusEvents {
  'chat:line': ChatLine;
  'donation:arrive': Donation;
  'rhythm:result': SkillOutcome;
  'hero:upgraded': { key: UpgradeKey };
}

// ponytail: Phaser EventEmitter는 제네릭이 없어 as로 타입만 씌움 — 런타임은 그대로
interface TypedBus {
  on<K extends keyof BusEvents>(event: K, fn: (payload: BusEvents[K]) => void, context?: unknown): this;
  off<K extends keyof BusEvents>(event: K, fn?: (payload: BusEvents[K]) => void, context?: unknown): this;
  emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]): boolean;
}

export const bus = new Phaser.Events.EventEmitter() as unknown as TypedBus;
