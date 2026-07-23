import Phaser from 'phaser';
import { load } from '../state.js';

export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  // ponytail: 에셋 스프라이트시트 붙을 때 preload()가 여기 들어옴 (BootScene = 정해진 preload 진입점)
  create() {
    load();
    this.scene.start('Title');
  }
}
