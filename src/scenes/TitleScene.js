import Phaser from 'phaser';
import { GameState, resetRun } from '../state.js';

export default class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    const cx = 640;
    this.add.text(cx, 200, '마왕 채널', { fontSize: '72px', fontStyle: 'bold', color: '#ff4466' }).setOrigin(0.5);
    this.add.text(cx, 270, 'MAOU CHANNEL — 구독과 좋아요, 그리고 나를 죽일 용사', { fontSize: '20px', color: '#aaaaaa' }).setOrigin(0.5);
    this.add.text(cx, 380, [
      '마우스 클릭: 몬스터 소환 (숫자키로 종류 선택)',
      'D F J K: 도네이션 리듬 판정',
      '용사를 죽이지 마라. 단, 죽기 직전까지 몰아붙여라.',
    ].join('\n'), { fontSize: '18px', color: '#dddddd', align: 'center', lineSpacing: 10 }).setOrigin(0.5);

    const r = GameState.records;
    if (r.bestViewers || r.bestGold) {
      this.add.text(cx, 470, `최고 동접 ${r.bestViewers.toLocaleString()}명 · 최고 골드 ${r.bestGold.toLocaleString()}G`, { fontSize: '16px', color: '#888899' }).setOrigin(0.5);
    }

    const start = this.add.text(cx, 550, '▶ 방송 시작 (클릭)', { fontSize: '28px', color: '#ffdd44' }).setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
    this.input.once('pointerdown', () => { resetRun(); this.scene.start('Broadcast'); });
  }
}
