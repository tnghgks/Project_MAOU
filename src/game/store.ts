import { createStore } from 'zustand/vanilla';
import { UPGRADES, upgradeCost, type UpgradeKey } from '../data/upgrades.ts';
import type { Card } from '../data/cards.ts';
import type { SkillId } from '../data/skills.ts';
import type { MonsterId } from '../data/monsters.ts';

// 단일 스토어: Phaser는 gameState()로 읽고 액션으로 사건 단위 쓰기, React는 useStore(gameStore, sel)로 구독.
// 매 프레임 값(viewers 실시간/hype/timer)은 여기 안 넣는다 — 씬 로컬에서 HudScene가 렌더. viewers는 스로틀 반영만.

export interface HeroStats {
  maxHp: number;
  atk: number;
  atkSpd: number;
  speed: number;
  range: number;
}
export type Phase = 'boot' | 'title' | 'broadcast' | 'result' | 'upgrade' | 'ending';
// clear = 목표 후원 달성 · death = 용사 사망 · abandoned = 시청자 이탈로 방송 종료
export type RunOutcome = 'clear' | 'death' | 'abandoned';
export interface RunSummary {
  outcome: RunOutcome;
  peakViewers: number;
  totalDonated: number;
  kills: number;
}
export interface Records {
  bestViewers: number;
  bestGold: number;
}

export interface GameState {
  phase: Phase;
  gold: number;
  episode: number;
  hero: HeroStats;
  upgradeLevels: Record<UpgradeKey, number>;
  skills: SkillId[]; // 해금으로 누적 (영구)
  unlockedMonsters: MonsterId[];
  records: Records;
  viewers: number; // React 채팅 헤더용 (스로틀 반영)
  lastRun: RunSummary;

  setPhase: (phase: Phase) => void;
  setViewers: (viewers: number) => void;
  addGold: (n: number) => void;
  nextEpisode: () => void;
  resetRun: () => void;
  applyUpgrade: (key: UpgradeKey) => boolean;
  grantCard: (card: Card) => void;
  learnSkill: (id: SkillId, cost: number) => boolean;
  recordRun: (run: RunSummary) => void;
}

const SAVE_KEY = 'maou.save';
export const BASE_HERO: HeroStats = { maxHp: 100, atk: 10, atkSpd: 1.0, speed: 100, range: 60 }; // GDD 3-6 1화 시작값

// 용사 종합 전투력 — 시작값을 1.00으로 보는 배수. 요청 난이도와 화면 표시가 이 하나만 본다.
// 가중 기하평균이라 지수 합이 1 → 모든 스탯이 x배면 전투력도 x배. 곱이라 한 스탯만 몰아줘도 폭주하지 않는다.
// ponytail: 가중치 knob — 화력 0.4 / 생존 0.35 / 사거리 0.15 / 기동 0.1
export function heroPower(h: HeroStats): number {
  const p =
    Math.pow((h.atk * h.atkSpd) / (BASE_HERO.atk * BASE_HERO.atkSpd), 0.4) *
    Math.pow(h.maxHp / BASE_HERO.maxHp, 0.35) *
    Math.pow(h.range / BASE_HERO.range, 0.15) *
    Math.pow(h.speed / BASE_HERO.speed, 0.1);
  return Math.round(p * 100) / 100;
}
const freshRun = () => ({
  gold: 0,
  episode: 1,
  hero: { ...BASE_HERO },
  upgradeLevels: { hp: 0, atk: 0, atkSpd: 0, speed: 0, range: 0 },
  skills: ['낙뢰'] as SkillId[], // 스킬은 런 한정 — 사망/타이틀 복귀 시 세이브에서도 지워진다
  viewers: 0,
});

export const gameStore = createStore<GameState>()((set, get) => ({
  phase: 'boot',
  ...freshRun(),
  unlockedMonsters: ['slime', 'archer', 'golem'],
  records: { bestViewers: 0, bestGold: 0 },
  lastRun: { outcome: 'clear', peakViewers: 0, totalDonated: 0, kills: 0 },

  setPhase: (phase) => set({ phase }),
  setViewers: (viewers) => set({ viewers }),
  addGold: (n) => set({ gold: get().gold + n }),
  nextEpisode: () => set({ episode: get().episode + 1 }),
  resetRun: () => {
    set({ ...freshRun() });
    saveGame(); // 초기화된 스킬을 localStorage에도 반영
  },

  // 강화 구매: 골드 차감 + 스탯 반영 (기존 UpgradeScene.buy 로직 흡수)
  applyUpgrade: (key) => {
    const { gold, upgradeLevels, hero } = get();
    const cost = upgradeCost(key, upgradeLevels[key]);
    if (gold < cost) return false;
    const u = UPGRADES[key];
    set({
      gold: gold - cost,
      hero: { ...hero, [u.stat]: Math.round((hero[u.stat] + u.delta) * 100) / 100 },
      upgradeLevels: { ...upgradeLevels, [key]: upgradeLevels[key] + 1 },
    });
    return true;
  },

  // 도네이션 카드 보상: 골드 없이 스탯만 (upgradeLevels는 안 올린다 — 상점 가격은 구매 이력만 따라간다)
  grantCard: (card) => {
    const hero = get().hero;
    set({ hero: { ...hero, [card.stat]: Math.round((hero[card.stat] + card.delta) * 100) / 100 } });
  },

  learnSkill: (id, cost) => {
    if (get().gold < cost) return false;
    set({ gold: get().gold - cost, skills: [...get().skills, id] });
    saveGame(); // 스킬 영구 해금
    return true;
  },

  // 방송 종료 정산 (기존 endRun의 records/save 흡수)
  recordRun: ({ outcome, peakViewers, totalDonated, kills }) => {
    const r = get().records;
    set({
      lastRun: { outcome, peakViewers: Math.floor(peakViewers), totalDonated, kills },
      records: {
        bestViewers: Math.max(r.bestViewers, Math.floor(peakViewers)),
        bestGold: Math.max(r.bestGold, Math.floor(get().gold)),
      },
    });
    saveGame();
  },
}));

export const gameState = gameStore.getState; // Phaser 직통 접근

// localStorage: 해금 목록 + 최고기록만 (GDD 8장)
export function saveGame() {
  const ls = globalThis.localStorage;
  if (!ls) return;
  const { skills, unlockedMonsters, records } = gameStore.getState();
  try {
    ls.setItem(SAVE_KEY, JSON.stringify({ skills, unlockedMonsters, records }));
  } catch {
    /* 프라이빗 모드 등 */
  }
}

export function loadGame() {
  const ls = globalThis.localStorage;
  if (!ls) return;
  try {
    const raw = ls.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    const patch: Partial<GameState> = {};
    if (Array.isArray(d.skills)) patch.skills = d.skills;
    if (Array.isArray(d.unlockedMonsters)) patch.unlockedMonsters = d.unlockedMonsters;
    if (d.records) patch.records = d.records;
    gameStore.setState(patch);
  } catch {
    /* 손상된 세이브 무시 */
  }
}
