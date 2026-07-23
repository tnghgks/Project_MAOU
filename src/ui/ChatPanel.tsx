import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { gameStore } from '../game/store.ts';
import { bus, type ChatLine } from '../game/events.ts';

type Line = ChatLine & { id: number };

export default function ChatPanel() {
  const viewers = useStore(gameStore, (s) => s.viewers);
  const [lines, setLines] = useState<Line[]>([]);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let id = 0;
    const onLine = ({ who, msg, color }: ChatLine) =>
      setLines((prev) => [...prev.slice(-49), { id: id++, who, msg, color }]);
    bus.on('chat:line', onLine);
    return () => { bus.off('chat:line', onLine); };
  }, []);

  // 새 줄마다 바닥으로 (overflow-y auto가 스크롤을 공짜로 처리)
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <aside className="chat">
      <header>👁 시청자 {viewers.toLocaleString()}명</header>
      <ul ref={listRef}>
        {lines.map((l) => (
          <li key={l.id} style={{ color: l.color }}>
            <b>{l.who}</b>: {l.msg}
          </li>
        ))}
      </ul>
    </aside>
  );
}
