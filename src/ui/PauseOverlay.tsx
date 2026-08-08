import { useEffect, useRef, useState } from 'react';
import { bus } from '../game/events.ts';
import { playSfx } from '../game/sfx.ts';
import { useBusEvent } from './useBusEvent.ts';

// ESC로 여는 일시정지 오버레이. 도네이션 팝업/보스 컷씬도 같은 scene.pause()를 쓰므로
// 그쪽이 이미 battle을 멈춰 둔 상태(busy)라면 ESC를 눌러도 아무 요청도 보내지 않는다 —
// 그 팝업들 각자가 알아서 resume까지 책임진다(donation:end, playCuts 콜백).
export default function PauseOverlay() {
  const [paused, setPaused] = useState(false);
  const mine = useRef(false); // 지금 열린 일시정지가 내(ESC) 요청으로 연 것인지
  const busy = useRef(false); // 도네이션/보스 컷씬 등 다른 이유로 battle이 이미 멈춰 있는지

  useBusEvent('battle:pause', () => {
    busy.current = true;
  });
  useBusEvent('battle:resume', () => {
    busy.current = false;
  });

  const close = () => {
    playSfx('uiMove');
    bus.emit('pause:toggle', null);
    mine.current = false;
    setPaused(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (paused) {
        if (mine.current) close();
        return;
      }
      if (busy.current) return; // 도네이션/보스 컷씬 중엔 끼어들지 않는다
      playSfx('uiMove');
      bus.emit('pause:toggle', null);
      mine.current = true;
      setPaused(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused]);

  if (!paused) return null;
  return (
    <div className="pause-overlay">
      <div className="pause-box">
        <p className="pause-title">⏸ 일시정지</p>
        <p className="pause-tip">ESC를 다시 누르면 방송이 재개됩니다</p>
        <button className="cta pause-resume" onClick={close}>
          ▶ 재개하기
        </button>
      </div>
    </div>
  );
}
