import Phaser from 'phaser';
import {
  clamp, danger, hypeTier, donationInterval, donationAmount, criticalStep, viewerAlert, viewerDrift,
  MIN_VIEWERS, CRIT_TIME, type HypeTier, type SkillOutcome, type ViewerAlert,
} from '../formulas.ts';
import { gameState } from '../game/store.ts';
import { bus } from '../game/events.ts';
import { MONSTERS, type MonsterDef, type MonsterId } from '../data/monsters.ts';
import { syncRoster } from '../data/nicknames.ts';
import { UPGRADES, type UpgradeKey } from '../data/upgrades.ts';
import { SKILLS } from '../data/skills.ts';
import { FINAL_EP, targetDonation } from '../data/progression.ts';
import type { RunOutcome } from '../game/store.ts';
import type RhythmScene from './RhythmScene.ts';

// 레이아웃 (GDD 5-1)
// 채팅이 React 채팅 컬럼(캔버스 밖)으로 빠지면서 아레나가 캔버스 전폭을 쓴다
export const ARENA = { x: 0, y: 40, w: 1280, h: 520 };
export const SUMMON_Y = 560; // 소환 바
const CX = ARENA.x + ARENA.w / 2; // 용사 스폰 · 무적 시 복귀 지점
const AUTO_INTERVAL = 0.6; // ponytail: 자동 소환 간격 — 체감 밀도 조절 knob
const SHAKE_HOLD = 999_999; // 경보 흔들림은 단계가 바뀔 때까지 유지 (reset으로 끈다)

const CHAT_POOLS = {
  boring: ['노잼이네요', '다른 방 갑니다', '매니저 뭐하냐', 'ㅡㅡ', '숙제 방송인가...'],
  normal: ['ㅋㅋㅋ', '용사 화이팅', '오 슬라임 나왔다', '응원합니다', '용사 좀 치네'],
  hot: ['개꿀잼ㅋㅋㅋ', '뒤에!! 뒤에!!', '헐', '죽는다죽는다', '도네 쏜다', '!!!!!!!!'],
  allperfect: ['ㅁㅊ', '이게 사람이야?', '클립 따간다', '레전드'],
};

export interface HeroEntity {
  x: number; y: number;
  hp: number; maxHp: number;
  atk: number; atkSpd: number; speed: number; range: number;
  atkCd: number; retreatT: number; retreatCd: number;
}
export interface MonsterEntity {
  type: MonsterId;
  def: MonsterDef;
  hp: number;
  x: number; y: number;
  atkCd: number;
  spr: Phaser.GameObjects.Image;
  dead?: boolean;
}
interface Arrow {
  x: number; y: number;
  tx: number; ty: number;
  spr: Phaser.GameObjects.Image;
  dmg: number;
}

export default class BattleScene extends Phaser.Scene {
  isFinal!: boolean;
  hero!: HeroEntity;
  monsters!: MonsterEntity[];
  arrows!: Arrow[];
  viewers!: number;
  peakViewers!: number;
  viewerSyncT!: number;
  totalDonated!: number;
  kills!: number;
  target!: number; // 승리 조건: 누적 후원 목표
  critical = false; // 시청자 바닥 위기 (카운트다운 진행 중)
  critT = 0;
  alert: ViewerAlert = 'normal'; // HudScene가 읽어 시청자 수 색을 바꾼다
  audience: string[] = []; // 현재 접속 중인 시청자 닉네임 — 채팅·후원자가 여기서만 나온다
  drift = 0; // 시청자 증감률에 얹히는 흔들림 (기계적인 지수곡선 방지)
  donateT!: number;
  freezeUntil!: number; // 시간 정지 스킬
  D!: number;
  tier!: HypeTier; // HudScene가 읽음
  over!: boolean;
  available!: MonsterId[];
  selectedType!: MonsterId;
  summonBtns!: Record<string, Phaser.GameObjects.Rectangle>;
  autoOn = false;
  autoT = 0;
  autoBtn!: Phaser.GameObjects.Rectangle;
  autoLabel!: Phaser.GameObjects.Text;
  heroSpr!: Phaser.GameObjects.Image;
  heroHpBar!: Phaser.GameObjects.Graphics;
  onRhythm!: (res: SkillOutcome) => void;
  chatT = 0;

  constructor() { super('Battle'); }

  create() {
    const S = gameState();
    this.isFinal = S.episode >= FINAL_EP;

    const b = S.hero;
    this.hero = { x: CX, y: 300, hp: b.maxHp, maxHp: b.maxHp, atk: b.atk, atkSpd: b.atkSpd, speed: b.speed, range: b.range, atkCd: 0, retreatT: 0, retreatCd: 0 };
    this.monsters = [];
    this.arrows = [];
    this.viewers = 12;
    this.peakViewers = 12;
    this.viewerSyncT = 0;
    this.totalDonated = 0;
    this.kills = 0;
    this.target = targetDonation(S.episode);
    this.critical = false;
    this.critT = 0;
    this.alert = 'normal';
    this.audience = syncRoster([], this.viewers);
    this.drift = 0;
    this.donateT = donationInterval(this.viewers);
    this.freezeUntil = 0;
    this.D = 0; this.tier = hypeTier(0);
    this.over = false;

    this.available = (Object.keys(MONSTERS) as MonsterId[]).filter((k) => MONSTERS[k].unlock <= S.episode);
    this.selectedType = this.available[0];
    this.autoOn = false;
    this.autoT = 0;

    this.buildUI();
    this.heroSpr = this.add.image(this.hero.x, this.hero.y, 'hero').setScale(1.3);
    this.heroHpBar = this.add.graphics();

    // 병렬 씬: HUD(캔버스 수치) + Rhythm(리듬 판정)
    this.scene.launch('Hud');
    this.scene.launch('Rhythm');

    // 리듬 결과 → 스킬 발동 (스킬 effect는 monsters/hero에 접근하므로 여기 소유)
    this.onRhythm = (res) => this.fireSkill(res);
    bus.on('rhythm:result', this.onRhythm);
    // 상점 구매 → 씬 로컬 hero 동기화 + 임팩트
    const onUpgrade = ({ key }: { key: UpgradeKey }) => this.applyLiveUpgrade(key);
    bus.on('hero:upgraded', onUpgrade);
    // Hud/Rhythm 중지는 App 디렉터가 담당 (shutdown 중 형제 씬 stop은 신뢰 불가)
    this.events.once('shutdown', () => {
      bus.off('rhythm:result', this.onRhythm);
      bus.off('hero:upgraded', onUpgrade);
    });

    // 입력: 마우스 소환 + 숫자키 = 해당 종류를 랜덤 위치에 즉시 소환 (버튼 선택은 그대로 유지)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.trySummon(p));
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= this.available.length) this.summonRandom(this.available[digit - 1]);
    });

    this.pushChat('시스템', this.isFinal ? '최종화 — 마왕이 직접 나선다!' : `${S.episode}화 방송이 시작되었습니다.`, '#888888');
  }

  buildUI() {
    const add = this.add;
    // 전투 영역 chrome (상단바=Hud, 리듬레인=Rhythm)
    add.rectangle(CX, (SUMMON_Y + 640) / 2, ARENA.w, 640 - SUMMON_Y, 0x1a1a24).setDepth(5); // 소환 바
    add.line(0, 0, ARENA.x, SUMMON_Y, ARENA.w, SUMMON_Y, 0x333344).setOrigin(0).setDepth(5);

    // 소환 버튼 (해금된 몬스터만)
    this.summonBtns = {};
    let bx = 20;
    this.available.forEach((k, i) => {
      const m = MONSTERS[k];
      const btn = add.rectangle(bx, SUMMON_Y + 14, 150, 30, 0x2a2a3a).setOrigin(0).setDepth(6).setInteractive();
      add.text(bx + 6, SUMMON_Y + 20, `${i + 1}.${m.name}`, { fontSize: '12px', color: '#ffffff' }).setDepth(7);
      btn.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        this.selectType(k);
      });
      this.summonBtns[k] = btn;
      bx += 158;
    });
    this.selectType(this.selectedType);

    // 자동 소환 토글: 선택된 종류를 AUTO_INTERVAL 간격으로 랜덤 위치에 소환
    this.autoBtn = add.rectangle(bx, SUMMON_Y + 14, 110, 30, 0x2a2a3a).setOrigin(0).setDepth(6).setInteractive();
    this.autoLabel = add.text(bx + 8, SUMMON_Y + 20, '', { fontSize: '12px', color: '#ffffff' }).setDepth(7);
    this.autoBtn.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.toggleAuto();
    });
    this.renderAutoBtn();
  }

  toggleAuto() {
    this.autoOn = !this.autoOn;
    this.autoT = 0; // 켜자마자 1마리
    this.renderAutoBtn();
  }

  renderAutoBtn() {
    this.autoBtn.setFillStyle(this.autoOn ? 0xcc6633 : 0x2a2a3a);
    this.autoLabel.setText(this.autoOn ? '⏸ 자동 ON' : '▶ 자동소환');
  }

  selectType(k: MonsterId) {
    this.selectedType = k;
    for (const [t, btn] of Object.entries(this.summonBtns)) btn.setFillStyle(t === k ? 0x555577 : 0x2a2a3a);
  }

  // ── 소환 ──
  trySummon(p: Phaser.Input.Pointer) {
    if (this.over) return;
    if (p.x < ARENA.x || p.x > ARENA.x + ARENA.w || p.y < ARENA.y || p.y > SUMMON_Y) return;
    if (Phaser.Math.Distance.Between(p.x, p.y, this.hero.x, this.hero.y) < 150) {
      this.floatText(p.x, p.y, '용사와 너무 가까움!', '#ff6666');
      return;
    }
    this.doSummon(this.selectedType, p.x, p.y);
  }

  // 숫자키/자동: 용사 반경 150px 밖 랜덤 지점에 즉시 소환
  summonRandom(t: MonsterId) {
    if (this.over) return;
    for (let i = 0; i < 10; i++) { // ponytail: 아레나가 넓어 몇 번 안에 성공, 실패 시 이번 입력 무시
      const x = Phaser.Math.Between(ARENA.x + 20, ARENA.x + ARENA.w - 20);
      const y = Phaser.Math.Between(ARENA.y + 20, SUMMON_Y - 20);
      if (Phaser.Math.Distance.Between(x, y, this.hero.x, this.hero.y) >= 150) return this.doSummon(t, x, y);
    }
  }

  doSummon(t: MonsterId, x: number, y: number) {
    const def = MONSTERS[t];
    const spr = this.add.image(x, y, `m_${t}`).setScale(def.size / 16);
    this.monsters.push({ type: t, def, hp: def.hp, x, y, atkCd: 0, spr });
  }

  // ── 도네이션 → 리듬 (RhythmScene에 시퀀스 요청) ──
  fireDonation() {
    const amt = donationAmount(this.viewers);
    gameState().addGold(amt);
    this.totalDonated += amt;
    const name = this.randomViewer() ?? '익명';
    this.pushChat('🎁 후원', `${name}님 ${amt.toLocaleString()}G!`, '#ffdd44');
    bus.emit('donation:arrive', { amount: amt, donor: name });
    (this.scene.get('Rhythm') as RhythmScene).spawnSeq(); // 진행 중이면 Rhythm이 무시
  }

  // ── 스킬: 보유 스킬 중 랜덤 1개가 리듬 배율로 발동 (GDD 4장) ──
  fireSkill(res: SkillOutcome) {
    if (res.penalty) {
      this.viewers = Math.max(MIN_VIEWERS, this.viewers * 0.95);
      this.pushChat('시스템', '스킬 불발... 시청자가 실망했다', '#ff6666');
      return;
    }
    const skill = SKILLS[Phaser.Utils.Array.GetRandom(gameState().skills)];
    skill.effect(this, res.mult);
    this.cameras.main.flash(res.clear ? 400 : 150, 255, 255, 200);
    this.floatText(this.hero.x, this.hero.y - 40, `⚡ ${skill.name} ${res.grade} ×${res.mult}`, '#ffee44');
    if (res.clear) {
      for (const m of this.monsters) this.hitFx(m, 9999);
      for (const line of CHAT_POOLS.allperfect) {
        const who = this.randomViewer();
        if (who) this.pushChat(who, line, '#ffee44');
      }
    }
    this.time.delayedCall(300, () => {
      this.children.list.filter((c) => (c as Phaser.GameObjects.Arc).fillColor === 0xffffaa).forEach((c) => c.destroy());
    });
  }

  // ── 실시간 강화: store는 이미 갱신됨(applyUpgrade) — 씬 로컬 hero에 반영 + 연출 ──
  applyLiveUpgrade(key: UpgradeKey) {
    const u = UPGRADES[key];
    const H = this.hero;
    const stats = gameState().hero;
    if (u.stat === 'maxHp') {
      H.maxHp = stats.maxHp;
      H.hp = Math.min(H.maxHp, H.hp + u.delta); // 최대치 증가분만큼 즉시 회복
    } else {
      H[u.stat] = stats[u.stat];
    }
    // 임팩트: 확산 링 + 상승 숫자
    const ring = this.add.circle(H.x, H.y, 20, 0x44ddff, 0).setStrokeStyle(3, 0x44ddff, 1).setDepth(9);
    this.tweens.add({ targets: ring, radius: 60, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
    this.heroSpr.setTint(0x88ffff);
    this.time.delayedCall(200, () => this.heroSpr.clearTint());
    this.floatText(H.x, H.y - 40, `▲ ${u.name} +${u.delta}`, '#44ddff');
    this.pushChat('시스템', `마왕의 투자! ${u.name} 강화`, '#44ddff');
  }

  hitFx(m: MonsterEntity, dmg: number) {
    this.damageMonster(m, dmg);
    this.add.circle(m.x, m.y, 14, 0xffffaa, 0.8).setDepth(3);
  }

  damageMonster(m: MonsterEntity, dmg: number) {
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

  pushChat(who: string, msg: string, color = '#cccccc') { bus.emit('chat:line', { who, msg, color }); }

  randomViewer(): string | null {
    return this.audience.length ? Phaser.Utils.Array.GetRandom(this.audience) : null;
  }

  floatText(x: number, y: number, msg: string, color: string) {
    const t = this.add.text(x, y, msg, { fontSize: '16px', fontStyle: 'bold', color }).setOrigin(0.5).setDepth(9);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  // ── 메인 루프 ──
  update(_: number, deltaMs: number) {
    if (this.over) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    const H = this.hero;

    if (this.totalDonated >= this.target) return this.endRun('clear');

    if (this.autoOn) {
      this.autoT -= dt;
      if (this.autoT <= 0) { this.summonRandom(this.selectedType); this.autoT = AUTO_INTERVAL; }
    }

    const near = this.monsters.filter((m) => !m.dead && Phaser.Math.Distance.Between(m.x, m.y, H.x, H.y) < 200).length;
    this.D = danger(H.hp / H.maxHp, near);
    this.tier = hypeTier(this.D);
    this.drift = viewerDrift(this.drift, dt);
    this.viewers = Math.max(MIN_VIEWERS, this.viewers * (1 + (this.tier.rate + this.drift) * dt));
    this.peakViewers = Math.max(this.peakViewers, this.viewers);
    this.updateCritical(dt);
    if (this.over) return;

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
    if (this.viewerSyncT <= 0) {
      gameState().setViewers(Math.floor(this.viewers));
      this.audience = syncRoster(this.audience, this.viewers);
      this.viewerSyncT = 0.25;
    }

    if (H.hp <= 0) return this.endRun('death');
  }

  // ── 시청자 바닥 위기: 화면 흔들림 + 카운트다운, 회복 못 하면 방송 종료 (판정은 formulas.criticalStep) ──
  updateCritical(dt: number) {
    if (this.critical) this.critT -= dt;
    switch (criticalStep(this.viewers, this.critical, this.critT)) {
      case 'enter':
        this.critical = true;
        this.critT = CRIT_TIME;
        this.pushChat('시스템', `⚠ 시청자가 다 나갔다! ${CRIT_TIME}초 안에 판을 키워라`, '#ff4444');
        break;
      case 'exit':
        this.critical = false;
        this.critT = 0;
        this.pushChat('시스템', '시청자가 돌아오기 시작했다', '#44ddff');
        break;
      case 'fail':
        return this.endRun('abandoned');
    }
    this.syncAlert();
  }

  // 경보 단계가 바뀔 때만 흔들림을 갈아끼운다 (매 프레임 shake 재호출은 진동이 튄다)
  syncAlert() {
    const next = viewerAlert(this.viewers, this.critical);
    if (next === this.alert) return;
    this.alert = next;
    this.cameras.main.shakeEffect.reset();
    if (next === 'warn') {
      this.cameras.main.shake(SHAKE_HOLD, 0.002);
      this.pushChat('시스템', '시청자가 빠지고 있다...', '#ff9933');
    } else if (next === 'critical') {
      this.cameras.main.shake(SHAKE_HOLD, 0.006);
    }
  }

  updateHero(dt: number, nearCount: number) {
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
      let target: MonsterEntity | null = null, best = 300;
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
      } else if (Phaser.Math.Distance.Between(H.x, H.y, CX, 300) > 20) {
        const d = Phaser.Math.Distance.Between(H.x, H.y, CX, 300);
        vx = ((CX - H.x) / d) * H.speed * 0.5;
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

  updateMonsters(dt: number) {
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

  updateArrows(dt: number) {
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

  updateChat(dt: number, D: number) {
    this.chatT -= dt;
    if (this.chatT > 0) return;
    const lps = clamp(1 + (this.viewers / 5000) * 7, 1, 8);
    this.chatT = 1 / lps;
    const who = this.randomViewer();
    if (!who) return; // 아무도 없으면 채팅도 없다
    const pool = D < 0.2 ? CHAT_POOLS.boring : D < 0.75 ? CHAT_POOLS.normal : CHAT_POOLS.hot;
    const color = D >= 0.75 ? '#ff9966' : D < 0.2 ? '#7777aa' : '#cccccc';
    this.pushChat(who, Phaser.Utils.Array.GetRandom(pool), color);
  }

  endRun(outcome: RunOutcome) {
    this.over = true;
    this.cameras.main.shakeEffect.reset();
    gameState().recordRun({ outcome, peakViewers: this.peakViewers, totalDonated: this.totalDonated, kills: this.kills });
    const cleared = outcome === 'clear';
    if (outcome === 'death') {
      const who = this.randomViewer();
      if (who) this.pushChat(who, '...', '#666666');
      this.pushChat('시스템', '용사가 죽었다. 방송 종료', '#ff4444');
      this.cameras.main.shake(500, 0.01);
    } else if (outcome === 'abandoned') {
      this.pushChat('시스템', '아무도 보지 않는다. 채널 폐지', '#ff4444');
    } else {
      this.pushChat('시스템', `🎯 목표 후원 ${this.target.toLocaleString()}G 달성!`, '#ffdd44');
    }
    this.time.delayedCall(cleared ? 800 : 1500, () => {
      gameState().setPhase(cleared && this.isFinal ? 'ending' : 'result');
    });
  }
}
