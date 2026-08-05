import Phaser from 'phaser';
import BootScene from '../scenes/BootScene.ts';
import BattleScene from '../scenes/BattleScene.ts';
import { CANVAS } from './layout.ts';

// 메뉴(타이틀/정산/육성/엔딩)는 React. Phaser는 캔버스 씬 하나(Battle)만 돈다.
// 상단 HUD(시청자수/위험도/골드)는 React InfoLayer(ui/InfoLayer.tsx, 2026-07-31 이관).
// 하단 소환/용사 패널도 React SummonPanel(ui/SummonPanel.tsx, 2026-08-05 이관)로 옮겼다.
// 리듬 미니게임은 RhythmLane(React, ui/RhythmLane.tsx)이 담당 — 도네이션 dim 팝업 안에서 그려진다.
export function createGame(parent: HTMLElement) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: CANVAS.W,
    height: CANVAS.H,
    backgroundColor: '#111118',
    pixelArt: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, BattleScene],
  });
}
