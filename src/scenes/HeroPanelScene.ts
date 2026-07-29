import Phaser from 'phaser';
import { clamp } from '../formulas.ts';
import { gameState, heroPower } from '../game/store.ts';
import { DASH_CD } from '../game/battleSim.ts';
import { CANVAS, SUMMON_Y, CX } from '../game/layout.ts';
import { UPGRADES, statOf, type UpgradeKey } from '../data/upgrades.ts';
import { SKILLS } from '../data/skills.ts';
import { TRAITS, heroAtkMult } from '../data/traits.ts';
import type BattleScene from './BattleScene.ts';

// 용사 모드 하단 패널 (RPG UI). 소환 바와 같은 자리(SUMMON_Y~CANVAS.H)를 쓰고 모드에 따라 켜진다.
// HudScene과 같은 패턴 — 매 프레임 BattleScene 필드를 직접 읽는다 (store 아님, React 리렌더 방지).
// 씬 sleep/wake 대신 루트 컨테이너 visible로 토글: launch 타이밍에 얽히지 않는다.

const H0 = SUMMON_Y; // 패널 상단
const PANEL_H = CANVAS.H - SUMMON_Y;
const COL2 = 300; // 특성 칸 시작 x
const COL3 = 700; // 스킬 칸 시작 x
const HP_W = 200;
const DASH_W = 136; // 140 + 이 폭이 COL2 구분선(280)을 넘지 않아야 한다
const TRAITS_PER_ROW = 3; // 강화 5종을 한 줄에 다 넣으면 스킬 칸을 침범한다
const SKILL_W = 108;
const SKILL_GAP = 8;
const SLOTS = 4; // 스킬 슬롯 수 = 숫자키 1~4

interface SkillSlot {
  name: Phaser.GameObjects.Text;
  bg: Phaser.GameObjects.Rectangle;
  cd: Phaser.GameObjects.Rectangle; // 하단 쿨 게이지 (소환 카드 cd와 같은 패턴)
  cdText: Phaser.GameObjects.Text;
}

export default class HeroPanelScene extends Phaser.Scene {
  battle!: BattleScene;
  root!: Phaser.GameObjects.Container;
  hpBar!: Phaser.GameObjects.Rectangle;
  hpText!: Phaser.GameObjects.Text;
  dashBar!: Phaser.GameObjects.Rectangle;
  dashText!: Phaser.GameObjects.Text;
  powerText!: Phaser.GameObjects.Text;
  traitText!: Phaser.GameObjects.Text;
  statText!: Phaser.GameObjects.Text;
  slots!: SkillSlot[];

  constructor() {
    super('HeroPanel');
  }

  create() {
    this.battle = this.scene.get('Battle') as BattleScene;
    const add = this.add;
    const objs: Phaser.GameObjects.GameObject[] = [];

    // 양피지/금테 톤 — 스트리밍 UI(남색)와 한눈에 구분된다
    objs.push(add.rectangle(CX, H0 + PANEL_H / 2, CANVAS.W, PANEL_H, 0x241d14));
    objs.push(add.line(0, 0, 0, H0, CANVAS.W, H0, 0x8a6a3a).setOrigin(0).setLineWidth(2));

    // ── 좌: 용사 상태 ──
    objs.push(add.image(48, H0 + 46, 'hero').setDisplaySize(48, 48));
    objs.push(add.text(84, H0 + 14, '용사', { fontSize: '15px', fontStyle: 'bold', color: '#ffcc55' }));
    objs.push(add.rectangle(84, H0 + 38, HP_W, 14, 0x120d08).setOrigin(0));
    this.hpBar = add.rectangle(84, H0 + 38, HP_W, 14, 0x44ff66).setOrigin(0);
    this.hpText = add.text(88, H0 + 39, '', { fontSize: '11px', fontStyle: 'bold', color: '#0a0a0a' });
    objs.push(add.text(84, H0 + 60, '⚡ 대시', { fontSize: '11px', color: '#c8b48a' }));
    objs.push(add.rectangle(140, H0 + 62, DASH_W, 10, 0x120d08).setOrigin(0));
    this.dashBar = add.rectangle(140, H0 + 62, DASH_W, 10, 0x66ccff).setOrigin(0);
    this.dashText = add.text(84, H0 + 80, '[Shift]', { fontSize: '11px', color: '#66ccff' });
    objs.push(this.hpBar, this.hpText, this.dashBar, this.dashText);

    // ── 중: 특성 = 강화 레벨 5종 + 종합 전투력 ──
    objs.push(add.line(0, 0, COL2 - 20, H0 + 12, COL2 - 20, CANVAS.H - 12, 0x5a4628).setOrigin(0));
    objs.push(add.text(COL2, H0 + 14, '특성', { fontSize: '13px', fontStyle: 'bold', color: '#ffcc55' }));
    this.powerText = add.text(COL2 + 44, H0 + 15, '', { fontSize: '12px', color: '#ffdd88' });
    // 11px — Lv 뒤에 현재 값이 붙어 12px면 3열이 스킬 칸(COL3)을 넘본다
    this.traitText = add.text(COL2, H0 + 36, '', { fontSize: '11px', color: '#c8b48a', lineSpacing: 3 });
    this.statText = add.text(COL2, H0 + 82, '', { fontSize: '11px', color: '#8a7a5a' });
    objs.push(this.powerText, this.traitText, this.statText);

    // ── 우: 스킬 슬롯 + 쿨타임 ──
    objs.push(add.line(0, 0, COL3 - 20, H0 + 12, COL3 - 20, CANVAS.H - 12, 0x5a4628).setOrigin(0));
    objs.push(add.text(COL3, H0 + 14, '스킬', { fontSize: '13px', fontStyle: 'bold', color: '#ffcc55' }));
    this.slots = [];
    for (let i = 0; i < SLOTS; i++) {
      const x = COL3 + i * (SKILL_W + SKILL_GAP);
      const bg = add
        .rectangle(x, H0 + 36, SKILL_W, 62, 0x1a140c)
        .setOrigin(0)
        .setStrokeStyle(2, 0x5a4628);
      objs.push(bg, add.text(x + 6, H0 + 40, `[${i + 1}]`, { fontSize: '11px', color: '#8a7a5a' }));
      const name = add.text(x + 6, H0 + 58, '', { fontSize: '12px', fontStyle: 'bold', color: '#e6d8b8' });
      const cd = add.rectangle(x + 2, H0 + 92, 0, 4, 0x66ccff).setOrigin(0);
      const cdText = add.text(x + SKILL_W - 6, H0 + 40, '', { fontSize: '12px', color: '#ff9933' }).setOrigin(1, 0);
      objs.push(name, cd, cdText);
      this.slots.push({ name, bg, cd, cdText });
    }

    this.root = add.container(0, 0, objs).setVisible(false);
  }

  update() {
    const b = this.battle;
    const on = gameState().mode === 'hero';
    this.root.setVisible(on);
    if (!on || !b || !b.hero) return;

    const H = b.hero;
    const S = gameState();
    const ratio = clamp(H.hp / H.maxHp, 0, 1);
    this.hpBar.width = HP_W * ratio;
    this.hpBar.fillColor = ratio > 0.25 ? 0x44ff66 : 0xff4444;
    this.hpText.setText(`${Math.max(0, Math.ceil(H.hp))} / ${Math.round(H.maxHp)}`);

    // 대시: 쿨이 돌면 줄어들고, 다 차면 파란 전폭 + [Shift] 안내
    const ready = H.dashCd <= 0;
    this.dashBar.width = DASH_W * (1 - clamp(H.dashCd / DASH_CD, 0, 1));
    this.dashBar.fillColor = ready ? 0x66ccff : 0x445566;
    this.dashText.setText(ready ? '[Shift] 준비' : `${H.dashCd.toFixed(1)}s`).setColor(ready ? '#66ccff' : '#8a7a5a');

    // 획득 특성은 전투력 옆에 — 강화 레벨 두 줄 밑에 끼우면 스킬 칸을 침범한다
    const owned = S.traits.map((t) => `${TRAITS[t].icon}${TRAITS[t].name}`).join(' ');
    this.powerText.setText(`전투력 ×${heroPower(S.hero).toFixed(2)}${owned ? '   ' + owned : ''}`);
    // Lv 뒤에 현재 값도 붙인다 — 도네 카드 상승분은 Lv를 안 올려서 Lv만 보면 반영이 안 된 것처럼 보인다(#13)
    const traits = (Object.keys(UPGRADES) as UpgradeKey[]).map(
      (k) => `${UPGRADES[k].name} Lv.${S.upgradeLevels[k]}·${statOf(k, S.hero)}`,
    );
    this.traitText.setText([traits.slice(0, TRAITS_PER_ROW), traits.slice(TRAITS_PER_ROW)].map((r) => r.join('   ')));
    // 공격력은 광전사 보정을 얹은 실효값 — HP가 깎일수록 이 숫자가 올라가는 게 보여야 특성이 읽힌다
    const mult = heroAtkMult(S.traits, ratio);
    this.statText.setText(
      `⚔ ${Math.round(H.atk * mult)}${mult > 1 ? ` (×${mult.toFixed(2)})` : ''} ×${H.atkSpd.toFixed(2)}/s   ♥ ${Math.round(H.maxHp)}   👟 ${Math.round(H.speed)}   📏 ${Math.round(H.range)}`,
    );

    for (let i = 0; i < SLOTS; i++) {
      const s = this.slots[i];
      const id = S.skills[i];
      if (!id) {
        s.name.setText('—').setColor('#4a4030');
        s.bg.setStrokeStyle(2, 0x3a2e1c);
        s.cd.width = 0;
        s.cdText.setText('');
        continue;
      }
      const left = b.skillCd[id] ?? 0;
      s.name.setText(SKILLS[id].name).setColor(left > 0 ? '#6a5f4a' : '#e6d8b8');
      s.bg.setStrokeStyle(2, left > 0 ? 0x3a2e1c : 0xffcc55);
      s.cd.width = (SKILL_W - 4) * (1 - clamp(left / SKILLS[id].cd, 0, 1));
      s.cdText.setText(left > 0 ? left.toFixed(1) : '');
    }
  }
}
