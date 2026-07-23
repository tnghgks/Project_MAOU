import { useEffect, useState } from 'react';
import { bus } from '../game/events.js';

export default function DonationToast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    let id = 0;
    const onDonation = ({ amount, donor }) => {
      const t = { id: id++, amount, donor };
      setToasts((prev) => [...prev, t]);
      // CSS 애니메이션(2.2s) 후 제거
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 2200);
    };
    bus.on('donation:arrive', onDonation);
    return () => bus.off('donation:arrive', onDonation);
  }, []);

  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>🎁 {t.donor} {t.amount.toLocaleString()}G!</div>
      ))}
    </div>
  );
}
