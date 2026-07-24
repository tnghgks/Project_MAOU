// 시청자 채팅 콘텐츠 + 위험도(D) 구간별 무드 선택. 신규 대사 = 아래 풀에 한 줄 추가.
// 콘텐츠와 선택 로직만 담당 — 실제 채팅 송출 타이밍/시청자 게이트는 BattleScene가 소유.
export const CHAT_POOLS = {
  boring: [
    '노잼',
    '개노잼 ㅋㅋ',
    '매니저 뭐하냐 똑바로 안하냐',
    'ㅡㅡ',
    '숙제 방송이야?',
    '용사 왜 안움직여',
    '똑같은 몬스터만 나오네 지루하다',
    '이거 뭐야',
  ],
  normal: ['ㅋㅋㅋ', '용사 화이팅', '오 슬라임 나왔다', '응원합니다', '용사 좀 치네'],
  hot: [
    '개꿀잼ㅋㅋㅋ',
    '뒤에!! 뒤에!!',
    '헐',
    '죽는다죽는다죽는다',
    '엌ㅋㅋㅋㅋㅋㅋ',
    '!!!!!!!!',
    'ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ',
    '와아아아아아아',
    '와우',
  ],
  allperfect: [
    'ㅁㅊㅋㅋㅋㅋㅋㅋㅋㅋ',
    'ㅁㅊ ㅋㅋㅋㅋ',
    '헐 ㅋㅋㅋ 미친 레전드 ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ',
    '클립 ㄱㄱㄱㄱㄱㄱ',
    '매드무비 각이다',
    '레전드 ㄷㄷ',
    'ㅁㅊㅁㅊㅁㅊㅁㅊㅁㅊ',
    '그는 신이야',
    '신들렸다',
    '와아아아',
    '와우우우',
    '와아아',
    '와우우',
    '와아',
    '와우',
  ],
} satisfies Record<string, string[]>;

export interface ChatPick {
  pool: readonly string[];
  color: string;
}

// 위험도 D → 채팅 무드(풀 + 닉네임 색). 구간은 BattleScene.updateChat의 기존 기준과 동일.
export function pickChatMood(D: number): ChatPick {
  if (D < 0.2) return { pool: CHAT_POOLS.boring, color: '#7777aa' };
  if (D < 0.75) return { pool: CHAT_POOLS.normal, color: '#cccccc' };
  return { pool: CHAT_POOLS.hot, color: '#ff9966' };
}
