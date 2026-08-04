import { useState } from 'react';
import { bus } from '../game/events.ts';
import { gameState, type Phase } from '../game/store.ts';
import type { DonationTier } from '../formulas.ts';
import { pickDonationMessage } from '../data/chat.ts';

// 개발 모드 전용 디버그 패널. 프로덕션 빌드에는 포함되지 않는다 (App.tsx에서 import.meta.env.DEV로 게이팅).
// 페이즈 점프 + 도네이션 이벤트(일반/대박)를 즉시 트리거해서, 플레이를 쭉 진행하지 않고도
// 원하는 화면/씬을 바로 볼 수 있게 한다.
const PHASES: { label: string; phase: Phase }[] = [
  { label: '타이틀', phase: 'title' },
  { label: '방송', phase: 'broadcast' },
  { label: '정산', phase: 'result' },
  { label: '육성', phase: 'upgrade' },
  { label: '엔딩', phase: 'ending' },
];

const DEV_AMOUNT: Record<DonationTier, number> = { small: 300, middle: 3000, big: 50000 };

export default function DevPanel() {
  const [open, setOpen] = useState(false);

  const goPhase = (phase: Phase) => {
    if (phase === 'broadcast' && gameState().phase !== 'broadcast') gameState().resetRun();
    gameState().setPhase(phase);
  };

  // tier는 실제 게임에선 업그레이드 가격 대비로 계산되지만(formulas.donationTier),
  // 여기선 효과음 3종을 바로 들어보려고 금액과 함께 직접 지정한다.
  const donate = (tier: DonationTier, jackpot = false) => {
    if (gameState().phase !== 'broadcast') goPhase('broadcast');
    bus.emit('donation:arrive', {
      donor: '테스터',
      amount: DEV_AMOUNT[tier],
      jackpot,
      tier,
      message: pickDonationMessage(),
    });
  };

  return (
    <div className="dev-panel">
      <button className="dev-panel-toggle" onClick={() => setOpen((v) => !v)}>
        🛠 DEV
      </button>
      {open && (
        <div className="dev-panel-body">
          <p className="dev-panel-label">페이즈</p>
          <div className="dev-panel-row">
            {PHASES.map(({ label, phase }) => (
              <button key={phase} onClick={() => goPhase(phase)}>
                {label}
              </button>
            ))}
          </div>
          <p className="dev-panel-label">도네이션</p>
          <div className="dev-panel-row">
            <button onClick={() => donate('small')}>소액</button>
            <button onClick={() => donate('middle')}>중간</button>
            <button onClick={() => donate('big')}>고액</button>
            <button onClick={() => donate('big', true)}>대박(리듬)</button>
          </div>
        </div>
      )}
    </div>
  );
}
