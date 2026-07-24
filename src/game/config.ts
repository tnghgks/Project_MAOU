import Phaser from 'phaser';
import BootScene from '../scenes/BootScene.ts';
import BattleScene from '../scenes/BattleScene.ts';
import HudScene from '../scenes/HudScene.ts';
import RhythmScene from '../scenes/RhythmScene.ts';
import { CANVAS } from './layout.ts';

// 메뉴(타이틀/정산/육성/엔딩)는 React. Phaser는 캔버스 씬만: Battle + 병렬 Hud/Rhythm.
export function createGame(parent: HTMLElement) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: CANVAS.W,
    height: CANVAS.H,
    backgroundColor: '#111118',
    pixelArt: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, BattleScene, HudScene, RhythmScene],
  });
}
