// 도네이션 "나쁜" 카드 중 스탯 저하가 아니라 즉시 부정 이벤트(몬스터 기습 소환)를 주는 카드 —
// cardStats.ts(curse: true)와 쌍을 이루되 효과가 mods가 아니라 소환이라 별도 카탈로그로 분리한다.
// 적용 지점은 BattleScene.endDonation의 card.summonCurse 분기. 신규 카드 = 아래 SUMMON_CURSES에 한 줄.
import type { Rarity } from './cards.ts';
import type { MonsterId } from './monsters.ts';

export interface SummonCurseDef {
  name: string;
  icon: string;
  desc: string;
  rarity: Rarity;
  count: number; // 소환 마리 수
  pool: MonsterId[]; // 이 중에서 마리당 무작위 1종
}

export type SummonCurseId = 'ambush' | 'sniperSquad' | 'golemRaid';

// prettier-ignore
export const SUMMON_CURSES = {
  ambush:      { name: '기습 소환',      icon: '💀', rarity: 'common',   desc: '근처에 슬라임 2마리가 갑자기 나타난다', count: 2, pool: ['slime'] },
  sniperSquad: { name: '저격 부대 난입', icon: '🏹', rarity: 'uncommon', desc: '고블린 궁수와 폭탄 박쥐가 기습 소환된다', count: 2, pool: ['archer', 'bat'] },
  golemRaid:   { name: '거인의 습격',    icon: '👹', rarity: 'uncommon', desc: '사이클롭스가 갑자기 난입한다', count: 1, pool: ['golem'] },
} satisfies Record<SummonCurseId, SummonCurseDef>;

export const SUMMON_CURSE_IDS = Object.keys(SUMMON_CURSES) as SummonCurseId[];
