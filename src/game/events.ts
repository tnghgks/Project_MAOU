import Phaser from 'phaser';
import type { DonationTier, SkillOutcome, ViewerAlert } from '../formulas.ts';
import type { Card } from '../data/cards.ts';
import type { WaveEntry } from '../data/waves.ts';
import type { SkillId } from '../data/skills.ts';
import type { ShopLayout } from '../data/merchant.ts';
import type { BossPattern } from './battleSim.ts';

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
  message: string; // 트위치풍 알림에 얹히는 후원 한마디 (data/chat.ts DONATION_MESSAGES)
}

// HUD(React InfoLayer) 전용 스냅샷 — BattleScene 인스턴스 전용 필드(매 프레임 변함)만 담는다.
// 시청자수·골드처럼 store에 이미 있는 값은 여기 안 넣는다(중복 전달 방지, useStore로 직접 구독).
// 스로틀 주기(HUD_SYNC_INTERVAL)로만 쏘아 React 리렌더가 프레임마다 터지지 않게 한다.
export interface HudTick {
  D: number; // 위험도(흥분도) 0~1
  tierLabel: string;
  tierColor: number; // 0xRRGGBB
  alert: ViewerAlert;
  critical: boolean;
  critT: number;
  boss: { name: string; hp: number; maxHp: number } | null;
  stageGold: number;
  target: number;
  req: { label: string; pct: number; t: number } | null;
  /** 웨이브 진행 상황. null = 웨이브가 안 도는 구간(보스전·최종화) — 시계가 --:--로 멈춘다.
   *  index는 지금까지 투입한 웨이브 수, t는 다음 투입까지 남은 초, next는 그때 나올 구성이다.
   *  소비처가 둘로 갈린다: 상단바 시계(InfoLayer)가 t·index를, 하단 예고(SummonPanel)가 next를 쓴다. */
  wave: { index: number; t: number; next: WaveEntry[] } | null;
  skillCd: Partial<Record<SkillId, number>>; // QWER 쿨타임 잔여 — React SummonPanel이 스킬 칸에 표시
  dashCd: number; // Shift 대시 쿨타임 잔여 — 위와 같은 이유로 SummonPanel이 표시
}

export interface BusEvents {
  'chat:line': ChatLine;
  'donation:arrive': Donation;
  'donation:end': { card: Card | null }; // null = 리듬 완전 실패(penalty) — 보상 없이 재개만
  'rhythm:start': null;
  'rhythm:result': SkillOutcome;
  'combo:hit': { combo: number };
  'combo:reset': null;
  'battle:pause': null;
  'battle:resume': null;
  'hud:tick': HudTick;
  'pause:toggle': null; // React(ESC/일시정지 버튼) → BattleScene: scene.pause()/resume() 토글 요청
  // 다음 웨이브 즉시 호출. React(SummonPanel 버튼) 또는 SPACE 키 → BattleScene.callWaveNow.
  // 2026-08-09 웨이브 편성 개편으로 'summon:request'(몬스터 한 마리 직접 소환)를 대체했다 —
  // 방송 중 소환 관련 조작은 이제 이 하나뿐이다.
  'wave:call': null;
  'skill:request': { index: number }; // React(SummonPanel 버튼) 또는 QWER 키 → BattleScene.castSkill
  // 개발 리모콘(ui/DevPanel.tsx) 전용. 프로덕션 빌드에선 패널이 통째로 빠져 아무도 emit하지 않는다 —
  // 받는 쪽은 그대로 둬도 죽은 코드일 뿐이라 import.meta.env.DEV 가드를 씬에만 건다.
  'dev:shop-layout': ShopLayout; // 상인 위치·크기·어둠을 게임 돌린 채로 맞춘다
  'dev:reroll-stock': null; // 상인 재고를 다시 굴린다 (등급 조합 확인용)
  'dev:spawn-boss': null; // 보스를 강제로 소환한다 (보스 페이즈 테스트용)
  'dev:kill-boss': null; // 보스를 즉시 처치한다 (보스 페이즈 스킵용)
  'dev:boss-pattern': { pattern: BossPattern }; // 보스 패턴을 강제로 실행한다 (베르하르트 패턴 테스트용)
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
