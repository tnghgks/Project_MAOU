import Phaser from 'phaser';
import { clamp, danger, hypeTier, donationInterval, donationAmount } from '../formulas.js';
import { gameState } from '../game/store.js';
import { bus } from '../game/events.js';
import { MONSTERS } from '../data/monsters.js';
import { SKILLS } from '../data/skills.js';
import { FINAL_EP } from '../data/progression.js';

// 레이아웃 (GDD 5-1)
export const ARENA = { x: 0, y: 40, w: 940, h: 520 };
export const SUMMON_Y = 560; // 소환 바
const RUN_TIME = 180; // 방송 1화 = 3분
const FINAL_TIME = 60; // 최종화 축약 (GDD 7장)

const CHAT_POOLS = {
  boring: ['노잼이네요', '다른 방 갑니다', '매니저 뭐하냐', 'ㅡㅡ', '숙제 방송인가...'],
  normal: ['ㅋㅋㅋ', '용사 화이팅', '오 슬라임 나왔다', '응원합니다', '용사 좀 치네'],
  hot: ['개꿀잼ㅋㅋㅋ', '뒤에!! 뒤에!!', '헐', '죽는다죽는다', '도네 쏜다', '!!!!!!!!'],
  allperfect: ['ㅁㅊ', '이게 사람이야?', '클립 따간다', '레전드'],
};
const DONOR_NAMES = ['익명의마족', '고인물시청자', '용사팬클럽', '지나가던슬라임', '마왕성경비병', '전생용사'];

export default class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  create() {
    const S = gameState();
    this.isFinal = S.episode >= FINAL_EP;

    const b = S.hero;
    this.hero = { x: 470, y: 300, hp: b.maxHp, maxHp: b.maxHp, atk: b.atk, atkSpd: b.atkSpd, speed: b.speed, range: b.range, atkCd: 0, retreatT: 0, retreatCd: 0 };
    this.monsters = [];
    this.arrows = [];
    this.mp = 100;
    this.viewers = 12;
    this.peakViewers = 12;
    this.viewerSyncT = 0;
    this.totalDonated = 0;
    this.kills = 0;
    this.timeLeft = this.isFinal ? FINAL_TIME : RUN_TIME;
    this.donateT = donationInterval(this.viewers);
    this.freezeUntil = 0; // 시간 정지 스킬
    this.D = 0; this.tier = hypeTier(0); // HudScene가 읽음
    this.over = false;

    this.available = Object.keys(MONSTERS).filter((k) => MONSTERS[k].unlock <= S.episode);
    this.selectedType = this.available[0];
    this.summonCd = Object.fromEntries(this.available.map((k) => [k, 0]));

    this.buildUI();
    this.heroSpr = this.add.image(this.hero.x, this.hero.y, 'hero').setScale(1.3);
    this.heroHpBar = this.add.graphics();

    // 병렬 씬: HUD(캔버스 수치) + Rhythm(리듬 판정)
    this.scene.launch('Hud');
    this.scene.launch('Rhythm');

    // 리듬 결과 → 스킬 발동 (스킬 effect는 monsters/hero에 접근하므로 여기 소유)
    this.onRhythm = (res) => this.fireSkill(res);
    bus.on('rhythm:result', this.onRhythm);
    // Hud/Rhythm 중지는 App 디렉터가 담당 (shutdown 중 형제 씬 stop은 신뢰 불가)
    this.events.once('shutdown', () => bus.off('rhythm:result', this.onRhythm));

    // 입력: 마우스 소환 + 숫자키 = 선택 + 랜덤 위치 즉시 소환 (DFJK는 RhythmScene)
    this.input.on('pointerdown', (p) => this.trySummon(p));
    this.input.keyboard.on('keydown', (e) => {
      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= this.available.length) {
        const t = this.available[digit - 1];
        this.selectType(t);
        this.summonRandom(t);
      }
    });

    this.pushChat('시스템', this.isFinal ? '최종화 — 마왕이 직접 나선다!' : `${S.episode}화 방송이 시작되었습니다.`, '#888888');
  }

  buildUI() {
    const add = this.add;
    // 전투 영역 chrome (상단바=Hud, 리듬레인=Rhythm)
    add.rectangle(470, (SUMMON_Y + 640) / 2, 940, 640 - SUMMON_Y, 0x1a1a24).setDepth(5); // 소환 바
    add.line(0, 0, ARENA.x, SUMMON_Y, 940, SUMMON_Y, 0x333344).setOrigin(0).setDepth(5);

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
    this.selectType(this.selectedType);
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
    this.doSummon(t, p.x, p.y);
  }

  // 숫자키: 용사 반경 150px 밖 랜덤 지점에 즉시 소환
  summonRandom(t) {
    if (this.over) return;
    const def = MONSTERS[t];
    if (this.mp < def.mp || this.summonCd[t] > 0) return;
    for (let i = 0; i < 10; i++) { // ponytail: 아레나가 넓어 몇 번 안에 성공, 실패 시 이번 입력 무시
      const x = Phaser.Math.Between(ARENA.x + 20, ARENA.x + ARENA.w - 20);
      const y = Phaser.Math.Between(ARENA.y + 20, SUMMON_Y - 20);
      if (Phaser.Math.Distance.Between(x, y, this.hero.x, this.hero.y) >= 150) return this.doSummon(t, x, y);
    }
  }

  doSummon(t, x, y) {
    const def = MONSTERS[t];
    this.mp -= def.mp;
    this.summonCd[t] = 1.5;
    const spr = this.add.image(x, y, `m_${t}`).setScale(def.size / 16);
    this.monsters.push({ type: t, def, hp: def.hp, x, y, atkCd: 0, spr });
  }

  // ── 도네이션 → 리듬 (RhythmScene에 시퀀스 요청) ──
  fireDonation() {
    const amt = donationAmount(this.viewers);
    gameState().addGold(amt);
    this.totalDonated += amt;
    const name = Phaser.Utils.Array.GetRandom(DONOR_NAMES);
    this.pushChat('🎁 후원', `${name}님 ${amt.toLocaleString()}G!`, '#ffdd44');
    bus.emit('donation:arrive', { amount: amt, donor: name });
    this.scene.get('Rhythm').spawnSeq(); // 진행 중이면 Rhythm이 무시
  }

  // ── 스킬: 보유 스킬 중 랜덤 1개가 리듬 배율로 발동 (GDD 4장) ──
  fireSkill(res) {
    if (res.penalty) {
      this.viewers = Math.max(5, this.viewers * 0.95);
      this.pushChat('시스템', '스킬 불발... 시청자가 실망했다', '#ff6666');
      return;
    }
    const skill = SKILLS[Phaser.Utils.Array.GetRandom(gameState().skills)];
    skill.effect(this, res.mult);
    this.cameras.main.flash(res.clear ? 400 : 150, 255, 255, 200);
    this.floatText(this.hero.x, this.hero.y - 40, `⚡ ${skill.name} ${res.grade} ×${res.mult}`, '#ffee44');
    if (res.clear) {
      for (const m of this.monsters) this.hitFx(m, 9999);
      for (const line of CHAT_POOLS.allperfect) this.pushChat('시청자', line, '#ffee44');
    }
    this.time.delayedCall(300, () => {
      this.children.list.filter((c) => c.fillColor === 0xffffaa).forEach((c) => c.destroy());
    });
  }

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
      gameState().addGold(m.def.gold);
      this.kills++;
      m.spr.destroy();
    }
  }

  pushChat(who, msg, color = '#cccccc') { bus.emit('chat:line', { who, msg, color }); }

  floatText(x, y, msg, color) {
    const t = this.add.text(x, y, msg, { fontSize: '16px', fontStyle: 'bold', color }).setOrigin(0.5).setDepth(9);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  // ── 메인 루프 ──
  update(_, deltaMs) {
    if (this.over) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    const H = this.hero;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) return this.endRun(false);

    this.mp = clamp(this.mp + 5 * dt, 0, 100);
    for (const k in this.summonCd) this.summonCd[k] = Math.max(0, this.summonCd[k] - dt);

    const near = this.monsters.filter((m) => !m.dead && Phaser.Math.Distance.Between(m.x, m.y, H.x, H.y) < 200).length;
    this.D = danger(H.hp / H.maxHp, near);
    this.tier = hypeTier(this.D);
    this.viewers = Math.max(5, this.viewers * (1 + this.tier.rate * dt));
    this.peakViewers = Math.max(this.peakViewers, this.viewers);

    this.donateT -= dt;
    if (this.donateT <= 0) {
      this.fireDonation();
      this.donateT = donationInterval(this.viewers);
    }

    this.updateHero(dt, near);
    this.updateMonsters(dt);
    this.updateArrows(dt);
    this.updateChat(dt, this.D);

    this.viewerSyncT -= dt;
    if (this.viewerSyncT <= 0) { gameState().setViewers(Math.floor(this.viewers)); this.viewerSyncT = 0.25; }

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
    if (vx) this.heroSpr.setFlipX(vx < 0);

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
        m.spr.setFlipX(H.x < m.x);
      } else if (m.atkCd <= 0) {
        m.atkCd = m.def.atkCd;
        if (m.def.ranged) {
          const spr = this.add.image(m.x, m.y, 'arrow').setDepth(2).setScale(0.7);
          spr.setRotation(Math.atan2(H.y - m.y, H.x - m.x) + Math.PI / 2);
          this.arrows.push({ x: m.x, y: m.y, tx: H.x, ty: H.y, spr, dmg: m.def.dmg });
        } else {
          H.hp -= m.def.dmg;
          if (m.def.suicide) { m.dead = true; m.spr.destroy(); }
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

  updateChat(dt, D) {
    this.chatT = (this.chatT || 0) - dt;
    if (this.chatT > 0) return;
    const lps = clamp(1 + (this.viewers / 5000) * 7, 1, 8);
    this.chatT = 1 / lps;
    const pool = D < 0.2 ? CHAT_POOLS.boring : D < 0.75 ? CHAT_POOLS.normal : CHAT_POOLS.hot;
    const color = D >= 0.75 ? '#ff9966' : D < 0.2 ? '#7777aa' : '#cccccc';
    this.pushChat(`시청자${Phaser.Math.Between(1, 999)}`, Phaser.Utils.Array.GetRandom(pool), color);
  }

  endRun(died) {
    this.over = true;
    gameState().recordRun({ died, peakViewers: this.peakViewers, totalDonated: this.totalDonated, kills: this.kills });
    if (died) {
      this.pushChat('시청자', '...', '#666666');
      this.pushChat('시스템', '방송이 종료되었습니다', '#ff4444');
      this.cameras.main.shake(500, 0.01);
    }
    this.time.delayedCall(died ? 1500 : 500, () => {
      gameState().setPhase(!died && this.isFinal ? 'ending' : 'result');
    });
  }
}
