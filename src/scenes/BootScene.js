import Phaser from 'phaser';
import { load } from '../state.js';
import { MONSTERS } from '../data/monsters.js';

export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    // Kenney Tiny Dungeon (CC0), 16×16. 몬스터 스프라이트는 data 테이블에서 파일명 참조.
    this.load.image('hero', 'assets/hero.png');
    this.load.image('arrow', 'assets/arrow.png');
    for (const [k, m] of Object.entries(MONSTERS)) this.load.image(`m_${k}`, `assets/${m.sprite}`);
  }

  create() {
    load();
    this.scene.start('Title');
  }
}
