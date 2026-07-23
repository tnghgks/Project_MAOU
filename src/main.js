import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import TitleScene from './scenes/TitleScene.js';
import BroadcastScene from './scenes/BroadcastScene.js';
import ResultScene from './scenes/ResultScene.js';
import UpgradeScene from './scenes/UpgradeScene.js';
import EndingScene from './scenes/EndingScene.js';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 1280,
  height: 720,
  backgroundColor: '#111118',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, BroadcastScene, ResultScene, UpgradeScene, EndingScene],
});
