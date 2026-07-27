import Phaser from 'phaser';
import { loadGame, gameState } from '../game/store.ts';
import { MONSTERS } from '../data/monsters.ts';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Kenney Tiny Dungeon (CC0), 16×16. 몬스터 스프라이트는 data 테이블에서 파일명 참조.
    this.load.image('hero', 'assets/hero.png');
    this.load.image('arrow', 'assets/arrow.png');
    // 아레나 배경 타일셋 (광산, 16×16 spacing 1). 맵 자체는 game/arenaMap.ts가 에피소드 시드로 생성.
    this.load.image('tiles', 'assets/tilemap.png');
    for (const [k, m] of Object.entries(MONSTERS)) this.load.image(`m_${k}`, `assets/${m.sprite}`);
  }

  create() {
    loadGame();
    gameState().setPhase('title'); // 메뉴는 React가 렌더
  }
}
