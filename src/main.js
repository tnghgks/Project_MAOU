import Phaser from 'phaser';
import BroadcastScene from './BroadcastScene.js';

class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    const cx = 640;
    this.add.text(cx, 220, '마왕 채널', { fontSize: '72px', fontStyle: 'bold', color: '#ff4466' }).setOrigin(0.5);
    this.add.text(cx, 290, 'MAOU CHANNEL — 구독과 좋아요, 그리고 나를 죽일 용사', { fontSize: '20px', color: '#aaaaaa' }).setOrigin(0.5);
    this.add.text(cx, 400, [
      '마우스 클릭: 몬스터 소환 (1/2/3 키로 종류 선택)',
      'D F J K: 도네이션 리듬 판정',
      '용사를 죽이지 마라. 단, 죽기 직전까지 몰아붙여라.',
    ].join('\n'), { fontSize: '18px', color: '#dddddd', align: 'center', lineSpacing: 10 }).setOrigin(0.5);
    const start = this.add.text(cx, 540, '▶ 방송 시작 (클릭)', { fontSize: '28px', color: '#ffdd44' }).setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
    this.input.once('pointerdown', () => this.scene.start('Broadcast'));
  }
}

class ResultScene extends Phaser.Scene {
  constructor() { super('Result'); }
  create(data) {
    const cx = 640;
    if (data.died) {
      this.add.text(cx, 180, '📵 방 송 사 고', { fontSize: '56px', fontStyle: 'bold', color: '#ff3333' }).setOrigin(0.5);
      this.add.text(cx, 250, '용사가 사망했습니다. 채널이 폭파되었습니다.', { fontSize: '20px', color: '#aaaaaa' }).setOrigin(0.5);
    } else {
      this.add.text(cx, 180, '📺 방송 종료', { fontSize: '56px', fontStyle: 'bold', color: '#44ddff' }).setOrigin(0.5);
      this.add.text(cx, 250, '오늘도 무사히(?) 방송을 마쳤습니다.', { fontSize: '20px', color: '#aaaaaa' }).setOrigin(0.5);
    }
    this.add.text(cx, 380, [
      `최고 동접        ${Math.floor(data.peakViewers).toLocaleString()}명`,
      `총 도네이션      ${data.totalDonated.toLocaleString()}G`,
      `보유 골드        ${Math.floor(data.gold).toLocaleString()}G`,
      `처치한 몬스터    ${data.kills}마리`,
    ].join('\n'), { fontSize: '22px', color: '#ffffff', align: 'left', lineSpacing: 14 }).setOrigin(0.5);
    const retry = this.add.text(cx, 560, '↺ 다시 방송하기 (클릭)', { fontSize: '26px', color: '#ffdd44' }).setOrigin(0.5);
    this.tweens.add({ targets: retry, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
    this.input.once('pointerdown', () => this.scene.start('Title'));
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 1280,
  height: 720,
  backgroundColor: '#111118',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [TitleScene, BroadcastScene, ResultScene],
});
