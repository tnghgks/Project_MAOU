// 씬을 넘어 유지되는 메타/영속 상태. 방송 중 임시 상태(monsters/viewers/mp/notes)는 BroadcastScene에 둔다.
// GDD 8장: 단일 GameState 싱글턴. localStorage엔 해금 + 최고기록만 저장.

const SAVE_KEY = 'maou.save';
const BASE_HERO = { maxHp: 100, atk: 10, atkSpd: 1.0, speed: 100, range: 60 }; // GDD 3-6 1화 시작값

export const GameState = {
  gold: 0,
  episode: 1,
  hero: { ...BASE_HERO },
  upgradeLevels: { hp: 0, atk: 0, atkSpd: 0, speed: 0, range: 0 }, // 비용 스케일용
  skills: ['낙뢰'], // 시작 스킬 1종, 해금으로 누적 (영구)
  unlockedMonsters: ['slime', 'archer', 'golem'],
  records: { bestViewers: 0, bestGold: 0 },
};

// 새 런: 스탯/골드/진행도 초기화. 해금·기록은 유지 (로그라이크).
export function resetRun() {
  GameState.gold = 0;
  GameState.episode = 1;
  GameState.hero = { ...BASE_HERO };
  GameState.upgradeLevels = { hp: 0, atk: 0, atkSpd: 0, speed: 0, range: 0 };
}

export function save() {
  const store = globalThis.localStorage;
  if (!store) return;
  const data = { skills: GameState.skills, unlockedMonsters: GameState.unlockedMonsters, records: GameState.records };
  try { store.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* 사파리 프라이빗 등 */ }
}

export function load() {
  const store = globalThis.localStorage;
  if (!store) return;
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.skills)) GameState.skills = data.skills;
    if (Array.isArray(data.unlockedMonsters)) GameState.unlockedMonsters = data.unlockedMonsters;
    if (data.records) GameState.records = data.records;
  } catch { /* 손상된 세이브 무시 */ }
}
