import Phaser from 'phaser';
import { clamp, type ViewerAlert } from '../formulas.ts';
import { gameState } from '../game/store.ts';
import { ARENA, CX } from '../game/layout.ts';
import type BattleScene from './BattleScene.ts';

const ALERT_COLORS: Record<ViewerAlert, string> = { normal: '#ffffff', warn: '#ff9933', critical: '#ff4444' };

// 캔버스 HUD: 매 프레임 BattleScene의 실시간 값을 읽어 렌더 (store 아님 — React 리렌더 방지).
export default class HudScene extends Phaser.Scene {
  battle!: BattleScene;
  viewerText!: Phaser.GameObjects.Text;
  goldText!: Phaser.GameObjects.Text;
  targetText!: Phaser.GameObjects.Text;
  critText!: Phaser.GameObjects.Text;
  hypeBar!: Phaser.GameObjects.Rectangle;
  hypeLabel!: Phaser.GameObjects.Text;
  vignette!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('Hud');
  }

  create() {
    this.battle = this.scene.get('Battle') as BattleScene;
    const add = this.add;

    add.rectangle(640, 20, 1280, 40, 0x1a1a24).setDepth(5); // 상단바 bg
    this.viewerText = add.text(16, 10, '', { fontSize: '18px', color: '#ffffff' }).setDepth(6);
    this.goldText = add.text(220, 10, '', { fontSize: '18px', color: '#ffdd44' }).setDepth(6);
    this.targetText = add.text(1264, 10, '', { fontSize: '18px', color: '#ffffff' }).setOrigin(1, 0).setDepth(6); // 우측 정렬 — 보스 이름 길이가 들쭉날쭉
    // 시청자 바닥 위기 카운트다운 (좌상단, 상단바 바로 아래)
    this.critText = add
      .text(16, 50, '', { fontSize: '26px', fontStyle: 'bold', color: '#ff4444' })
      .setDepth(9)
      .setVisible(false);
    add.text(420, 10, '🔥', { fontSize: '18px' }).setDepth(6);
    add.rectangle(450, 20, 204, 16, 0x000000).setOrigin(0, 0.5).setDepth(6);
    this.hypeBar = add.rectangle(452, 20, 0, 12, 0xff8822).setOrigin(0, 0.5).setDepth(7);
    this.hypeLabel = add.text(670, 10, '', { fontSize: '16px', color: '#ffffff' }).setDepth(6);

    // 벼랑끝 비네팅
    this.vignette = add.rectangle(CX, ARENA.y + ARENA.h / 2, ARENA.w, ARENA.h, 0xff0000, 0).setDepth(4);
  }

  update() {
    const b = this.battle;
    if (!b || !b.hero) return;
    this.viewerText.setText(`👁 ${Math.floor(b.viewers).toLocaleString()}`).setColor(ALERT_COLORS[b.alert]);
    this.goldText.setText(`💰 ${Math.floor(gameState().gold).toLocaleString()}G`);
    // 보스 등장 전엔 처치 골드 게이지, 등장 후엔 보스 HP
    this.targetText
      .setText(
        b.boss
          ? `☠ ${b.boss.def.name} ${Math.max(0, Math.ceil(b.boss.hp)).toLocaleString()} / ${b.boss.def.hp.toLocaleString()}`
          : `🎯 ${Math.floor(b.killGold).toLocaleString()} / ${b.target.toLocaleString()}G`,
      )
      .setColor(b.boss ? '#ff4444' : '#ffffff');
    this.critText.setVisible(b.critical);
    if (b.critical) this.critText.setText(`⚠ 방송 폐지까지 ${Math.max(0, b.critT).toFixed(1)}초`);
    this.hypeBar.width = 200 * clamp(b.D, 0, 1);
    this.hypeBar.fillColor = b.tier.color;
    this.hypeLabel.setText(b.tier.label);
    this.vignette.fillAlpha = b.D >= 0.75 ? (b.D - 0.75) * 0.8 : 0;
  }
}
