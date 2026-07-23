import Phaser from 'phaser';
import { GameState, save } from '../state.js';
import { UPGRADES, SKILL_COST, upgradeCost } from '../data/upgrades.js';
import { SKILLS } from '../data/skills.js';
import { FINAL_EP } from '../data/progression.js';

export default class UpgradeScene extends Phaser.Scene {
  constructor() { super('Upgrade'); }
  create() { this.render(); }

  render() {
    this.children.removeAll();
    const cx = 640;
    this.add.text(cx, 50, '용사 강화', { fontSize: '40px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    this.add.text(cx, 100, `보유 골드  ${Math.floor(GameState.gold).toLocaleString()}G`, { fontSize: '22px', color: '#ffdd44' }).setOrigin(0.5);

    let y = 170;
    for (const [key, u] of Object.entries(UPGRADES)) {
      const lv = GameState.upgradeLevels[key];
      const c = upgradeCost(key, lv);
      const afford = GameState.gold >= c;
      const row = this.add.text(280, y, `${u.name}  Lv.${lv}   +${u.delta} → ${c.toLocaleString()}G`,
        { fontSize: '20px', color: afford ? '#ffffff' : '#666677' }).setInteractive({ useHandCursor: afford });
      if (afford) row.on('pointerdown', () => this.buy(key));
      y += 42;
    }

    // 스킬 습득 (해금 영구)
    const locked = Object.keys(SKILLS).filter((s) => !GameState.skills.includes(s));
    if (locked.length) {
      const afford = GameState.gold >= SKILL_COST;
      const row = this.add.text(280, y, `스킬 습득  (${locked.length}종 남음) → ${SKILL_COST}G`,
        { fontSize: '20px', color: afford ? '#88ffcc' : '#556655' }).setInteractive({ useHandCursor: afford });
      if (afford) row.on('pointerdown', () => this.buySkill(locked));
      y += 42;
    }
    this.add.text(280, y + 10, `보유 스킬: ${GameState.skills.join(', ')}`, { fontSize: '15px', color: '#8888aa' });

    const nextEp = GameState.episode + 1;
    const label = nextEp >= FINAL_EP ? '⚔ 최종화: 마왕 vs 용사 (클릭)' : `▶ ${nextEp}화 방송 시작 (클릭)`;
    const next = this.add.text(cx, 650, label, { fontSize: '26px', color: '#ffaa44' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: next, alpha: 0.5, duration: 700, yoyo: true, repeat: -1 });
    next.on('pointerdown', () => { GameState.episode++; this.scene.start('Broadcast'); });
  }

  buy(key) {
    const lv = GameState.upgradeLevels[key];
    const c = upgradeCost(key, lv);
    if (GameState.gold < c) return;
    GameState.gold -= c;
    const u = UPGRADES[key];
    GameState.hero[u.stat] = Math.round((GameState.hero[u.stat] + u.delta) * 100) / 100;
    GameState.upgradeLevels[key]++;
    this.render();
  }

  buySkill(locked) {
    if (GameState.gold < SKILL_COST) return;
    GameState.gold -= SKILL_COST;
    GameState.skills.push(Phaser.Utils.Array.GetRandom(locked));
    save(); // 스킬 영구 해금
    this.render();
  }
}
