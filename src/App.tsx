import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import type Phaser from 'phaser';
import { createGame } from './game/config.ts';
import { gameStore } from './game/store.ts';
import BroadcastFrame from './ui/BroadcastFrame.tsx';
import DonationToast from './ui/DonationToast.tsx';
import DonationEvent from './ui/DonationEvent.tsx';
import MenuOverlay from './ui/MenuOverlay.tsx';
import TitleView from './ui/TitleView.tsx';
import HelpPopup from './ui/HelpPopup.tsx';
import CutsceneView from './ui/CutsceneView.tsx';

export default function App() {
  const parentRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const phase = useStore(gameStore, (s) => s.phase);

  useEffect(() => {
    if (gameRef.current) return;
    gameRef.current = createGame(parentRef.current!);
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  // React가 씬 디렉터: broadcast일 때만 Broadcast 씬을 돌린다
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    if (phase === 'broadcast')
      game.scene.start('Battle'); // Battle이 Hud/HeroPanel/Rhythm launch
    else for (const k of ['Battle', 'Hud', 'HeroPanel', 'Rhythm']) if (game.scene.isActive(k)) game.scene.stop(k);
  }, [phase]);

  // 캔버스와 오버레이는 플레이어 영역(.screen) 안 — 채팅/사이드바는 BroadcastFrame가 소유
  return (
    <>
      <BroadcastFrame>
        <div ref={parentRef} className="canvas-layer" />
        <div className="ui-layer">
          {phase === 'broadcast' && (
            <>
              <DonationToast />
              <DonationEvent />
              <HelpPopup />
            </>
          )}
          <MenuOverlay />
        </div>
      </BroadcastFrame>
      {/* 타이틀과 컷씬은 방송 프레임까지 덮는 전체화면.
          boot 동안에도 타이틀을 띄워 방송 프레임(빈 캔버스)이 잠깐 노출되는 걸 막는다. */}
      {(phase === 'title' || phase === 'boot') && <TitleView />}
      <CutsceneView />
    </>
  );
}
