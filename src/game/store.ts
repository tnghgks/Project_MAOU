import { createStore } from 'zustand/vanilla';
import { UPGRADES, upgradeCost, type UpgradeKey } from '../data/upgrades.ts';
import { stageViewerFloor } from '../data/progression.ts';
import { defaultLineup, type Lineup } from '../data/waves.ts';
import type { Card } from '../data/cards.ts';
import { resolveMods } from '../data/cardStats.ts';
import { SKILLS, type SkillId } from '../data/skills.ts';
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
  regen: number; // 초당 자동 회복량 — regenFlat과 달리 근처에 적이 있든 없든 항상 돈다
  goldBonus: number; // 처치 골드 보너스(%)
}
// lineup = 방송 전 웨이브 편성 화면. 방송(broadcast) 직전에 반드시 한 번 거친다 —
// 소환이 자동 웨이브가 된 뒤로 "이번 방송에 뭘 데려가나"가 유일한 사전 결정이라 페이즈를 따로 뒀다.
export type Phase = 'boot' | 'title' | 'lineup' | 'broadcast' | 'result' | 'upgrade' | 'ending';
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
  /** 도달한 최고 화. 타이틀 해금 도감이 몬스터/보스 공개 기준으로 쓴다 (런이 끝나도 남는다). */
  bestEpisode: number;
  /** 한 번이라도 배운 스킬. skills는 런 한정이라 리셋되지만 도감 기록은 남아야 한다. */
  learnedSkills: SkillId[];
  /** 실제로 등장을 본 보스. 화수로는 못 푼다 — 보스는 목표 골드를 채워야 나오므로
   *  "그 화에 도달"과 "그 보스를 봤다"가 다르다. 안 그러면 도감이 1화 보스를 미리 까발린다. */
  seenBosses: MonsterId[];
}

export interface GameState {
  phase: Phase;
  gold: number;
  episode: number;
  hero: HeroStats;
  upgradeLevels: Record<UpgradeKey, number>;
  /** 이번 방송에 데려갈 웨이브 편성 (data/waves.ts). 런 한정 — 세이브에 안 남는다.
   *  화가 바뀌어도 초기화하지 않는다: 지난 화 편성을 그대로 들고 편성 화면에 들어가 손보는 게
   *  매번 백지에서 다시 짜는 것보다 낫다 (예산은 커지기만 하므로 이월된 편성은 늘 유효하다). */
  lineup: Lineup;
  skills: SkillId[]; // 해금으로 누적 (영구)
  skillUses: Partial<Record<SkillId, number>>; // 현재 스테이지에서 각 스킬의 사용 횟수 (스테이지마다 리셋)
  traits: TraitId[]; // 도네 카드로만 획득, 런 한정 (세이브에 안 남는다)
  unlockedMonsters: MonsterId[];
  records: Records;
  viewers: number; // React 채팅 헤더용 (스로틀 반영)
  lastRun: RunSummary;
  cuts: string[]; // 재생 대기 중인 컷씬 id 큐 (CutsceneView가 소비)
  bossUp: boolean; // 보스 등장 여부 — BGM 전환용. 실체(BattleScene.boss)는 씬이 갖고 있고 여기엔 사실만 미러링한다
  // ── 설정 (런이 아니라 설정 — resetRun에 안 걸리고 세이브에 남는다) ──
  bgmOn: boolean; // BGM On/Off (상단바 스피커 버튼 = 음소거 토글)
  bgmVol: number; // BGM 음량 배율 0~1. 0이면 무음 — bgmOn과 별개(음소거/음량 분리)
  sfxVol: number; // 효과음 음량 배율 0~1. 파일별 기본 볼륨(sfx.ts VOLUME)에 곱해진다
  screenShake: boolean; // 화면 흔들림 연출. 끄면 BattleScene의 카메라 shake가 전부 무시된다
  // ── 개발 리모콘(ui/DevPanel.tsx) 전용 ──
  // true면 다음 방송이 보스 등장 게이지가 다 찬 상태로 시작한다 — BattleScene.create가 읽고 끈다.
  // 버스 이벤트가 아니라 상태인 이유: 페이즈를 방송으로 넘긴 뒤에야 씬이 시작돼서, 클릭 시점에
  // 쏜 이벤트는 받을 씬이 아직 없다. 세이브 대상이 아니고(saveGame은 화이트리스트),
  // freshRun에도 없어 resetRun이 지우지 않는다 — 쓰는 쪽에서 한 번 소비하고 끈다.
  devBossJump: boolean;

  setPhase: (phase: Phase) => void;
  setDevBossJump: (v: boolean) => void;
  setBossUp: (up: boolean) => void;
  recordBossSeen: (id: MonsterId) => void;
  toggleBgm: () => void;
  setBgmVol: (v: number) => void;
  setSfxVol: (v: number) => void;
  toggleScreenShake: () => void;
  clearSave: () => void;
  playCuts: (ids: string | string[], after?: () => void) => void;
  advanceCut: () => void;
  setLineup: (lineup: Lineup) => void;
  setViewers: (viewers: number) => void;
  addGold: (n: number) => void;
  nextEpisode: () => void;
  resetRun: () => void;
  applyUpgrade: (key: UpgradeKey) => boolean;
  applyStatMods: (mods: readonly StatMod[]) => void;
  grantCard: (card: Card) => void;
  grantTrait: (id: TraitId) => void;
  buyCard: (card: Card, cost: number) => boolean;
  learnSkill: (id: SkillId, cost: number) => boolean;
  useSkill: (id: SkillId) => boolean;
  resetSkillUses: () => void;
  recordRun: (run: RunSummary) => void;
}

const SAVE_KEY = 'maou.save';
// GDD 3-6 1화 시작값. 확장 스탯은 전부 도네이션 카드로만 오른다 — 시작은 항상 0.
export const BASE_HERO: HeroStats = {
  maxHp: 70,
  atk: 10,
  atkSpd: 0.7,
  // 2026-08-10 상향(+20%, 60 → 72): 웨이브가 통째로 밀려오는 구조에선 초기 기동력이 곧 생존력이다.
  // heroPower는 BASE_HERO를 분모로 쓰므로 시작 전투력 1.00 기준은 그대로다.
  speed: 72,
  range: 60,
  defense: 0,
  dodge: 0,
  critChance: 0,
  critMult: 0,
  lifesteal: 0,
  knockback: 0,
  regenFlat: 0,
  regen: 0,
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
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// 도감·기록의 초기 상태. 세이브 초기화(clearSave)와 구버전 세이브 병합(loadGame)이 같은 값을 본다.
const FRESH_RECORDS: Records = { bestViewers: 0, bestGold: 0, bestEpisode: 1, learnedSkills: [], seenBosses: [] };

// 설정 기본값. 음량은 배율이라 1이 "파일별 기본 볼륨 그대로"다.
const DEFAULT_SETTINGS = { bgmOn: true, bgmVol: 1, sfxVol: 1, screenShake: true };

const freshRun = () => ({
  gold: 0,
  episode: 1,
  hero: { ...BASE_HERO },
  lineup: defaultLineup(1), // 새 런은 1화 자동 편성에서 시작 — 편성 화면에서 곧바로 손볼 수 있다
  upgradeLevels: { hp: 0, atk: 0, atkSpd: 0, speed: 0, range: 0 },
  skills: ['낙뢰'] as SkillId[], // 스킬은 런 한정 — 사망/타이틀 복귀 시 세이브에서도 지워진다
  skillUses: {} as Partial<Record<SkillId, number>>, // 스테이지마다 리셋
  traits: [] as TraitId[],
  viewers: 0,
  bossUp: false,
});

// 컷씬 큐가 다 비면 호출할 후속 동작 (씬 재개·페이즈 전환). 스토어엔 값만 남긴다.
let afterCuts: (() => void) | null = null;

export const gameStore = createStore<GameState>()((set, get) => ({
  phase: 'boot',
  ...freshRun(),
  unlockedMonsters: ['slime', 'archer', 'golem'],
  records: { ...FRESH_RECORDS },
  lastRun: { outcome: 'clear', peakViewers: 0, totalDonated: 0, kills: 0 },
  cuts: [],
  ...DEFAULT_SETTINGS,
  devBossJump: false,

  setPhase: (phase) => set({ phase }),
  setDevBossJump: (devBossJump) => set({ devBossJump }),
  setBossUp: (bossUp) => set({ bossUp }),

  // 보스 등장 = 도감 해금. 잡았는지와 무관하다 — 등장 컷씬을 본 순간 이미 정체가 드러났다.
  recordBossSeen: (id) => {
    const r = get().records;
    if (r.seenBosses.includes(id)) return;
    set({ records: { ...r, seenBosses: [...r.seenBosses, id] } });
    saveGame();
  },
  toggleBgm: () => {
    set({ bgmOn: !get().bgmOn });
    saveGame(); // 소리 설정은 새로고침해도 유지되는 게 맞다
  },
  setBgmVol: (v) => {
    set({ bgmVol: clamp01(v) });
    saveGame();
  },
  setSfxVol: (v) => {
    set({ sfxVol: clamp01(v) });
    saveGame();
  },
  toggleScreenShake: () => {
    set({ screenShake: !get().screenShake });
    saveGame();
  },

  // 세이브 초기화 — 해금 도감·최고기록까지 전부 지운다. 설정(음량 등)은 지금 화면에 떠 있는 값이
  // 곧 사실이므로 유지하고 그대로 다시 저장한다.
  clearSave: () => {
    set({ records: { ...FRESH_RECORDS }, unlockedMonsters: ['slime', 'archer', 'golem'], ...freshRun() });
    saveGame();
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
  setLineup: (lineup) => set({ lineup }),
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

  // 고블린 상인에게서 카드 구매. 특성/스탯 분기는 도네이션 확정(BattleScene.endDonation)과 같은 규칙 —
  // 골드 검사와 지급이 한 덩어리여야 해서 UI가 아니라 여기서 처리한다.
  // 특성은 런 한정이라 저장하지 않는다(resetRun에서 어차피 날아간다).
  buyCard: (card, cost) => {
    if (get().gold < cost) return false;
    set({ gold: get().gold - cost });
    if (card.trait) get().grantTrait(card.trait);
    else get().grantCard(card);
    return true;
  },

  learnSkill: (id, cost) => {
    if (get().gold < cost) return false;
    const r = get().records;
    set({
      gold: get().gold - cost,
      skills: [...get().skills, id],
      // 보유 스킬은 런이 끝나면 날아가지만 "배운 적 있다"는 사실은 도감에 남는다
      records: r.learnedSkills.includes(id) ? r : { ...r, learnedSkills: [...r.learnedSkills, id] },
    });
    saveGame(); // 스킬 영구 해금
    return true;
  },

  // 스킬 사용 시도. 횟수 제한을 확인하고 사용 가능하면 카운터를 증가시킨다.
  useSkill: (id) => {
    const uses = get().skillUses[id] ?? 0;
    const maxUses = SKILLS[id]?.maxUses ?? Infinity;
    if (uses >= maxUses) return false;
    set({ skillUses: { ...get().skillUses, [id]: uses + 1 } });
    return true;
  },

  // 스테이지 시작 시 스킬 사용 횟수 초기화 (BattleScene.create에서 호출)
  resetSkillUses: () => set({ skillUses: {} }),

  // 방송 종료 정산 (기존 endRun의 records/save 흡수)
  recordRun: ({ outcome, peakViewers, totalDonated, kills }) => {
    const r = get().records;
    set({
      lastRun: { outcome, peakViewers: Math.floor(peakViewers), totalDonated, kills },
      records: {
        ...r,
        bestViewers: Math.max(r.bestViewers, Math.floor(peakViewers)),
        bestGold: Math.max(r.bestGold, Math.floor(get().gold)),
        // 도달한 화 = 도감 해금 기준. 방송이 어떻게 끝났든 그 화까지 갔다는 건 사실이다.
        bestEpisode: Math.max(r.bestEpisode, get().episode),
      },
    });
    saveGame();
  },
}));

export const gameState = gameStore.getState; // Phaser 직통 접근

// localStorage: 해금 목록 + 최고기록 + 설정 (GDD 8장)
export function saveGame() {
  const ls = globalThis.localStorage;
  if (!ls) return;
  const { skills, unlockedMonsters, records, bgmOn, bgmVol, sfxVol, screenShake } = gameStore.getState();
  try {
    ls.setItem(SAVE_KEY, JSON.stringify({ skills, unlockedMonsters, records, bgmOn, bgmVol, sfxVol, screenShake }));
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
    // 도감 필드(bestEpisode·learnedSkills)가 없던 시절의 세이브도 읽힌다 — 기본값 위에 덮어쓴다
    if (d.records) patch.records = { ...FRESH_RECORDS, ...d.records };
    if (typeof d.bgmOn === 'boolean') patch.bgmOn = d.bgmOn;
    if (typeof d.bgmVol === 'number') patch.bgmVol = clamp01(d.bgmVol);
    if (typeof d.sfxVol === 'number') patch.sfxVol = clamp01(d.sfxVol);
    if (typeof d.screenShake === 'boolean') patch.screenShake = d.screenShake;
    gameStore.setState(patch);
  } catch {
    /* 손상된 세이브 무시 */
  }
}
