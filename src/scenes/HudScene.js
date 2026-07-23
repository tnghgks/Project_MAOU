import Phaser from 'phaser';
import { clamp } from '../formulas.js';
import { gameState } from '../game/store.js';

// 캔버스 HUD: 매 프레임 BattleScene의 실시간 값을 읽어 렌더 (store 아님 — React 리렌더 방지).
export default class HudScene extends Phaser.Scene {
  constructor() { super('Hud'); }

  create() {
    this.battle = this.scene.get('Battle');
    const add = this.add;

    add.rectangle(640, 20, 1280, 40, 0x1a1a24).setDepth(5); // 상단바 bg
    this.viewerText = add.text(16, 10, '', { fontSize: '18px', color: '#ffffff' }).setDepth(6);
    this.goldText = add.text(220, 10, '', { fontSize: '18px', color: '#ffdd44' }).setDepth(6);
    this.timerText = add.text(860, 10, '', { fontSize: '18px', color: '#ffffff' }).setDepth(6);
    add.text(420, 10, '🔥', { fontSize: '18px' }).setDepth(6);
    add.rectangle(450, 20, 204, 16, 0x000000).setOrigin(0, 0.5).setDepth(6);
    this.hypeBar = add.rectangle(452, 20, 0, 12, 0xff8822).setOrigin(0, 0.5).setDepth(7);
    this.hypeLabel = add.text(670, 10, '', { fontSize: '16px', color: '#ffffff' }).setDepth(6);

    // MP (소환 바 영역)
    this.mpText = add.text(20, 612, '', { fontSize: '15px', color: '#88aaff' }).setDepth(6);
    add.rectangle(120, 620, 300, 12, 0x000000).setOrigin(0, 0.5).setDepth(6);
    this.mpBar = add.rectangle(122, 620, 0, 8, 0x5588ff).setOrigin(0, 0.5).setDepth(7);

    // 벼랑끝 비네팅
    this.vignette = add.rectangle(470, 300, 940, 520, 0xff0000, 0).setDepth(4);
  }

  update() {
    const b = this.battle;
    if (!b || !b.hero) return;
    this.viewerText.setText(`👁 ${Math.floor(b.viewers).toLocaleString()}`);
    this.goldText.setText(`💰 ${Math.floor(gameState().gold).toLocaleString()}G`);
    const t = Math.max(0, b.timeLeft);
    this.timerText.setText(`⏱ ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
    this.hypeBar.width = 200 * clamp(b.D, 0, 1);
    this.hypeBar.fillColor = b.tier.color;
    this.hypeLabel.setText(b.tier.label);
    this.mpText.setText(`MP ${Math.floor(b.mp)}/100`);
    this.mpBar.width = 296 * (b.mp / 100);
    this.vignette.fillAlpha = b.D >= 0.75 ? (b.D - 0.75) * 0.8 : 0;
  }
}
