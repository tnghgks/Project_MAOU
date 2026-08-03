import { createStore } from 'zustand/vanilla';
import { UPGRADES, upgradeCost, type UpgradeKey } from '../data/upgrades.ts';
import { stageViewerFloor } from '../data/progression.ts';
import type { Card } from '../data/cards.ts';
import { resolveMods } from '../data/cardStats.ts';
import type { SkillId } from '../data/skills.ts';
import type { TraitId } from '../data/traits.ts';
import type { MonsterId } from '../data/monsters.ts';
import type { StatMod } from '../data/cards.ts';

// 단일 스토어: Phaser는 gameState()로 읽고 액션으로 사건 단위 쓰기, React는 useStore(gameStore, sel)로 구독.
// 매 프레임 값(viewers 실시간/hype/timer)은 여기 안 넣는다 — 씬 로컬 필드 + hud:tick 버스로 React InfoLayer가 렌더. viewers는 스로틀 반영만.

export interface HeroStats {
  maxHp: number;
  atk: number;
  atkSpd: number;
  speed: number;
  range: number;
  // 도네이션 카드 전용 확장 스탯 (상점 강화 5종엔 없다) — 전부 %/배율, 기본값 0.
  defense: number; // 받는 피해 감소율(%)
  dodge: number; // 회피 확률(%)
  critChance: number; // 치명타 확률(%)
  critMult: number; // 치명타 추가 피해 배율(%) — 기본 배율(CRIT_BASE_MULT)에 가산
  lifesteal: number; // 가한 피해 흡혈 비율(%)
  knockback: number; // 피격 시 주변 몬스터 밀쳐낼 확률(%)
  regenFlat: number; // 비전투 회복 시 5초마다 추가로 회복하는 고정 체력량
  goldBonus: number; // 처치 골드 보너스(%)
}
export type Phase = 'boot' | 'title' | 'broadcast' | 'result' | 'upgrade' | 'ending';
// 시점 전환(C키): maou = 소환 카드 조작 · hero = 용사 직접 조작. 같은 BattleScene을 이어받는다.
export type ViewMode = 'maou' | 'hero';
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
  traits: TraitId[]; // 도네 카드로만 획득, 런 한정 (세이브에 안 남는다)
  unlockedMonsters: MonsterId[];
  records: Records;
  viewers: number; // React 채팅 헤더용 (스로틀 반영)
  mode: ViewMode; // 시점 — Phaser 씬은 gameState()로, React는 useStore로 읽는다
  lastRun: RunSummary;
  cuts: string[]; // 재생 대기 중인 컷씬 id 큐 (CutsceneView가 소비)

  setPhase: (phase: Phase) => void;
  toggleMode: () => ViewMode;
  playCuts: (ids: string | string[], after?: () => void) => void;
  advanceCut: () => void;
  setViewers: (viewers: number) => void;
  addGold: (n: number) => void;
  nextEpisode: () => void;
  resetRun: () => void;
  applyUpgrade: (key: UpgradeKey) => boolean;
  applyStatMods: (mods: readonly StatMod[]) => void;
  grantCard: (card: Card) => void;
  grantTrait: (id: TraitId) => void;
  learnSkill: (id: SkillId, cost: number) => boolean;
  recordRun: (run: RunSummary) => void;
}

const SAVE_KEY = 'maou.save';
// GDD 3-6 1화 시작값. 확장 스탯은 전부 도네이션 카드로만 오른다 — 시작은 항상 0.
export const BASE_HERO: HeroStats = {
  maxHp: 70,
  atk: 10,
  atkSpd: 0.7,
  speed: 60,
  range: 60,
  defense: 0,
  dodge: 0,
  critChance: 0,
  critMult: 0,
  lifesteal: 0,
  knockback: 0,
  regenFlat: 0,
  goldBonus: 0,
};

// 사거리 상한 (피드백 2026-07-31): 업그레이드·카드·특성이 전부 사거리를 건드릴 수 있어 무상한이면
// 사기가 된다. "창 정도 리치"를 현실적 최대로 보고 기본값의 3배로 고정 — 엑스칼리버의 화면 절반
// 오버라이드(BattleScene.applyTraitOneShot)도 결국 이 상한에 걸린다(applyStatMods가 clampHero로 자름).
export const RANGE_CAP = BASE_HERO.range * 3;

// hero 전체를 손대는 두 액션(applyUpgrade/applyStatMods)이 공유하는 안전장치 — 상한선은 여기 한 곳에서만 자른다.
function clampHero(h: HeroStats): HeroStats {
  return h.range > RANGE_CAP ? { ...h, range: RANGE_CAP } : h;
}

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
  traits: [] as TraitId[],
  viewers: 0,
  mode: 'maou' as ViewMode, // 방송은 항상 마왕 시점에서 시작
});

// 컷씬 큐가 다 비면 호출할 후속 동작 (씬 재개·페이즈 전환). 스토어엔 값만 남긴다.
let afterCuts: (() => void) | null = null;

export const gameStore = createStore<GameState>()((set, get) => ({
  phase: 'boot',
  ...freshRun(),
  unlockedMonsters: ['slime', 'archer', 'golem'],
  records: { bestViewers: 0, bestGold: 0 },
  lastRun: { outcome: 'clear', peakViewers: 0, totalDonated: 0, kills: 0 },
  cuts: [],

  setPhase: (phase) => set({ phase }),

  // 시점 전환. 전환 후 모드를 돌려줘 호출부(BattleScene)가 한 번 더 읽지 않게 한다.
  toggleMode: () => {
    const mode: ViewMode = get().mode === 'maou' ? 'hero' : 'maou';
    set({ mode });
    return mode;
  },

  // 컷씬 재생 요청. after는 큐가 끝났을 때(스킵으로 끝나도) 정확히 한 번 실행된다.
  playCuts: (ids, after) => {
    afterCuts = after ?? null;
    set({ cuts: typeof ids === 'string' ? [ids] : [...ids] });
  },
  advanceCut: () => {
    const rest = get().cuts.slice(1);
    set({ cuts: rest });
    if (rest.length) return;
    const f = afterCuts;
    afterCuts = null;
    f?.();
  },
  setViewers: (viewers) => set({ viewers }),
  addGold: (n) => set({ gold: get().gold + n }),
  // 다음 화는 지난 화 최고 시청자수의 절반을 이어받는다 — 단, 다음 화 목표 골드가 요구하는
  // 최소 시청자 규모(stageViewerFloor) 밑으로는 안 내려간다 (BattleScene.create가 이 값을 읽는다).
  nextEpisode: () => {
    const ep = get().episode + 1;
    const carried = Math.floor(get().lastRun.peakViewers / 2);
    set({ episode: ep, viewers: Math.max(stageViewerFloor(ep), carried) });
  },
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
      hero: clampHero({ ...hero, [u.stat]: Math.round((hero[u.stat] + u.delta) * 100) / 100 }),
      upgradeLevels: { ...upgradeLevels, [key]: upgradeLevels[key] + 1 },
    });
    return true;
  },

  // mods 배열을 hero에 반영하는 범용 진입점 — 도네 카드(grantCard)뿐 아니라 특성 획득 시
  // 1회성 스탯 보정(거인의 대검·엑스칼리버)도 이 경로를 공유한다.
  applyStatMods: (mods) => {
    const hero = get().hero;
    set({ hero: clampHero({ ...hero, ...resolveMods(mods, hero) }) });
  },

  // 도네이션 카드 보상: 골드 없이 스탯만 (upgradeLevels는 안 올린다 — 상점 가격은 구매 이력만 따라간다)
  // 특성 카드(mods 없음)는 grantTrait 경로를 타므로 여긴 mods가 있는 스탯 카드만 온다.
  grantCard: (card) => get().applyStatMods(card.mods),

  // 특성 획득. 중복은 무시 — 카드 풀에서 이미 빼지만 도착 순서가 꼬여도 두 번 안 붙게 한다.
  grantTrait: (id) => {
    const traits = get().traits;
    if (!traits.includes(id)) set({ traits: [...traits, id] });
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
