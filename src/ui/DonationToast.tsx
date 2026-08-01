import { useRef, useState } from 'react';
import { type Donation } from '../game/events.ts';
import { playDonationSfx } from '../game/sfx.ts';
import { useBusEvent } from './useBusEvent.ts';

type Toast = Donation & { id: number };

export default function DonationToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  useBusEvent('donation:arrive', (d) => {
    // 효과음은 토스트와 같이 터진다 — DonationEvent 팝업(리액션 연출)보다 먼저 도착 신호를 준다
    playDonationSfx(d.tier);
    const t = { ...d, id: nextId.current++ };
    setToasts((prev) => [...prev, t]);
    // CSS 애니메이션(2.2s) 후 제거
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 2200);
  });

  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          🎁 {t.donor} {t.amount.toLocaleString()}G!
        </div>
      ))}
    </div>
  );
}
