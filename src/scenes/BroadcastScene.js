import Phaser from 'phaser';
import { clamp, danger, hypeTier, donationInterval, donationAmount, judge, skillResult } from '../formulas.js';
import { GameState, save } from '../state.js';
import { MONSTERS } from '../data/monsters.js';
import { SKILLS } from '../data/skills.js';
import { FINAL_EP } from '../data/progression.js';

// 레이아웃 (GDD 5-1)
const ARENA = { x: 0, y: 40, w: 940, h: 520 }; // 전투 아레나
const CHAT_X = 940; // 우측 채팅창
const SUMMON_Y = 560; // 소환 바
const LANE_Y = 640; // 리듬 레인
const HIT_X = 140; // 리듬 판정선 x
const NOTE_SPEED = 400; // px/s
const BEAT = 60 / 128; // 128 BPM
const RUN_TIME = 180; // 방송 1화 = 3분
const FINAL_TIME = 60; // 최종화 축약 (GDD 7장: 긴 리듬 시퀀스 대체)

const KEYS = ['D', 'F', 'J', 'K'];
const KEY_COLORS = { D: 0xff5555, F: 0x55ff88, J: 0x5599ff, K: 0xffcc44 };

const CHAT_POOLS = {
  boring: ['노잼이네요', '다른 방 갑니다', '매니저 뭐하냐', 'ㅡㅡ', '숙제 방송인가...'],
  normal: ['ㅋㅋㅋ', '용사 화이팅', '오 슬라임 나왔다', '응원합니다', '용사 좀 치네'],
  hot: ['개꿀잼ㅋㅋㅋ', '뒤에!! 뒤에!!', '헐', '죽는다죽는다', '도네 쏜다', '!!!!!!!!'],
  allperfect: ['ㅁㅊ', '이게 사람이야?', '클립 따간다', '레전드'],
};
const DONOR_NAMES = ['익명의마족', '고인물시청자', '용사팬클럽', '지나가던슬라임', '마왕성경비병', '전생용사'];

export default class BroadcastScene extends Phaser.Scene {
  constructor() { super('Broadcast'); }

  create() {
    this.isFinal = GameState.episode >= FINAL_EP;

    // ── 방송 중 임시 상태 (메타 상태는 GameState) ──
    const b = GameState.hero;
    this.hero = { x: 470, y: 300, hp: b.maxHp, maxHp: b.maxHp, atk: b.atk, atkSpd: b.atkSpd, speed: b.speed, range: b.range, atkCd: 0, retreatT: 0, retreatCd: 0 };
    this.monsters = [];
    this.arrows = [];
    this.mp = 100;
    this.viewers = 12;
    this.peakViewers = 12;
    this.totalDonated = 0;
    this.kills = 0;
    this.timeLeft = this.isFinal ? FINAL_TIME : RUN_TIME;
    this.donateT = donationInterval(this.viewers);
    this.notes = []; // 활성 리듬 노트
    this.noteResults = [];
    this.chatT = 0;
    this.freezeUntil = 0; // 시간 정지 스킬
    this.over = false;

    // 현재 화에서 소환 가능한 몬스터 (해금 = unlock <= episode)
    this.available = Object.keys(MONSTERS).filter((k) => MONSTERS[k].unlock <= GameState.episode);
    this.selectedType = this.available[0];
    this.summonCd = Object.fromEntries(this.available.map((k) => [k, 0]));

    this.buildUI();

    this.heroSpr = this.add.image(this.hero.x, this.hero.y, 'hero').setScale(1.3);
    this.heroHpBar = this.add.graphics();

    // 입력
    this.input.on('pointerdown', (p) => this.trySummon(p));
    this.input.keyboard.on('keydown', (e) => {
      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= this.available.length) this.selectType(this.available[digit - 1]);
      else if (KEYS.includes(e.key.toUpperCase())) this.hitNote(e.key.toUpperCase());
    });

    this.pushChat('시스템', this.isFinal ? '최종화 — 마왕이 직접 나선다!' : `${GameState.episode}화 방송이 시작되었습니다.`, '#888888');
  }

  buildUI() {
    const add = this.add;
    // 배경 패널
    add.rectangle(640, 20, 1280, 40, 0x1a1a24).setDepth(5);
    add.rectangle(CHAT_X + 170, 380, 340, 680, 0x14141c).setDepth(5);
    add.rectangle(470, (SUMMON_Y + LANE_Y) / 2, 940, LANE_Y - SUMMON_Y, 0x1a1a24).setDepth(5);
    add.rectangle(470, (LANE_Y + 720) / 2, 940, 720 - LANE_Y, 0x0d0d14).setDepth(5);
    add.line(0, 0, ARENA.x, SUMMON_Y, 940, SUMMON_Y, 0x333344).setOrigin(0).setDepth(5);

    // 상단 상태바
    this.viewerText = add.text(16, 10, '', { fontSize: '18px', color: '#ffffff' }).setDepth(6);
    this.goldText = add.text(220, 10, '', { fontSize: '18px', color: '#ffdd44' }).setDepth(6);
    this.timerText = add.text(860, 10, '', { fontSize: '18px', color: '#ffffff' }).setDepth(6);
    add.text(420, 10, '🔥', { fontSize: '18px' }).setDepth(6);
    add.rectangle(450, 20, 204, 16, 0x000000).setOrigin(0, 0.5).setDepth(6);
    this.hypeBar = add.rectangle(452, 20, 0, 12, 0xff8822).setOrigin(0, 0.5).setDepth(7);
    this.hypeLabel = add.text(670, 10, '', { fontSize: '16px', color: '#ffffff' }).setDepth(6);

    // 채팅창
    add.text(CHAT_X + 12, 50, '💬 실시간 채팅', { fontSize: '16px', color: '#8888aa' }).setDepth(6);
    this.chatLines = [];

    // 소환 버튼 (해금된 몬스터만)
    this.summonBtns = {};
    let bx = 20;
    this.available.forEach((k, i) => {
      const m = MONSTERS[k];
      const btn = add.rectangle(bx, SUMMON_Y + 14, 150, 30, 0x2a2a3a).setOrigin(0).setDepth(6).setInteractive();
      add.text(bx + 6, SUMMON_Y + 20, `${i + 1}.${m.name} ${m.mp}`, { fontSize: '12px', color: '#ffffff' }).setDepth(7);
      btn.on('pointerdown', (p, lx, ly, ev) => { ev.stopPropagation(); this.selectType(k); });
      this.summonBtns[k] = btn;
      bx += 158;
    });
    this.mpText = add.text(20, SUMMON_Y + 52, '', { fontSize: '15px', color: '#88aaff' }).setDepth(6);
    add.rectangle(120, SUMMON_Y + 60, 300, 12, 0x000000).setOrigin(0, 0.5).setDepth(6);
    this.mpBar = add.rectangle(122, SUMMON_Y + 60, 0, 8, 0x5588ff).setOrigin(0, 0.5).setDepth(7);
    this.selectType(this.selectedType);

    // 리듬 레인
    add.circle(HIT_X, LANE_Y + 40, 24).setStrokeStyle(3, 0xffffff).setDepth(6);
    add.text(20, LANE_Y + 30, 'DFJK▶', { fontSize: '16px', color: '#555566' }).setDepth(6);
    this.judgeText = add.text(HIT_X, LANE_Y + 8, '', { fontSize: '16px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(8);

    this.vignette = add.rectangle(470, 300, 940, 520, 0xff0000, 0).setDepth(4);
  }

  selectType(k) {
    this.selectedType = k;
    for (const [t, btn] of Object.entries(this.summonBtns)) btn.setFillStyle(t === k ? 0x555577 : 0x2a2a3a);
  }

  // ── 소환 ──
  trySummon(p) {
    if (this.over) return;
    if (p.x < ARENA.x || p.x > ARENA.x + ARENA.w || p.y < ARENA.y || p.y > SUMMON_Y) return;
    const t = this.selectedType;
    const def = MONSTERS[t];
    if (this.mp < def.mp || this.summonCd[t] > 0) return;
    if (Phaser.Math.Distance.Between(p.x, p.y, this.hero.x, this.hero.y) < 150) {
      this.floatText(p.x, p.y, '용사와 너무 가까움!', '#ff6666');
      return;
    }
    this.mp -= def.mp;
    this.summonCd[t] = 1.5;
    const spr = this.add.image(p.x, p.y, `m_${t}`).setScale(def.size / 16); // 스프라이트 16px 기준 스케일
    this.monsters.push({ type: t, def, hp: def.hp, x: p.x, y: p.y, atkCd: 0, spr });
  }

  // ── 도네이션 → 리듬 ──
  fireDonation() {
    const amt = donationAmount(this.viewers);
    GameState.gold += amt;
    this.totalDonated += amt;
    const name = Phaser.Utils.Array.GetRandom(DONOR_NAMES);
    this.pushChat('🎁 후원', `${name}님 ${amt.toLocaleString()}G!`, '#ffdd44');
    // ponytail: 시퀀스 진행 중 도네는 골드만 지급, 노트 미생성 (레인 겹침 방지)
    if (this.notes.length === 0) this.spawnNoteSeq();
  }

  spawnNoteSeq() {
    this.noteResults = [];
    const now = this.time.now / 1000; // seam: audio clock — BGM 도입 시 AudioContext.currentTime 기준으로 교체
    for (let i = 0; i < 4; i++) {
      const key = Phaser.Utils.Array.GetRandom(KEYS);
      const hitTime = now + 1.8 + i * BEAT;
      const spr = this.add.circle(0, LANE_Y + 40, 18, KEY_COLORS[key]).setDepth(7);
      const txt = this.add.text(0, LANE_Y + 40, key, { fontSize: '18px', fontStyle: 'bold', color: '#000000' }).setOrigin(0.5).setDepth(8);
      this.notes.push({ key, hitTime, spr, txt, done: false });
    }
  }

  hitNote(key) {
    const now = this.time.now / 1000;
    const note = this.notes.find((n) => !n.done && Math.abs(now - n.hitTime) <= 0.2);
    if (!note) return;
    const result = note.key === key ? judge((now - note.hitTime) * 1000) : 'miss';
    this.resolveNote(note, result);
  }

  resolveNote(note, result) {
    note.done = true;
    note.spr.destroy();
    note.txt.destroy();
    this.noteResults.push(result);
    const colors = { perfect: '#ffee44', good: '#66ff88', miss: '#ff5555' };
    this.judgeText.setText(result.toUpperCase()).setColor(colors[result]);
    this.time.delayedCall(400, () => this.judgeText.setText(''));
    if (this.noteResults.length === 4) {
      const res = skillResult(this.noteResults);
      this.notes = [];
      this.fireSkill(res);
    }
  }

  // ── 스킬: 보유 스킬 중 랜덤 1개가 리듬 배율로 발동 (GDD 4장) ──
  fireSkill(res) {
    if (res.penalty) {
      this.viewers = Math.max(5, this.viewers * 0.95);
      this.pushChat('시스템', '스킬 불발... 시청자가 실망했다', '#ff6666');
      return;
    }
    const skill = SKILLS[Phaser.Utils.Array.GetRandom(GameState.skills)];
    skill.effect(this, res.mult);
    this.cameras.main.flash(res.clear ? 400 : 150, 255, 255, 200);
    this.floatText(this.hero.x, this.hero.y - 40, `⚡ ${skill.name} ${res.grade} ×${res.mult}`, '#ffee44');
    if (res.clear) { // ALL PERFECT: 화면 전체 클리어
      for (const m of this.monsters) this.hitFx(m, 9999);
      for (const line of CHAT_POOLS.allperfect) this.pushChat('시청자', line, '#ffee44');
    }
    this.time.delayedCall(300, () => {
      this.children.list.filter((c) => c.fillColor === 0xffffaa).forEach((c) => c.destroy());
    });
  }

  // 스킬 타격 이펙트 (data/skills.js에서 호출)
  hitFx(m, dmg) {
    this.damageMonster(m, dmg);
    this.add.circle(m.x, m.y, 14, 0xffffaa, 0.8).setDepth(3);
  }

  damageMonster(m, dmg) {
    m.hp -= dmg;
    m.spr.setAlpha(0.5);
    this.time.delayedCall(80, () => { if (m.spr.active) m.spr.setAlpha(1); });
    if (m.hp <= 0 && !m.dead) {
      m.dead = true;
      GameState.gold += m.def.gold;
      this.kills++;
      m.spr.destroy();
    }
  }

  // ── 채팅 ──
  pushChat(who, msg, color = '#cccccc') {
    const t = this.add.text(CHAT_X + 12, 0, `${who}: ${msg}`, { fontSize: '14px', color, wordWrap: { width: 316 } }).setDepth(6);
    this.chatLines.push(t);
    if (this.chatLines.length > 20) this.chatLines.shift().destroy();
    let y = 700;
    for (let i = this.chatLines.length - 1; i >= 0; i--) {
      y -= this.chatLines[i].height + 4;
      this.chatLines[i].setY(y);
      this.chatLines[i].setVisible(y > 70);
    }
  }

  floatText(x, y, msg, color) {
    const t = this.add.text(x, y, msg, { fontSize: '16px', fontStyle: 'bold', color }).setOrigin(0.5).setDepth(9);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  // ── 메인 루프 ──
  update(_, deltaMs) {
    if (this.over) return;
    const dt = Math.min(deltaMs / 1000, 0.05); // 탭 비활성 delta 폭주 방지
    const now = this.time.now / 1000;
    const H = this.hero;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) return this.endRun(false);

    this.mp = clamp(this.mp + 5 * dt, 0, 100);
    for (const k in this.summonCd) this.summonCd[k] = Math.max(0, this.summonCd[k] - dt);

    const near = this.monsters.filter((m) => !m.dead && Phaser.Math.Distance.Between(m.x, m.y, H.x, H.y) < 200).length;
    const D = danger(H.hp / H.maxHp, near);
    const tier = hypeTier(D);
    this.viewers = Math.max(5, this.viewers * (1 + tier.rate * dt));
    this.peakViewers = Math.max(this.peakViewers, this.viewers);

    this.donateT -= dt;
    if (this.donateT <= 0) {
      this.fireDonation();
      this.donateT = donationInterval(this.viewers);
    }

    this.updateHero(dt, near);
    this.updateMonsters(dt);
    this.updateArrows(dt);
    this.updateNotes(now);
    this.updateChat(dt, D);
    this.updateHUD(D, tier);

    if (H.hp <= 0) return this.endRun(true);
  }

  updateHero(dt, nearCount) {
    const H = this.hero;
    const alive = this.monsters.filter((m) => !m.dead);
    H.atkCd = Math.max(0, H.atkCd - dt);
    H.retreatT = Math.max(0, H.retreatT - dt);
    H.retreatCd = Math.max(0, H.retreatCd - dt);

    if (nearCount === 0 && alive.length === 0) H.hp = Math.min(H.maxHp, H.hp + H.maxHp * 0.005 * dt);
    if (H.hp / H.maxHp <= 0.25 && H.retreatCd <= 0) { H.retreatT = 2; H.retreatCd = 6; }

    let vx = 0, vy = 0;
    if (H.retreatT > 0 && alive.length) {
      let sx = 0, sy = 0;
      for (const m of alive) { sx += H.x - m.x; sy += H.y - m.y; }
      const len = Math.hypot(sx, sy) || 1;
      vx = (sx / len) * H.speed; vy = (sy / len) * H.speed;
    } else {
      let target = null, best = 300;
      for (const m of alive) {
        const d = Phaser.Math.Distance.Between(m.x, m.y, H.x, H.y);
        if (d < best) { best = d; target = m; }
      }
      if (target) {
        const d = best;
        if (d > H.range) {
          vx = ((target.x - H.x) / d) * H.speed;
          vy = ((target.y - H.y) / d) * H.speed;
        } else if (H.atkCd <= 0) {
          H.atkCd = 1 / H.atkSpd;
          this.damageMonster(target, H.atk);
        }
      } else if (Phaser.Math.Distance.Between(H.x, H.y, 470, 300) > 20) {
        const d = Phaser.Math.Distance.Between(H.x, H.y, 470, 300);
        vx = ((470 - H.x) / d) * H.speed * 0.5;
        vy = ((300 - H.y) / d) * H.speed * 0.5;
      }
    }
    H.x = clamp(H.x + vx * dt, ARENA.x + 20, ARENA.x + ARENA.w - 20);
    H.y = clamp(H.y + vy * dt, ARENA.y + 20, SUMMON_Y - 20);
    this.heroSpr.setPosition(H.x, H.y);
    if (vx) this.heroSpr.setFlipX(vx < 0); // 진행 방향으로 좌우 반전

    this.heroHpBar.clear();
    this.heroHpBar.fillStyle(0x000000).fillRect(H.x - 16, H.y - 22, 32, 5);
    this.heroHpBar.fillStyle(H.hp / H.maxHp > 0.25 ? 0x44ff66 : 0xff4444).fillRect(H.x - 15, H.y - 21, 30 * (H.hp / H.maxHp), 3);
  }

  updateMonsters(dt) {
    const H = this.hero;
    this.monsters = this.monsters.filter((m) => !m.dead);
    if (this.time.now < this.freezeUntil) return; // 시간 정지
    for (const m of this.monsters) {
      m.atkCd = Math.max(0, m.atkCd - dt);
      const d = Phaser.Math.Distance.Between(m.x, m.y, H.x, H.y);
      if (d > m.def.range) {
        m.x += ((H.x - m.x) / d) * m.def.speed * dt;
        m.y += ((H.y - m.y) / d) * m.def.speed * dt;
        m.spr.setPosition(m.x, m.y);
        m.spr.setFlipX(H.x < m.x); // 용사 쪽을 바라봄
      } else if (m.atkCd <= 0) {
        m.atkCd = m.def.atkCd;
        if (m.def.ranged) {
          const spr = this.add.image(m.x, m.y, 'arrow').setDepth(2).setScale(0.7);
          spr.setRotation(Math.atan2(H.y - m.y, H.x - m.x) + Math.PI / 2); // 세로 단검을 진행 방향으로
          this.arrows.push({ x: m.x, y: m.y, tx: H.x, ty: H.y, spr, dmg: m.def.dmg });
        } else {
          H.hp -= m.def.dmg;
          if (m.def.suicide) { m.dead = true; m.spr.destroy(); } // 폭탄 박쥐 자폭
        }
      }
    }
  }

  updateArrows(dt) {
    const H = this.hero;
    this.arrows = this.arrows.filter((a) => {
      const d = Phaser.Math.Distance.Between(a.x, a.y, a.tx, a.ty);
      if (d < 8) {
        if (Phaser.Math.Distance.Between(a.tx, a.ty, H.x, H.y) < 30) H.hp -= a.dmg;
        a.spr.destroy();
        return false;
      }
      a.x += ((a.tx - a.x) / d) * 300 * dt;
      a.y += ((a.ty - a.y) / d) * 300 * dt;
      a.spr.setPosition(a.x, a.y);
      return true;
    });
  }

  updateNotes(now) {
    for (const n of this.notes) {
      if (n.done) continue;
      const x = HIT_X + (n.hitTime - now) * NOTE_SPEED;
      n.spr.setX(x);
      n.txt.setX(x);
      if (now - n.hitTime > 0.14) this.resolveNote(n, 'miss');
    }
  }

  updateChat(dt, D) {
    this.chatT -= dt;
    if (this.chatT > 0) return;
    const lps = clamp(1 + (this.viewers / 5000) * 7, 1, 8);
    this.chatT = 1 / lps;
    const pool = D < 0.2 ? CHAT_POOLS.boring : D < 0.75 ? CHAT_POOLS.normal : CHAT_POOLS.hot;
    const color = D >= 0.75 ? '#ff9966' : D < 0.2 ? '#7777aa' : '#cccccc';
    this.pushChat(`시청자${Phaser.Math.Between(1, 999)}`, Phaser.Utils.Array.GetRandom(pool), color);
  }

  updateHUD(D, tier) {
    this.viewerText.setText(`👁 ${Math.floor(this.viewers).toLocaleString()}`);
    this.goldText.setText(`💰 ${Math.floor(GameState.gold).toLocaleString()}G`);
    const t = Math.max(0, this.timeLeft);
    this.timerText.setText(`⏱ ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
    this.hypeBar.width = 200 * clamp(D, 0, 1);
    this.hypeBar.fillColor = tier.color;
    this.hypeLabel.setText(tier.label);
    this.mpText.setText(`MP ${Math.floor(this.mp)}/100`);
    this.mpBar.width = 296 * (this.mp / 100);
    this.vignette.fillAlpha = D >= 0.75 ? (D - 0.75) * 0.8 : 0;
  }

  endRun(died) {
    this.over = true;
    if (!died) {
      GameState.records.bestViewers = Math.max(GameState.records.bestViewers, Math.floor(this.peakViewers));
      GameState.records.bestGold = Math.max(GameState.records.bestGold, Math.floor(GameState.gold));
      save();
    }
    if (died) {
      this.pushChat('시청자', '...', '#666666');
      this.pushChat('시스템', '방송이 종료되었습니다', '#ff4444');
      this.cameras.main.shake(500, 0.01);
    }
    this.time.delayedCall(died ? 1500 : 500, () => {
      if (!died && this.isFinal) {
        this.scene.start('Ending', { peakViewers: this.peakViewers });
      } else {
        this.scene.start('Result', { died, peakViewers: this.peakViewers, totalDonated: this.totalDonated, kills: this.kills });
      }
    });
  }
}
