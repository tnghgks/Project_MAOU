import Phaser from 'phaser';
import { GameState, save } from '../state.js';
import { HERO_TARGET_HP } from '../data/progression.js';

// ponytail: 스텁 — 시청률·리듬 성적 반영, 전용 연출·사운드는 보류. 판정은 스탯비율(GDD 7장) 근사.
const ENDINGS = {
  bad:    { title: 'BAD — "싱겁네요"', desc: '용사가 너무 약했다. 마왕은 이겼지만 채널은 망했다.', color: '#8899aa' },
  best:   { title: 'BEST — "전설의 방송"', desc: '마왕은 쓰러졌지만 역대 최고 동접을 달성했다.', color: '#ffdd44' },
  hidden: { title: 'HIDDEN — "1분 컷"', desc: '용사가 너무 강했다. 마왕 즉사. 클립만 남았다.', color: '#cc66ff' },
};

export default class EndingScene extends Phaser.Scene {
  constructor() { super('Ending'); }
  create(data) {
    const ratio = GameState.hero.maxHp / HERO_TARGET_HP;
    const e = ratio < 0.6 ? ENDINGS.bad : ratio > 1.2 ? ENDINGS.hidden : ENDINGS.best;

    // 최종화 시청 기록 반영
    GameState.records.bestViewers = Math.max(GameState.records.bestViewers, Math.floor(data.peakViewers || 0));
    save();

    const cx = 640;
    this.add.text(cx, 240, e.title, { fontSize: '48px', fontStyle: 'bold', color: e.color }).setOrigin(0.5);
    this.add.text(cx, 320, e.desc, { fontSize: '20px', color: '#cccccc' }).setOrigin(0.5);
    this.add.text(cx, 400, `최종 동접 ${Math.floor(data.peakViewers || 0).toLocaleString()}명`, { fontSize: '18px', color: '#888899' }).setOrigin(0.5);

    const back = this.add.text(cx, 560, '↺ 타이틀로 (클릭)', { fontSize: '24px', color: '#ffdd44' }).setOrigin(0.5);
    this.tweens.add({ targets: back, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
    this.input.once('pointerdown', () => this.scene.start('Title'));
  }
}
