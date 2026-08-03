// 컷씬 대본. 지금은 영상이 없어 lines를 카드로 띄우는 mock — public/cutscenes/*.mp4를 넣고
// src만 채우면 그대로 영상 재생으로 바뀐다(끝나면 자동 진행, 스킵은 동일).
export interface Cutscene {
  title: string;
  lines: string[];
  sec?: number; // mock 재생 시간 (기본 5초). src가 있으면 영상 길이가 우선
  src?: string; // 예: '/cutscenes/intro.mp4'
  tone?: 'dark' | 'boss' | 'ending';
}
const baseURL = import.meta.env.VITE_BUCKET_BASE_URL || '';

// ponytail: 컷씬 추가 = 여기 한 줄. 씬 진입/보스/엔딩 id 규칙만 지키면 코드는 안 건드린다.
export const CUTSCENES: Record<string, Cutscene> = {
  intro: {
    title: '프롤로그',
    lines: ['마왕성의 재정은 파탄났다.', '남은 수익 모델은 단 하나 — 방송.', '"오늘부터 마왕 채널, 개국합니다."'],
    tone: 'dark',
    src: `${baseURL}/cutscenes/intro.mp4`,
  },

  'stage-1': { title: '1화 — 첫 방송', lines: ['구독자 0명.', '그리고 성문 앞에 도착한 용사 한 명.'], src: `${baseURL}/cutscenes/stage-1.mp4` },
  'stage-2': { title: '2화 — 입소문', lines: ['클립이 터졌다.', '용사도 강해졌다. 시청자는 더 강한 걸 원한다.']},
  'stage-3': { title: '최종화 — 마왕 vs 용사', lines: ['오늘 방송, 둘 중 하나는 끝난다.', '마왕이 직접 링에 오른다.']},

  'boss-1': {
    title: '보스 등장 — 골렘',
    lines: ['땅이 갈라지고 돌덩이가 일어선다.', '채팅창이 폭발한다.'],
    tone: 'boss',
    src: `${baseURL}/cutscenes/stage-1_boss.mp4`,
  },
  'boss-2': { title: '보스 등장 — 흑기사', lines: ['"마왕님, 시청자들이 피를 원합니다."'], tone: 'boss' },
  'boss-3': {
    title: '보스 등장 — 마왕',
    lines: ['왕좌에서 일어난다.', '"직접 나서지, 이번 화는 특별편이니까."'],
    tone: 'boss',
  },

  'ending-bad': {
    title: 'BAD ENDING',
    lines: ['용사는 너무 약했다.', '이겼지만 아무도 보지 않았다.'],
    tone: 'ending',
  },
  'ending-best': { title: 'BEST ENDING', lines: ['마왕은 쓰러졌다.', '동시 접속자 신기록과 함께.'], tone: 'ending' },
  'ending-hidden': {
    title: 'HIDDEN ENDING',
    lines: ['1분 컷.', '클립 하나만 남기고 채널은 전설이 됐다.'],
    tone: 'ending',
  },
};

export const stageCut = (ep: number) => `stage-${ep}`;
export const bossCut = (ep: number) => `boss-${ep}`;
export const endingCut = (kind: string) => `ending-${kind}`;
