import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { createGame } from './game/config.js';
import { gameStore } from './game/store.js';
import ChatPanel from './ui/ChatPanel.jsx';
import DonationToast from './ui/DonationToast.jsx';
import MenuOverlay from './ui/MenuOverlay.jsx';

export default function App() {
  const parentRef = useRef(null);
  const gameRef = useRef(null);
  const phase = useStore(gameStore, (s) => s.phase);

  useEffect(() => {
    if (gameRef.current) return;
    gameRef.current = createGame(parentRef.current);
    return () => { gameRef.current?.destroy(true); gameRef.current = null; };
  }, []);

  // React가 씬 디렉터: broadcast일 때만 Broadcast 씬을 돌린다
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    if (phase === 'broadcast') game.scene.start('Battle'); // Battle이 Hud/Rhythm launch
    else for (const k of ['Battle', 'Hud', 'Rhythm']) if (game.scene.isActive(k)) game.scene.stop(k);
  }, [phase]);

  return (
    <div className="stage">
      <div ref={parentRef} className="canvas-layer" />
      <div className="ui-layer">
        {phase === 'broadcast' && <><ChatPanel /><DonationToast /></>}
        <MenuOverlay />
      </div>
    </div>
  );
}
