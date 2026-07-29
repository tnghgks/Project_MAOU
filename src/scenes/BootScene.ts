import Phaser from 'phaser';
import { loadGame, gameState } from '../game/store.ts';
import { MONSTERS } from '../data/monsters.ts';
import { registerAnims } from '../game/anims.ts';

// 애니메이션 캐릭터 = assets/character/<이름>/ 폴더 하나 = 아틀라스 1장.
// 여기에 한 줄 추가하면 로드·애니메이션 등록이 같이 따라온다 (프레임 수는 아틀라스에서 읽는다).
export const CHARACTERS = ['rian', 'grimhardt'] as const;
export type CharKey = (typeof CHARACTERS)[number];

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Kenney Tiny Dungeon (CC0), 16×16. 몬스터 스프라이트는 data 테이블에서 파일명 참조.
    this.load.image('hero', 'assets/hero.png'); // 정지 초상화 전용 (HeroPanel · 도네이션 팝업)
    this.load.image('arrow', 'assets/arrow.png');
    // 캐릭터당 아틀라스 1장 — `npm run assets`(scripts/pack.js)가 assets/character/ 를 패킹한 결과.
    for (const k of CHARACTERS) this.load.atlas(k, `assets/character/${k}.png`, `assets/character/${k}.json`);
    // 아레나 배경 타일셋 (광산, 16×16 spacing 1). 맵 자체는 game/arenaMap.ts가 에피소드 시드로 생성.
    this.load.image('tiles', 'assets/tilemap.png');
    for (const [k, m] of Object.entries(MONSTERS)) this.load.image(`m_${k}`, `assets/${m.sprite}`);
  }

  create() {
    // 애니메이션은 게임 전역 — BattleScene은 화마다 재생성되므로 여기서 한 번만 등록한다.
    for (const k of CHARACTERS) registerAnims(this, k);
    loadGame();
    gameState().setPhase('title'); // 메뉴는 React가 렌더
  }
}
