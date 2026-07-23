import Phaser from 'phaser';
import BootScene from '../scenes/BootScene.js';
import BattleScene from '../scenes/BattleScene.js';
import HudScene from '../scenes/HudScene.js';
import RhythmScene from '../scenes/RhythmScene.js';

// 메뉴(타이틀/정산/육성/엔딩)는 React. Phaser는 캔버스 씬만: Battle + 병렬 Hud/Rhythm.
export function createGame(parent) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 1280,
    height: 720,
    backgroundColor: '#111118',
    pixelArt: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, BattleScene, HudScene, RhythmScene],
  });
}
