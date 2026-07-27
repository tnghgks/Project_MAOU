import Phaser from 'phaser';
import {
  clamp,
  hypeTier,
  donationInterval,
  rollDonation,
  stepCritical,
  viewerAlert,
  MIN_VIEWERS,
  CRIT_TIME,
  type HypeTier,
  type SkillOutcome,
  type ViewerAlert,
} from '../formulas.ts';
import { gameState } from '../game/store.ts';
import { bus, busBind } from '../game/events.ts';
import { ARENA, SUMMON_Y, CX, arenaBounds } from '../game/layout.ts';
import { spawnHero, type HeroEntity, type MonsterEntity, type Arrow, type SkillContext } from '../game/entities.ts';
import { stepHero, stepMonster, stepArrow, stepViewers, countNear, SUMMON_MIN_RADIUS } from '../game/battleSim.ts';
import { MONSTERS, type MonsterId, type MonsterDef } from '../data/monsters.ts';
import { syncRoster } from '../data/nicknames.ts';
import { UPGRADES, type UpgradeKey } from '../data/upgrades.ts';
import { RARITY, type Card } from '../data/cards.ts';
import { SKILLS } from '../data/skills.ts';
import { CHAT_POOLS, pickChatMood } from '../data/chat.ts';
import { FINAL_EP, targetGold, bossOf } from '../data/progression.ts';
import type { RunOutcome } from '../game/store.ts';

const AUTO_INTERVAL = 3; // ponytail: 자동 소환 간격 — 체감 밀도 조절 knob
const START_VIEWERS = 12; // 첫 방송 시청자 수
const HP_BAR_W = 48; // ponytail: 체력바 크기 knob
const HP_BAR_H = 8;
const SHAKE_HOLD = 999_999; // 경보 흔들림은 단계가 바뀔 때까지 유지 (reset으로 끈다)

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
  killGold!: number; // 몬스터 처치로 번 골드 — 보스 등장 게이지 (후원은 안 들어간다)
  target!: number; // 보스 등장 조건: killGold 목표
  boss!: MonsterEntity | null; // 등장 후 유지 — 죽으면 스테이지 클리어
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
  pendingSkill: SkillOutcome | null = null; // 리액션 리듬 결과 — 전투 재개 시점에 발동
  chatT = 0;

  constructor() {
    super('Battle');
  }

  create() {
    const S = gameState();
    this.isFinal = S.episode >= FINAL_EP;

    this.hero = spawnHero(S.hero, { x: CX, y: 300 });
    this.monsters = [];
    this.arrows = [];
    this.viewers = S.viewers || START_VIEWERS; // 다음 화는 지난 화 시청자 수를 이어받는다 (resetRun이 0으로 비운다)
    this.peakViewers = this.viewers;
    this.viewerSyncT = 0;
    this.totalDonated = 0;
    this.kills = 0;
    this.killGold = 0;
    this.target = targetGold(S.episode);
    this.boss = null;
    this.critical = false;
    this.critT = 0;
    this.alert = 'normal';
    this.audience = syncRoster([], this.viewers);
    this.drift = 0;
    this.donateT = donationInterval(this.viewers);
    this.freezeUntil = 0;
    this.D = 0;
    this.tier = hypeTier(0);
    this.over = false;

    this.available = (Object.keys(MONSTERS) as MonsterId[]).filter((k) => MONSTERS[k].unlock <= S.episode);
    this.selectedType = this.available[0];
    this.autoOn = false;
    this.autoT = 0;

    this.buildUI();
    this.heroSpr = this.add.image(this.hero.x, this.hero.y, 'hero').setScale(1.3);
    this.heroHpBar = this.add.graphics().setDepth(3); // 몬스터·화살 위로

    // 병렬 씬: HUD(캔버스 수치) + Rhythm(리듬 판정)
    this.scene.launch('Hud');
    this.scene.launch('Rhythm');

    // 리듬 결과는 씬이 멈춰 있는 동안 도착한다 — 스킬 발동은 재개 시점(endDonation)까지 미룬다
    busBind(this, 'rhythm:result', (res) => {
      this.pendingSkill = res;
    });
    busBind(this, 'donation:end', ({ card }) => this.endDonation(card));
    // Hud/Rhythm 중지는 App 디렉터가 담당 (shutdown 중 형제 씬 stop은 신뢰 불가)

    // 입력: 마우스 소환 + 숫자키 = 해당 종류를 랜덤 위치에 즉시 소환 (버튼 선택은 그대로 유지)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.trySummon(p));
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= this.available.length) this.summonRandom(this.available[digit - 1]);
    });

    this.pushChat(
      '시스템',
      this.isFinal ? '최종화 — 마왕이 직접 나선다!' : `${S.episode}화 방송이 시작되었습니다.`,
      '#888888',
    );
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
      const btn = add
        .rectangle(bx, SUMMON_Y + 14, 150, 30, 0x2a2a3a)
        .setOrigin(0)
        .setDepth(6)
        .setInteractive();
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
    this.autoBtn = add
      .rectangle(bx, SUMMON_Y + 14, 110, 30, 0x2a2a3a)
      .setOrigin(0)
      .setDepth(6)
      .setInteractive();
    this.autoLabel = add.text(bx + 8, SUMMON_Y + 20, '', { fontSize: '12px', color: '#ffffff' }).setDepth(7);
    this.autoBtn.on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        this.toggleAuto();
      },
    );
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
    if (Phaser.Math.Distance.Between(p.x, p.y, this.hero.x, this.hero.y) < SUMMON_MIN_RADIUS) {
      this.floatText(p.x, p.y, '용사와 너무 가까움!', '#ff6666');
      return;
    }
    this.doSummon(this.selectedType, p.x, p.y);
  }

  // 숫자키/자동: 용사 반경(SUMMON_MIN_RADIUS) 밖 랜덤 지점에 즉시 소환
  summonRandom(t: MonsterId) {
    if (this.over) return;
    for (let i = 0; i < 10; i++) {
      // ponytail: 아레나가 넓어 몇 번 안에 성공, 실패 시 이번 입력 무시
      const x = Phaser.Math.Between(ARENA.x + 20, ARENA.x + ARENA.w - 20);
      const y = Phaser.Math.Between(ARENA.y + 20, SUMMON_Y - 20);
      if (Phaser.Math.Distance.Between(x, y, this.hero.x, this.hero.y) >= SUMMON_MIN_RADIUS) {
        return this.doSummon(t, x, y);
      }
    }
  }

  doSummon(t: MonsterId, x: number, y: number): MonsterEntity {
    const def: MonsterDef = MONSTERS[t];
    const spr = this.add.image(x, y, `m_${t}`).setScale(def.size / 16);
    if (def.tint) spr.setTint(def.tint);
    const m: MonsterEntity = { type: t, def, hp: def.hp, x, y, atkCd: 0, spr };
    this.monsters.push(m);
    return m;
  }

  // ── 보스: 목표 골드 도달 시 용사 반대편에 등장. 격파 = 스테이지 클리어 ──
  spawnBoss() {
    const t = bossOf(gameState().episode);
    const x = this.hero.x < CX ? arenaBounds.maxX - 40 : arenaBounds.minX + 40;
    this.boss = this.doSummon(t, x, (ARENA.y + SUMMON_Y) / 2);
    this.cameras.main.flash(600, 255, 80, 80);
    this.floatText(this.boss.x, this.boss.y - 60, `☠ ${MONSTERS[t].name} 등장!`, '#ff4444');
    this.pushChat('시스템', `☠ ${MONSTERS[t].name} 등장! 용사가 쓰러뜨리면 방송 성공`, '#ff4444');
  }

  // ── 도네이션: 전투를 멈추고 React(DonationEvent)에 넘긴다. 재개는 endDonation. ──
  fireDonation() {
    const { amount, jackpot } = rollDonation(this.viewers);
    gameState().addGold(amount);
    this.totalDonated += amount;
    const name = this.randomViewer() ?? '익명';
    const msg = `${name}님 ${amount.toLocaleString()}G${jackpot ? ' 대박 후원!!' : '!'}`;
    this.pushChat('🎁 후원', msg, jackpot ? '#ff66cc' : '#ffdd44');
    this.pendingSkill = null;
    bus.emit('donation:arrive', { amount, donor: name, jackpot });
    // Rhythm은 계속 돌려야 한다 (리액션 이벤트의 QWER 판정 담당)
    this.scene.pause('Hud');
    this.scene.pause();
  }

  // 카드 확정 → 강화 적용 후 재개. 리액션이었다면 예약된 스킬도 여기서 터진다.
  endDonation(card: Card) {
    this.scene.resume();
    this.scene.resume('Hud');
    gameState().grantCard(card);
    this.applyLiveUpgrade(card.key, card.delta, `🎁 ${RARITY[card.rarity].label} 카드!`);
    if (this.pendingSkill) {
      this.fireSkill(this.pendingSkill);
      this.pendingSkill = null;
    }
  }

  // ── 스킬: 보유 스킬 중 랜덤 1개가 리듬 배율로 발동 (GDD 4장) ──
  fireSkill(res: SkillOutcome) {
    if (res.penalty) {
      this.viewers = Math.max(MIN_VIEWERS, this.viewers * 0.95);
      this.pushChat('시스템', '스킬 불발... 시청자가 실망했다', '#ff6666');
      return;
    }
    const skill = SKILLS[Phaser.Utils.Array.GetRandom(gameState().skills)];
    skill.effect(this.skillContext(), res.mult);
    this.cameras.main.flash(res.clear ? 400 : 150, 255, 255, 200);
    this.floatText(this.hero.x, this.hero.y - 40, `⚡ ${skill.name} ${res.grade} ×${res.mult}`, '#ffee44');
    if (res.clear) {
      for (const m of this.monsters) if (m !== this.boss) this.hitFx(m, 9999); // 보스는 전멸기 면역 — 클리어는 정공법으로
      for (const line of CHAT_POOLS.allperfect) {
        const who = this.randomViewer();
        if (who) this.pushChat(who, line, '#ffee44');
      }
    }
    this.time.delayedCall(300, () => {
      this.children.list
        .filter((c) => (c as Phaser.GameObjects.Arc).fillColor === 0xffffaa)
        .forEach((c) => c.destroy());
    });
  }

  // ── 실시간 강화: store는 이미 갱신됨(applyUpgrade/grantCard) — 씬 로컬 hero에 반영 + 연출 ──
  // delta는 호출부가 준다 (상점=1배, 카드=등급 배율).
  applyLiveUpgrade(key: UpgradeKey, delta: number, via: string) {
    const u = UPGRADES[key];
    const H = this.hero;
    const stats = gameState().hero;
    if (u.stat === 'maxHp') {
      H.maxHp = stats.maxHp;
      H.hp = Math.min(H.maxHp, H.hp + delta); // 최대치 증가분만큼 즉시 회복
    } else {
      H[u.stat] = stats[u.stat];
    }
    // 임팩트: 확산 링 + 상승 숫자
    const ring = this.add.circle(H.x, H.y, 20, 0x44ddff, 0).setStrokeStyle(3, 0x44ddff, 1).setDepth(9);
    this.tweens.add({ targets: ring, radius: 60, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
    this.heroSpr.setTint(0x88ffff);
    this.time.delayedCall(200, () => this.heroSpr.clearTint());
    this.floatText(H.x, H.y - 40, `▲ ${u.name} +${delta}`, '#44ddff');
    this.pushChat('시스템', `${via} ${u.name} 강화`, '#44ddff');
  }

  // 스킬이 쓰는 좁은 표면. 씬 헬퍼를 SkillContext로 감싸 skills.ts가 BattleScene에 의존하지 않게 한다.
  skillContext(): SkillContext {
    return {
      hero: this.hero,
      monsters: this.monsters,
      hit: (m, dmg) => this.hitFx(m, dmg),
      fxCircle: (x, y, r) => {
        this.add.circle(x, y, r, 0xffffaa, 0.8).setDepth(3);
      },
      heal: (ratio) => {
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.hero.maxHp * ratio);
      },
      freeze: (ms) => {
        this.freezeUntil = this.time.now + ms;
      },
      now: () => this.time.now,
      randBetween: (a, b) => Phaser.Math.Between(a, b),
    };
  }

  hitFx(m: MonsterEntity, dmg: number) {
    this.damageMonster(m, dmg);
    this.add.circle(m.x, m.y, 14, 0xffffaa, 0.8).setDepth(3);
  }

  damageMonster(m: MonsterEntity, dmg: number) {
    m.hp -= dmg;
    m.spr.setAlpha(0.5);
    this.time.delayedCall(80, () => {
      if (m.spr.active) m.spr.setAlpha(1);
    });
    if (m.hp <= 0 && !m.dead) {
      m.dead = true;
      gameState().addGold(m.def.gold);
      this.killGold += m.def.gold;
      this.kills++;
      m.spr.destroy();
    }
  }

  pushChat(who: string, msg: string, color = '#cccccc') {
    bus.emit('chat:line', { who, msg, color });
  }

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

    if (this.boss) {
      if (this.boss.dead) return this.endRun('clear');
    } else if (this.killGold >= this.target) {
      this.spawnBoss();
    }

    if (this.autoOn) {
      this.autoT -= dt;
      if (this.autoT <= 0) {
        this.summonRandom(this.selectedType);
        this.autoT = AUTO_INTERVAL;
      }
    }

    const near = countNear(this.monsters, H);
    // this는 { viewers, peakViewers, drift } 필드를 가져 ViewerState로 그대로 넘긴다.
    const step = stepViewers(this, H.hp / H.maxHp, near, dt);
    this.D = step.D;
    this.tier = step.tier;
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
    // 전이 적용(감소→분류→상태 반영)은 formulas.stepCritical이 담당. 여기선 연출만 반응.
    // this는 { critical, critT } 필드를 가져 CritState로 그대로 넘긴다.
    switch (stepCritical(this, this.viewers, dt)) {
      case 'enter':
        this.pushChat('시스템', `⚠ 시청자가 다 나갔다! ${CRIT_TIME}초 안에 판을 키워라`, '#ff4444');
        break;
      case 'exit':
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
    // 결정 로직은 battleSim.stepHero(순수). 씬은 결과를 스프라이트에 반영 + 공격만 처리.
    const intent = stepHero(H, this.monsters, nearCount, dt, { x: CX, y: 300 }, arenaBounds);
    if (intent.attack) this.damageMonster(intent.attack, H.atk);
    this.heroSpr.setPosition(H.x, H.y);
    if (intent.moved) this.heroSpr.setFlipX(intent.movingLeft);

    const ratio = clamp(H.hp / H.maxHp, 0, 1);
    this.heroHpBar
      .clear()
      .fillStyle(0x000000, 0.85)
      .fillRect(H.x - HP_BAR_W / 2 - 2, H.y - 34, HP_BAR_W + 4, HP_BAR_H + 4) // 어두운 테두리 — 배경과 안 섞이게
      .fillStyle(0x33383f)
      .fillRect(H.x - HP_BAR_W / 2, H.y - 32, HP_BAR_W, HP_BAR_H) // 빈 구간도 보이게 (잃은 체력 = 회색)
      .fillStyle(ratio > 0.25 ? 0x44ff66 : 0xff4444)
      .fillRect(H.x - HP_BAR_W / 2, H.y - 32, HP_BAR_W * ratio, HP_BAR_H);
  }

  updateMonsters(dt: number) {
    const H = this.hero;
    this.monsters = this.monsters.filter((m) => !m.dead);
    if (this.time.now < this.freezeUntil) return; // 시간 정지
    for (const m of this.monsters) {
      const intent = stepMonster(m, H, dt); // 결정은 순수, 씬은 스프라이트/피격만 적용
      switch (intent.kind) {
        case 'move':
          m.spr.setPosition(m.x, m.y);
          m.spr.setFlipX(intent.flipLeft);
          break;
        case 'arrow': {
          const spr = this.add.image(intent.x, intent.y, 'arrow').setDepth(2).setScale(0.7);
          spr.setRotation(Math.atan2(intent.ty - intent.y, intent.tx - intent.x) + Math.PI / 2);
          this.arrows.push({ x: intent.x, y: intent.y, tx: intent.tx, ty: intent.ty, spr, dmg: intent.dmg });
          break;
        }
        case 'melee':
          H.hp -= intent.dmg;
          if (intent.suicide) {
            m.dead = true;
            m.spr.destroy();
          }
          break;
      }
    }
  }

  updateArrows(dt: number) {
    const H = this.hero;
    this.arrows = this.arrows.filter((a) => {
      const res = stepArrow(a, H, dt);
      if (res === 'travel') {
        a.spr.setPosition(a.x, a.y);
        return true;
      }
      if (res !== 'expire') H.hp -= res.hit; // 명중이면 용사 피격
      a.spr.destroy();
      return false;
    });
  }

  updateChat(dt: number, D: number) {
    this.chatT -= dt;
    if (this.chatT > 0) return;
    const lps = clamp(1 + (this.viewers / 5000) * 7, 1, 8);
    this.chatT = 1 / lps;
    const who = this.randomViewer();
    if (!who) return; // 아무도 없으면 채팅도 없다
    const { pool, color } = pickChatMood(D);
    this.pushChat(who, Phaser.Utils.Array.GetRandom(pool as string[]), color);
  }

  endRun(outcome: RunOutcome) {
    this.over = true;
    this.cameras.main.shakeEffect.reset();
    gameState().recordRun({
      outcome,
      peakViewers: this.peakViewers,
      totalDonated: this.totalDonated,
      kills: this.kills,
    });
    const cleared = outcome === 'clear';
    if (outcome === 'death') {
      const who = this.randomViewer();
      if (who) this.pushChat(who, '...', '#666666');
      this.pushChat('시스템', '용사가 죽었다. 방송 종료', '#ff4444');
      this.cameras.main.shake(500, 0.01);
    } else if (outcome === 'abandoned') {
      this.pushChat('시스템', '아무도 보지 않는다. 채널 폐지', '#ff4444');
    } else {
      this.pushChat('시스템', `🎯 ${this.boss!.def.name} 격파! 스테이지 클리어`, '#ffdd44');
    }
    this.time.delayedCall(cleared ? 800 : 1500, () => {
      gameState().setPhase(cleared && this.isFinal ? 'ending' : 'result');
    });
  }
}
