// 시청자 닉네임 = [수식어][정체][꼬리] 조합. 신규 어휘 = 아래 배열에 한 줄 추가.
// 채팅·후원자 모두 여기서 만든 "현재 시청자 명단"에서만 나온다 (1명이면 1명만 떠든다).
const HEADS = [
  '익명의',
  '지나가던',
  '전생한',
  '고인물',
  '뉴비',
  '어둠의',
  '심심한',
  '배고픈',
  '잠수중인',
  '월급루팡',
  '광명의',
  '퇴근한',
  '야근중인',
  '숙제중인',
];
const BODIES = [
  '마족',
  '슬라임',
  '용사팬',
  '경비병',
  '마왕성인턴',
  '구독자',
  '기사단원',
  '고블린',
  '드루이드',
  '상인',
  '음유시인',
  '해골',
  '박쥐',
  '연금술사',
];
const TAILS = ['', '', '', '77', '99', '123', 'zz', 'TV', '2세', 'Jr'];

const pick = <T>(arr: T[], rnd: () => number) => arr[Math.floor(rnd() * arr.length)];

export function makeNickname(rnd: () => number = Math.random): string {
  return pick(HEADS, rnd) + pick(BODIES, rnd) + pick(TAILS, rnd);
}

// 동시 채팅 인원 상한 — 시청자가 수만이어도 실제로 떠드는 사람은 이만큼만 시뮬레이션.
// ponytail: 조합 수(약 2천)보다 훨씬 작아야 중복 재시도가 싸게 끝난다.
export const ROSTER_MAX = 100;

// 시청자 수에 맞춰 명단을 늘리고 줄인다. 새로 들어온 사람이 먼저 나간다.
export function syncRoster(roster: string[], viewers: number, rnd: () => number = Math.random): string[] {
  const want = Math.max(0, Math.min(Math.floor(viewers), ROSTER_MAX));
  if (roster.length > want) return roster.slice(0, want);
  const next = [...roster];
  const seen = new Set(next);
  while (next.length < want) {
    let nick = makeNickname(rnd);
    for (let i = 0; i < 5 && seen.has(nick); i++) nick = makeNickname(rnd); // 중복이면 몇 번만 다시
    if (seen.has(nick)) nick = `${nick}${next.length}`; // 그래도 겹치면 번호로 확정 구분
    seen.add(nick);
    next.push(nick);
  }
  return next;
}
