import { useRef, useState, type PointerEvent } from 'react';
import { clamp } from '../formulas.ts';

// 패널 드래그 이동. handle을 손잡이 엘리먼트에, style을 패널에 붙인다.
// 위치는 CSS가 정하고 여기선 이동량(transform)만 얹는다 — absolute/fixed 어느 쪽이든 좌표계 변환이 필요 없다.
// 이동 범위는 패널의 offsetParent 안쪽으로 제한 (채팅=.screen, 상점=.ui-layer).
export function useDrag() {
  const [d, setD] = useState({ x: 0, y: 0 });
  const g = useRef({ on: false, px: 0, py: 0, dx: 0, dy: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 });

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button, input')) return; // 손잡이 안의 버튼은 클릭 그대로
    const panel = e.currentTarget.offsetParent as HTMLElement | null;
    const box = panel?.offsetParent as HTMLElement | null;
    if (!panel || !box) return;
    const p = panel.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    g.current = {
      on: true, px: e.clientX, py: e.clientY, dx: d.x, dy: d.y,
      minX: d.x - (p.left - b.left), maxX: d.x + (b.right - p.right),
      minY: d.y - (p.top - b.top), maxY: d.y + (b.bottom - p.bottom),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const c = g.current;
    if (!c.on) return;
    setD({
      x: clamp(c.dx + e.clientX - c.px, c.minX, c.maxX),
      y: clamp(c.dy + e.clientY - c.py, c.minY, c.maxY),
    });
  };

  const end = (e: PointerEvent<HTMLElement>) => {
    g.current.on = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return {
    style: { transform: `translate(${d.x}px, ${d.y}px)` },
    handle: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end },
  };
}
