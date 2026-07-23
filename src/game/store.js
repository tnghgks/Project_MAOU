import { createStore } from 'zustand/vanilla';
import { UPGRADES, upgradeCost } from '../data/upgrades.js';

// 단일 스토어: Phaser는 gameState()로 읽고 액션으로 사건 단위 쓰기, React는 useStore(gameStore, sel)로 구독.
// 매 프레임 값(viewers 실시간/hype/mp/timer)은 여기 안 넣는다 — 씬 로컬에서 HudScene가 렌더. viewers는 스로틀 반영만.

const SAVE_KEY = 'maou.save';
const BASE_HERO = { maxHp: 100, atk: 10, atkSpd: 1.0, speed: 100, range: 60 }; // GDD 3-6 1화 시작값
const freshRun = () => ({
  gold: 0,
  episode: 1,
  hero: { ...BASE_HERO },
  upgradeLevels: { hp: 0, atk: 0, atkSpd: 0, speed: 0, range: 0 },
});

export const gameStore = createStore((set, get) => ({
  phase: 'boot', // boot | title | broadcast | result | upgrade | ending
  ...freshRun(),
  skills: ['낙뢰'], // 해금으로 누적 (영구)
  unlockedMonsters: ['slime', 'archer', 'golem'],
  records: { bestViewers: 0, bestGold: 0 },
  viewers: 0, // React 채팅 헤더용 (스로틀 반영)
  lastRun: { died: false, peakViewers: 0, totalDonated: 0, kills: 0 },

  set,
  setPhase: (phase) => set({ phase }),
  setViewers: (viewers) => set({ viewers }),
  addGold: (n) => set({ gold: get().gold + n }),
  nextEpisode: () => set({ episode: get().episode + 1 }),
  resetRun: () => set({ ...freshRun() }),

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

  learnSkill: (id, cost) => {
    if (get().gold < cost) return false;
    set({ gold: get().gold - cost, skills: [...get().skills, id] });
    saveGame(); // 스킬 영구 해금
    return true;
  },

  // 방송 종료 정산 (기존 endRun의 records/save 흡수)
  recordRun: ({ died, peakViewers, totalDonated, kills }) => {
    const r = get().records;
    set({
      lastRun: { died, peakViewers: Math.floor(peakViewers), totalDonated, kills },
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
  try { ls.setItem(SAVE_KEY, JSON.stringify({ skills, unlockedMonsters, records })); } catch { /* 프라이빗 모드 등 */ }
}

export function loadGame() {
  const ls = globalThis.localStorage;
  if (!ls) return;
  try {
    const raw = ls.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    const patch = {};
    if (Array.isArray(d.skills)) patch.skills = d.skills;
    if (Array.isArray(d.unlockedMonsters)) patch.unlockedMonsters = d.unlockedMonsters;
    if (d.records) patch.records = d.records;
    gameStore.setState(patch);
  } catch { /* 손상된 세이브 무시 */ }
}
