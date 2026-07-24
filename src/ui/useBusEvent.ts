import { useEffect, useRef } from 'react';
import { bus, type BusEvents } from '../game/events.ts';

// 타입드 버스 구독을 컴포넌트 마운트에 묶는 훅. handler는 ref로 최신값을 유지하므로
// 인라인 클로저를 넘겨도 재구독하지 않는다 (bus.on/off 보일러플레이트 제거).
export function useBusEvent<K extends keyof BusEvents>(event: K, handler: (payload: BusEvents[K]) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = (payload: BusEvents[K]) => ref.current(payload);
    bus.on(event, fn);
    return () => {
      bus.off(event, fn);
    };
  }, [event]);
}
