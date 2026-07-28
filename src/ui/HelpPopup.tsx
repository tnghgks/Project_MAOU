// 튜토리얼/조작 안내. 방송 중 언제든 접었다 펼 수 있는 floating 패널.
// ponytail: 개폐는 <details> — 상태·이벤트 코드 0줄
export const CONTROLS = [
  '카드 클릭 / 숫자키: 몬스터 자동 소환 ON·OFF',
  '카드 하단 바 드래그: 소환 주기·수량 조절',
  'Q W E R: 도네이션 리듬 판정',
  'C: 마왕 시점 ↔ 용사 시점 전환 (소환은 계속 돌아간다 · 전환 후 몇 초는 못 되돌린다)',
  '용사 시점 — W A S D / 화살표: 이동 · Shift: 대시(무적) · 1~4: 스킬',
  '용사 시점 — 짧은 간격으로 연속 처치하면 콤보가 쌓여 하이프가 오른다',
  'HP 30% 이하를 버티면 시청자가 몰린다 — 벼랑끝이 제일 잘 팔린다',
  '후원 카드에서 드물게 특성(흡혈·반격·광전사)이 나온다 — 이번 방송 한정',
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
