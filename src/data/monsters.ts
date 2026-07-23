// GDD 3-5. 신규 몬스터 = 여기에 한 줄 추가. unlock = 등장 시작 화수. size = 렌더 스케일 기준(px), sprite = public/assets/ 파일.
export interface MonsterDef {
  name: string;
  mp: number;
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
}

export const MONSTERS = {
  slime:  { name: '슬라임', mp: 10, hp: 20, dmg: 3, atkCd: 1.0, speed: 60, range: 24, gold: 5, size: 16, sprite: 'slime.png', unlock: 1 },
  archer: { name: '고블린 궁수', mp: 20, hp: 15, dmg: 4, atkCd: 2.0, speed: 70, range: 240, gold: 8, size: 15, sprite: 'archer.png', unlock: 1, ranged: true },
  golem:  { name: '골렘', mp: 35, hp: 120, dmg: 8, atkCd: 1.5, speed: 35, range: 30, gold: 20, size: 26, sprite: 'golem.png', unlock: 1 },
  bat:    { name: '폭탄 박쥐', mp: 25, hp: 10, dmg: 20, atkCd: 0.1, speed: 120, range: 22, gold: 12, size: 14, sprite: 'bat.png', unlock: 2, suicide: true },
  knight: { name: '정예 기사', mp: 60, hp: 300, dmg: 15, atkCd: 1.2, speed: 45, range: 34, gold: 60, size: 28, sprite: 'knight.png', unlock: 4 },
} satisfies Record<string, MonsterDef>;

export type MonsterId = keyof typeof MONSTERS;
