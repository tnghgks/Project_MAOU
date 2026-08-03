import Phaser from 'phaser';
import { loadGame, gameState } from '../game/store.ts';
import { MONSTERS, type MonsterDef } from '../data/monsters.ts';
import { registerAnims, registerSheetAnims } from '../game/anims.ts';

// 용사 아틀라스는 장비 등급마다 한 장이다 (assets/character/rian/Rian-Basic → rian-basic).
// 약한 것부터 순서대로. 철검을 붙일 땐 Rian-Iron 폴더를 넣고 여기에 'rian-iron' 한 줄만 더한다 —
// 프레임 이름(walk/south/0 …)은 등급이 달라도 같으므로 아틀라스 키만 갈아끼우면 그림이 바뀐다.
export const HERO_TIERS = ['rian-basic', 'rian-wooden'] as const;
export type HeroTier = (typeof HERO_TIERS)[number];

export const HERO_CHAR: HeroTier = HERO_TIERS[1]; // 지금 쓰는 등급

// 로드할 아틀라스 = 용사 전 등급 + MONSTERS 테이블의 char 값. 목록을 따로 유지하지 않는다 —
// 몬스터에 아트를 붙이는 건 monsters.ts에 char 한 줄이고, 로드·등록은 여기서 따라온다.
// 등급은 안 쓰는 것까지 미리 받는다 (한 장에 100KB 남짓이고, 런 도중 교체가 로드를 기다리면 안 된다).
const MONSTER_DEFS = Object.values(MONSTERS) as MonsterDef[];
export const CHARACTERS = [
  ...new Set([...HERO_TIERS, ...MONSTER_DEFS.flatMap((m) => (m.char && !m.sheet ? [m.char] : []))]),
];

// idle 시트 한 장으로 오는 몬스터: `아틀라스 키 → 프레임 크기(px)`. 아트가 방향별로 나오면
// assets/character/ 폴더에 넣고 sheet를 지우면 아틀라스 쪽으로 돌아간다.
export const SHEETS = new Map(
  MONSTER_DEFS.flatMap((m) => (m.char && m.sheet ? [[m.char, m.sheet] as [string, number]] : [])),
);

// 아틀라스 없는 캐릭터가 쓰는 대체 상자. 테두리만 흰색이라 tint가 테두리 색으로 먹는다.
export const BOX_TEXTURE = 'box';

// 휘두를 때마다 나가는 참격. 색상은 행으로 고른다 — 다른 색이 필요하면 FX_BASH_ROW만 바꾼다.
export const FX_BASH = 'fx-bash';
const FX_BASH_ROW = 5; // 0-based. 5 = 흰색 ponytail: 색상 knob

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Kenney Tiny Dungeon (CC0), 16×16.
    this.load.image('hero', 'assets/hero.png'); // 정지 초상화 전용 (HeroPanel · 도네이션 팝업)
    this.load.image('arrow', 'assets/arrow.png');
    // 캐릭터당 아틀라스 1장 — `npm run assets`(scripts/pack.js)가 assets/character/ 를 패킹한 결과.
    // 아직 안 만든 아틀라스는 로드가 실패해도 그냥 두고, 씬이 대체 상자로 그린다.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (f: Phaser.Loader.File) =>
      console.warn(`[assets] ${f.key} 로드 실패 (${f.url}) — 대체 상자로 그린다`),
    );
    for (const k of CHARACTERS) this.load.atlas(k, `assets/character/${k}.png`, `assets/character/${k}.json`);
    // 일반 몬스터는 idle 시트 한 장 (가로 한 줄, 정사각 프레임). 패킹 없이 그대로 넣는다.
    for (const [k, size] of SHEETS)
      this.load.spritesheet(k, `assets/character/${k}.png`, { frameWidth: size, frameHeight: size });
    // 아레나 배경 타일셋 (광산, 16×16 spacing 1). 맵 자체는 game/arenaMap.ts가 에피소드 시드로 생성.
    this.load.image('tiles', 'assets/tilemap.png');
    // 참격 이펙트. 640×576 = 64×64 프레임 10열 × 9행(= 색상 9종). 6행이 흰색 → 50~59.
    this.load.spritesheet(FX_BASH, 'assets/impact/skill/bash.png', { frameWidth: 64, frameHeight: 64 });
  }

  create() {
    // 대체 상자: 속은 비고 테두리만 흰색 → tint가 테두리에 먹어 몬스터별로 색이 구분된다.
    // 통짜 사각형이 아니라 테두리인 이유는 "아직 아트가 안 붙었다"가 한눈에 보이게 하려는 것.
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x11111a, 0.85).fillRect(0, 0, 16, 16);
    g.lineStyle(2, 0xffffff, 1).strokeRect(1, 1, 14, 14);
    g.generateTexture(BOX_TEXTURE, 16, 16);
    g.destroy();

    // 애니메이션은 게임 전역 — BattleScene은 화마다 재생성되므로 여기서 한 번만 등록한다.
    // 로드에 실패한 아틀라스는 건너뛴다 (registerAnims가 없는 텍스처를 만지지 않도록).
    for (const k of CHARACTERS) if (this.textures.exists(k)) registerAnims(this, k);
    for (const k of SHEETS.keys()) if (this.textures.exists(k)) registerSheetAnims(this, k);
    this.anims.create({
      key: FX_BASH,
      frames: this.anims.generateFrameNumbers(FX_BASH, { start: FX_BASH_ROW * 10, end: FX_BASH_ROW * 10 + 9 }),
      frameRate: 30, // 10프레임 = 0.33초. 공격 모션(0.5초)보다 짧게 끝나야 잔상이 안 남는다
    });
    loadGame();
    gameState().setPhase('title'); // 메뉴는 React가 렌더
  }
}
