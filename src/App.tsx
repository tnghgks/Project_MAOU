import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import type Phaser from 'phaser';
import { createGame } from './game/config.ts';
import { gameStore } from './game/store.ts';
import ChatPanel from './ui/ChatPanel.tsx';
import DonationToast from './ui/DonationToast.tsx';
import MenuOverlay from './ui/MenuOverlay.tsx';

export default function App() {
  const parentRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const phase = useStore(gameStore, (s) => s.phase);

  useEffect(() => {
    if (gameRef.current) return;
    gameRef.current = createGame(parentRef.current!);
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
