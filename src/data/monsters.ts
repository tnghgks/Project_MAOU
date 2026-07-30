// GDD 3-5. 신규 몬스터 = 여기에 한 줄 추가. unlock = 등장 시작 화수.
export interface MonsterDef {
  name: string;
  hp: number;
  dmg: number;
  atkCd: number;
  speed: number;
  range: number;
  gold: number;
  size: number; // 대체 상자 크기(px). 아틀라스가 붙으면 원본 크기 그대로 그린다
  scale?: number; // 표시 배율(기본 1). 아트 원본이 작거나 클 때 여기로 맞춘다 — 전투 판정은 range라 영향 없다
  /** 애니메이션 아틀라스 키 = assets/character/<이름>/ 폴더명(소문자).
   *  비어 있거나 아틀라스 로드에 실패하면 대체 상자가 뜬다 — 게임은 그대로 돌아간다.
   *  아트가 준비되면 여기 한 줄만 채우면 로드·애니메이션 등록이 전부 따라온다. */
  char?: string;
  unlock: number;
  ranged?: boolean;
  suicide?: boolean;
  tint?: number; // 보스 식별용 (스프라이트 재활용) · 대체 상자 색으로도 쓰인다
}

// 한 몬스터 = 한 줄, 컬럼 정렬로 밸런스 비교가 쉽다.
// char가 빈 줄은 아직 아트가 없어 대체 상자로 뜬다 — 아틀라스가 나오면 char만 채우면 된다.
// prettier-ignore
export const MONSTERS = {
  slime:  { name: '슬라임',      hp: 20,  dmg: 3,  atkCd: 1.0, speed: 60,  range: 24,  gold: 5,  size: 16, unlock: 1 },
  archer: { name: '고블린 궁수', hp: 15,  dmg: 4,  atkCd: 2.0, speed: 70,  range: 240, gold: 8,  size: 15, unlock: 1, ranged: true, char: 'goblinarcher' },
  golem:  { name: '골렘',        hp: 120, dmg: 8,  atkCd: 1.5, speed: 35,  range: 30,  gold: 20, size: 26, unlock: 1 },
  bat:    { name: '폭탄 박쥐',   hp: 10,  dmg: 20, atkCd: 0.1, speed: 120, range: 22,  gold: 12, size: 14, unlock: 2, suicide: true },
  knight: { name: '정예 기사',   hp: 300, dmg: 15, atkCd: 1.2, speed: 45,  range: 34,  gold: 60, size: 28, unlock: 3 },

  // 보스 — unlock 99라 소환 버튼에 안 뜬다. 목표 골드 달성 시 BattleScene이 직접 소환한다.
  boss_golem:  { name: '고대 골렘 왕', hp: 600,  dmg: 12, atkCd: 1.6, speed: 30, range: 40, gold: 300,  size: 92, unlock: 99, char: 'stonegolem', scale: 2 },
  boss_knight: { name: '흑기사단장',   hp: 1400, dmg: 18, atkCd: 1.5, speed: 34, range: 44, gold: 800,  size: 64, unlock: 99, char: 'blackknight', scale: 1.7 },
  boss_maou:   { name: '마왕',         hp: 2600, dmg: 24, atkCd: 1.4, speed: 38, range: 46, gold: 2000, size: 64, unlock: 99, char: 'grimhardt', scale: 1.2 },
} satisfies Record<string, MonsterDef>;

export type MonsterId = keyof typeof MONSTERS;
