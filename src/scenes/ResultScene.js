import Phaser from 'phaser';
import { GameState } from '../state.js';

export default class ResultScene extends Phaser.Scene {
  constructor() { super('Result'); }
  create(data) {
    const cx = 640;
    if (data.died) {
      this.add.text(cx, 160, '📵 방 송 사 고', { fontSize: '56px', fontStyle: 'bold', color: '#ff3333' }).setOrigin(0.5);
      this.add.text(cx, 230, '용사가 사망했습니다. 채널이 폭파되었습니다.', { fontSize: '20px', color: '#aaaaaa' }).setOrigin(0.5);
    } else {
      this.add.text(cx, 160, `📺 ${GameState.episode}화 종료`, { fontSize: '56px', fontStyle: 'bold', color: '#44ddff' }).setOrigin(0.5);
      this.add.text(cx, 230, '오늘도 무사히(?) 방송을 마쳤습니다.', { fontSize: '20px', color: '#aaaaaa' }).setOrigin(0.5);
    }
    this.add.text(cx, 360, [
      `최고 동접        ${Math.floor(data.peakViewers).toLocaleString()}명`,
      `총 도네이션      ${data.totalDonated.toLocaleString()}G`,
      `보유 골드        ${Math.floor(GameState.gold).toLocaleString()}G`,
      `처치한 몬스터    ${data.kills}마리`,
    ].join('\n'), { fontSize: '22px', color: '#ffffff', align: 'left', lineSpacing: 14 }).setOrigin(0.5);

    const label = data.died ? '↺ 타이틀로 (클릭)' : '▶ 육성 화면으로 (클릭)';
    const next = this.add.text(cx, 550, label, { fontSize: '26px', color: '#ffdd44' }).setOrigin(0.5);
    this.tweens.add({ targets: next, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
    this.input.once('pointerdown', () => this.scene.start(data.died ? 'Title' : 'Upgrade'));
  }
}
