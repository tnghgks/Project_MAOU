// GDD 3-5. 신규 몬스터 = 여기에 한 줄 추가. unlock = 등장 시작 화수. size = 렌더 스케일 기준(px), sprite = public/assets/ 파일.
export interface MonsterDef {
  name: string;
  hp: number;
  dmg: number;
  atkCd: number;
  speed: number;
  range: number;
  gold: number;
  size: number;
  sprite: string;
  unlock: number;
  ranged?: boolean;
  suicide?: boolean;
  tint?: number; // 보스 식별용 (스프라이트 재활용)
}

// 한 몬스터 = 한 줄, 컬럼 정렬로 밸런스 비교가 쉽다
// prettier-ignore
export const MONSTERS = {
  slime:  { name: '슬라임', hp: 20, dmg: 3, atkCd: 1.0, speed: 60, range: 24, gold: 5, size: 16, sprite: 'slime.png', unlock: 1 },
  archer: { name: '고블린 궁수', hp: 15, dmg: 4, atkCd: 2.0, speed: 70, range: 240, gold: 8, size: 15, sprite: 'archer.png', unlock: 1, ranged: true },
  golem:  { name: '골렘', hp: 120, dmg: 8, atkCd: 1.5, speed: 35, range: 30, gold: 20, size: 26, sprite: 'golem.png', unlock: 1 },
  bat:    { name: '폭탄 박쥐', hp: 10, dmg: 20, atkCd: 0.1, speed: 120, range: 22, gold: 12, size: 14, sprite: 'bat.png', unlock: 2, suicide: true },
  knight: { name: '정예 기사', hp: 300, dmg: 15, atkCd: 1.2, speed: 45, range: 34, gold: 60, size: 28, sprite: 'knight.png', unlock: 3 },

  // 보스 — unlock 99라 소환 버튼에 안 뜬다. 목표 골드 달성 시 BattleScene이 직접 소환한다.
  boss_golem:  { name: '고대 골렘 왕', hp: 600,  dmg: 12, atkCd: 1.6, speed: 30, range: 40, gold: 300,  size: 48, sprite: 'golem.png',  unlock: 99, tint: 0xff8844 },
  boss_knight: { name: '흑기사단장',   hp: 1400, dmg: 18, atkCd: 1.5, speed: 34, range: 44, gold: 800,  size: 52, sprite: 'knight.png', unlock: 99, tint: 0x8888ff },
  boss_maou:   { name: '마왕',        hp: 2600, dmg: 24, atkCd: 1.4, speed: 38, range: 46, gold: 2000, size: 56, sprite: 'knight.png', unlock: 99, tint: 0xcc44ff },
} satisfies Record<string, MonsterDef>;

export type MonsterId = keyof typeof MONSTERS;
