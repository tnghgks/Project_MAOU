import { useEffect, useRef, useState } from 'react';
import { useBusEvent } from './useBusEvent.ts';
import { COMBO_WINDOW } from '../game/battleSim.ts';
import { COMBO_FULL } from '../formulas.ts';
import { ARENA, CANVAS } from '../game/layout.ts';

// 처치 콤보 상시 UI — 아레나 좌측 중앙에 겹쳐 그린다 (RhythmLane과 같은 패턴: bus 이벤트 +
// CSS 애니메이션, rAF 폴링 없음). Phaser HudScene에 있던 comboText/comboBar를 대체한다
// (씬 레이어링에 얽히지 않고, 그라데이션/펀치감 있는 CSS 연출을 그대로 쓸 수 있어서).
const X = 96;
const Y = ARENA.y + ARENA.h / 2;
const LEFT_PCT = (X / CANVAS.W) * 100;
const TOP_PCT = (Y / CANVAS.H) * 100;

export default function ComboMeter() {
  const [combo, setCombo] = useState(0);
  const [hitId, setHitId] = useState(0);
  const [paused, setPaused] = useState(false);
  const hideTimer = useRef<number>();
  const deadline = useRef(0); // performance.now() 기준, 콤보가 사라질 시각
  const remainingMs = useRef(0); // pause 시점에 남아있던 시간 — resume 때 이어서 쓴다

  useBusEvent('combo:hit', ({ combo: n }) => {
    setCombo(n);
    setHitId((id) => id + 1); // key로 써서 링/숫자 애니메이션을 처음부터 재시작
    clearTimeout(hideTimer.current);
    const ms = COMBO_WINDOW * 1000;
    deadline.current = performance.now() + ms;
    hideTimer.current = window.setTimeout(() => setCombo(0), ms);
  });

  // 몬스터에게 맞으면 창이 남아있어도 즉시 끊긴다 — 무피격 실력 지표라서
  useBusEvent('combo:reset', () => {
    clearTimeout(hideTimer.current);
    setCombo(0);
  });

  // 도네이션/보스 컷씬처럼 BattleScene 전체가 멈추는 동안 콤보도 같이 멈춰야 한다 —
  // 안 그러면 대화가 이어지는 사이 콤보만 시간이 흘러 끊겨버린다.
  useBusEvent('battle:pause', () => {
    setPaused(true);
    clearTimeout(hideTimer.current);
    remainingMs.current = Math.max(0, deadline.current - performance.now());
  });
  useBusEvent('battle:resume', () => {
    setPaused(false);
    deadline.current = performance.now() + remainingMs.current;
    hideTimer.current = window.setTimeout(() => setCombo(0), remainingMs.current);
  });

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  if (combo < 1) return null;
  const animState = paused ? 'paused' : 'running';

  return (
    <div className="combo-meter" style={{ left: `${LEFT_PCT}%`, top: `${TOP_PCT}%` }}>
      <div key={hitId} className="combo-badge">
        <svg
          className="combo-ring"
          viewBox="0 0 48 48"
          style={{ '--window': `${COMBO_WINDOW}s`, animationPlayState: animState } as React.CSSProperties}
        >
          <circle className="combo-ring-track" cx="24" cy="24" r="20" />
          <circle className="combo-ring-fill" cx="24" cy="24" r="20" style={{ animationPlayState: animState }} />
        </svg>
        <span className="combo-num" style={{ animationPlayState: animState }}>
          {combo}
        </span>
      </div>
      <div className="combo-label">COMBO</div>
      {combo >= COMBO_FULL && <div className="combo-full">FULL</div>}
    </div>
  );
}
