import { useSyncExternalStore } from 'react';
import { bus, type ChatLine } from '../game/events.ts';

export type ChatEntry = ChatLine & { id: number };

// 채팅 내역은 모듈 레벨 링버퍼에 보관한다 — 채팅을 숨겼다 켜도(ChatPanel 언마운트/재마운트)
// 내역이 남아야 하기 때문(BroadcastFrame 참조). bus 리스너는 여기 단 하나, React는
// useSyncExternalStore로 구독한다(기존 forceUpdate 해킹·이중 리스너 제거).
const MAX = 20;
let history: ChatEntry[] = [];
let seq = 0;
const listeners = new Set<() => void>();

bus.on('chat:line', (l: ChatLine) => {
  const next = [...history, { ...l, id: seq++ }];
  history = next.length > MAX ? next.slice(next.length - MAX) : next; // 화면에 보이는 만큼만 유지
  for (const fn of listeners) fn();
});

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useChatLog(): ChatEntry[] {
  return useSyncExternalStore(subscribe, () => history);
}
