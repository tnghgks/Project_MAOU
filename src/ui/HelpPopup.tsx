// 튜토리얼/조작 안내. 방송 중 언제든 접었다 펼 수 있는 floating 패널.
// ponytail: 개폐는 <details> — 상태·이벤트 코드 0줄
export const CONTROLS = [
  '카드 클릭 / 숫자키: 몬스터 자동 소환 ON·OFF',
  '카드 하단 바 드래그: 소환 주기·수량 조절',
  'Q W E R: 도네이션 리듬 판정',
  '목표 골드를 채우면 보스 등장 · 용사가 보스를 잡으면 방송 성공',
  '시청자가 다 나가면 채널 폐지',
  '용사를 죽이지 마라. 단, 죽기 직전까지 몰아붙여라.',
];

export default function HelpPopup() {
  return (
    <details className="help-popup">
      <summary>❔ 조작법</summary>
      <ul>
        {CONTROLS.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </details>
  );
}
