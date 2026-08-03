import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import type Phaser from 'phaser';
import { createGame } from './game/config.ts';
import { gameStore } from './game/store.ts';
import { preloadSfx } from './game/sfx.ts';
import BroadcastFrame from './ui/BroadcastFrame.tsx';
import InfoLayer from './ui/InfoLayer.tsx';
import DonationToast from './ui/DonationToast.tsx';
import DonationEvent from './ui/DonationEvent.tsx';
import ComboMeter from './ui/ComboMeter.tsx';
import MenuOverlay from './ui/MenuOverlay.tsx';
import TitleView from './ui/TitleView.tsx';
import HelpPopup from './ui/HelpPopup.tsx';
import CutsceneView from './ui/CutsceneView.tsx';
import DevPanel from './ui/DevPanel.tsx';
import { useBgm } from './ui/useBgm.ts';

export default function App() {
  const parentRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const phase = useStore(gameStore, (s) => s.phase);
  useBgm(); // 방송 구간 BGM — 재생/정지 조건은 훅이 전부 안다

  useEffect(() => {
    if (gameRef.current) return;
    preloadSfx(); // 첫 후원에서 다운로드 지연으로 효과음이 늦게 붙지 않게 미리 받아둔다
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
      game.scene.start('Battle'); // Battle이 HeroPanel launch
    else for (const k of ['Battle', 'HeroPanel']) if (game.scene.isActive(k)) game.scene.stop(k);
  }, [phase]);

  // 캔버스와 오버레이는 플레이어 영역(.screen) 안 — 채팅/사이드바는 BroadcastFrame가 소유.
  // 3레이어(피드백 2026-07-31): 1=Phaser 캔버스 · 2=정보성 UI(InfoLayer) · 3=리듬/콤보 등 효과(ui-layer).
  return (
    <>
      <BroadcastFrame>
        <div ref={parentRef} className="canvas-layer" />
        {phase === 'broadcast' && <InfoLayer />}
        <div className="ui-layer">
          {phase === 'broadcast' && (
            <>
              <DonationToast />
              <DonationEvent />
              <HelpPopup />
              <ComboMeter />
            </>
          )}
          <MenuOverlay />
        </div>
      </BroadcastFrame>
      {/* 타이틀과 컷씬은 방송 프레임까지 덮는 전체화면.
          boot 동안에도 타이틀을 띄워 방송 프레임(빈 캔버스)이 잠깐 노출되는 걸 막는다. */}
      {(phase === 'title' || phase === 'boot') && <TitleView />}
      <CutsceneView />
      {import.meta.env.DEV && <DevPanel />}
    </>
  );
}
