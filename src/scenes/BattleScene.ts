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
  type SkillRarity,
  type ViewerAlert,
} from '../formulas.ts';
import { gameState, heroPower } from '../game/store.ts';
import { bus, busBind } from '../game/events.ts';
import { ARENA, CANVAS, SUMMON_Y, CX, arenaBounds } from '../game/layout.ts';
import { buildArenaMap } from '../game/arenaMap.ts';
import { spawnHero, type HeroEntity, type MonsterEntity, type Arrow, type SkillContext } from '../game/entities.ts';
import {
  stepHero,
  stepMonster,
  stepArrow,
  stepViewers,
  bumpCombo,
  countNear,
  SUMMON_MIN_RADIUS,
  type HeroInput,
} from '../game/battleSim.ts';
import { heroAtkMult, vampHeal, thornsDmg, TRAITS } from '../data/traits.ts';
import { MONSTERS, type MonsterId, type MonsterDef } from '../data/monsters.ts';
import { syncRoster } from '../data/nicknames.ts';
import { UPGRADES, type UpgradeKey } from '../data/upgrades.ts';
import { RARITY, type Card } from '../data/cards.ts';
import { SKILLS, pickSkillReward, type SkillId } from '../data/skills.ts';
import { CHAT_POOLS, pickChatMood } from '../data/chat.ts';
import {
  pickRequest,
  startRequest,
  stepRequest,
  reqProgress,
  REQ_FIRST,
  REQ_GAP,
  REQ_WIN,
  REQ_LOSE,
  type ActiveRequest,
  type ReqCtx,
  type RequestDef,
} from '../data/requests.ts';
import { FINAL_EP, targetGold, bossOf } from '../data/progression.ts';
import { bossCut } from '../data/cutscenes.ts';
import type { RunOutcome } from '../game/store.ts';

const START_VIEWERS = 12; // 첫 방송 시청자 수
// 소환 카드 바 (자동 소환 전용). ponytail: 밸런스 knob은 전부 여기
const CARD = { w: 240, h: 108, gap: 12, x: 20, y: SUMMON_Y + (CANVAS.H - SUMMON_Y - 108) / 2 }; // 소환 바 세로 중앙
const SLIDER = { x: 96, w: 136, h: 12 }; // 카드 좌상단 기준 오프셋
const INTERVAL_MIN = 0.5;
const INTERVAL_MAX = 6;
const COUNT_MIN = 1;
const COUNT_MAX = 5;
const MAX_ALIVE = 60; // 동시 생존 상한 — 넘으면 소환 스킵 (프레임 보호)
// 시점 전환 쿨타임. 무한 토글이면 최적해가 "위험할 때만 용사 모드"로 수렴한다 — 언제 넘어갈지가 판단이어야 한다.
const MODE_CD = 4; // ponytail: 전환 리스크 knob
const RARITY_LABEL: Record<SkillRarity, string> = { common: 'Common', uncommon: 'Uncommon', epic: '에픽' }; // GDD 3-4 표기 그대로

// 몬스터 종류 1개 = 카드 1장. 활성화된 카드는 서로 독립적으로 자기 주기마다 count마리씩 소환한다.
interface SummonSlot {
  type: MonsterId;
  on: boolean;
  interval: number;
  count: number;
  t: number; // 다음 소환까지 남은 시간
  bg: Phaser.GameObjects.Rectangle;
  chip: Phaser.GameObjects.Text;
  cd: Phaser.GameObjects.Rectangle; // 하단 주기 게이지
  iv: SliderView;
  ct: SliderView;
}
interface SliderView {
  label: Phaser.GameObjects.Text;
  fill: Phaser.GameObjects.Rectangle;
}
const HP_BAR_W = 48; // ponytail: 체력바 크기 knob
const HP_BAR_H = 8;
const SHAKE_HOLD = 999_999; // critical 흔들림은 단계가 바뀔 때까지 유지 (reset으로 끈다). warn은 흔들지 않는다

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
  killGold!: number; // 몬스터 처치로 번 골드
  target!: number; // 보스 등장 조건: stageGold 목표
  boss!: MonsterEntity | null; // 등장 후 유지 — 죽으면 스테이지 클리어
  critical = false; // 시청자 바닥 위기 (카운트다운 진행 중)
  critT = 0;
  alert: ViewerAlert = 'normal'; // HudScene가 읽어 시청자 수 색을 바꾼다
  audience: string[] = []; // 현재 접속 중인 시청자 닉네임 — 채팅·후원자가 여기서만 나온다
  drift = 0; // 시청자 증감률에 얹히는 흔들림 (기계적인 지수곡선 방지)
  combo = 0; // 처치 콤보 — stepViewers가 danger()에 얹는다 (용사 모드에서만 쌓인다)
  comboT = 0;
  modeCd!: number; // 시점 전환 쿨타임 잔여
  noHitT!: number; // 마지막 피격 이후 경과(초) — "노 데미지" 요청이 읽는다
  donateT!: number;
  freezeUntil!: number; // 시간 정지 스킬
  D!: number;
  tier!: HypeTier; // HudScene가 읽음
  over!: boolean;
  available!: MonsterId[];
  slots!: SummonSlot[];
  dragging: { slot: SummonSlot; kind: 'interval' | 'count'; x: number } | null = null; // 드래그 중인 슬라이더
  summonObjs: Phaser.GameObjects.GameObject[] = []; // 소환 바 오브젝트 전부 — 용사 모드에선 통째로 숨긴다
  keys!: Record<string, Phaser.Input.Keyboard.Key>; // 용사 이동/대시 (폴링)
  skillCd: Partial<Record<SkillId, number>> = {}; // 용사 모드 직접 시전 쿨타임 (HeroPanelScene이 읽는다)
  heroSpr!: Phaser.GameObjects.Image;
  heroHpBar!: Phaser.GameObjects.Graphics;
  pendingSkill: SkillOutcome | null = null; // 리액션 리듬 결과 — 전투 재개 시점에 발동
  chatT = 0;
  req: ActiveRequest | null = null; // 진행 중인 시청자 요청 (HudScene가 읽어 배너 렌더)
  reqPct = 0; // 요청 진행률 0~1 — HUD용 캐시
  reqT!: number; // 다음 요청까지
  lastReq: RequestDef | null = null; // 직전 요청 (연속 출제 방지)

  // 보스 등장 게이지 = 처치 골드 + 후원 골드. 누적기를 따로 두면 어긋나므로 파생값으로만 읽는다.
  get stageGold(): number {
    return this.killGold + this.totalDonated;
  }

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
    this.combo = 0;
    this.comboT = 0;
    this.modeCd = 0;
    this.noHitT = 0;
    this.donateT = donationInterval(this.viewers);
    this.freezeUntil = 0;
    this.D = 0;
    this.tier = hypeTier(0);
    this.over = false;
    this.req = null;
    this.reqPct = 0;
    this.reqT = REQ_FIRST;
    this.lastReq = null;

    this.available = (Object.keys(MONSTERS) as MonsterId[]).filter((k) => MONSTERS[k].unlock <= S.episode);
    this.dragging = null;
    this.summonObjs = [];
    this.skillCd = {};

    this.buildUI();
    this.setSummonVisible(S.mode === 'maou'); // 시점은 화가 바뀌어도 유지 (resetRun만 마왕으로 되돌린다)
    // 최종화: 용사만 플레이 가능, 도네이션 금지 (GDD 7장, 2026-07-28 정정) — 시점 강제 전환 + 소환 바 숨김.
    // 도네이션 차단은 update()의 donateT 블록에서 isFinal로 건너뛴다.
    if (this.isFinal) {
      if (gameState().mode !== 'hero') gameState().toggleMode();
      this.setSummonVisible(false);
    }
    this.heroSpr = this.add.image(this.hero.x, this.hero.y, 'hero').setScale(1.3);
    this.heroHpBar = this.add.graphics().setDepth(3); // 몬스터·화살 위로

    // 병렬 씬: HUD(캔버스 수치) + HeroPanel(용사 스탯) + Rhythm(리듬 판정).
    // 순서 = 렌더 순서. Rhythm이 마지막이어야 리듬 레인이 하단 패널을 덮는다.
    this.scene.launch('Hud');
    this.scene.launch('HeroPanel');
    this.scene.launch('Rhythm');

    // 리듬 결과는 씬이 멈춰 있는 동안 도착한다 — 스킬 발동은 재개 시점(endDonation)까지 미룬다
    busBind(this, 'rhythm:result', (res) => {
      this.pendingSkill = res;
    });
    busBind(this, 'donation:end', ({ card }) => this.endDonation(card));
    // Hud/Rhythm 중지는 App 디렉터가 담당 (shutdown 중 형제 씬 stop은 신뢰 불가)

    // 입력: 슬라이더 드래그(카드 밖으로 나가도 추적) + 숫자키 = 해당 카드 ON/OFF
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragging && p.isDown) this.dragTo(p.x);
    });
    this.input.on('pointerup', () => {
      this.dragging = null;
    });
    // 용사 이동/대시는 폴링 (매 프레임 눌림 상태를 읽어야 한다)
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    // 숫자키는 모드에 따라 두 역할: 마왕=소환 카드 토글 / 용사=스킬 시전.
    // 도네이션 중엔 이 씬이 pause라 QWER(RhythmScene)와 동시 발화하지 않는다.
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') return this.switchMode();
      const digit = parseInt(e.key, 10);
      if (!(digit >= 1)) return;
      if (gameState().mode === 'hero') this.castSkill(digit - 1);
      else if (digit <= this.slots.length) this.toggleSlot(this.slots[digit - 1]);
    });

    this.pushChat(
      '시스템',
      this.isFinal ? '최종화 — 마왕이 직접 나선다!' : `${S.episode}화 방송이 시작되었습니다.`,
      '#888888',
    );
    this.pushChat('시스템', '카드를 눌러 자동 소환 ON/OFF · 바를 드래그해 주기·수량 조절', '#888888');
    this.pushChat('시스템', '[C] 용사 시점으로 전환 — 직접 조작할 수 있다', '#ffcc55');
  }

  // ── 시점 전환 (C키) ── 소환은 계속 돌아간다. 바뀌는 건 조작 표면과 하단 패널뿐.
  // 쿨타임 중엔 거절 — 되돌아올 수 없는 몇 초가 있어야 "지금 넘어갈까"가 선택이 된다.
  switchMode() {
    if (this.isFinal) {
      this.floatText(this.hero.x, this.hero.y - 60, '최종화 — 용사 시점 고정', '#ff9933');
      return;
    }
    if (this.modeCd > 0) {
      this.floatText(this.hero.x, this.hero.y - 60, `전환 대기 ${this.modeCd.toFixed(1)}s`, '#ff9933');
      return;
    }
    this.modeCd = MODE_CD;
    const mode = gameState().toggleMode();
    this.setSummonVisible(mode === 'maou');
    this.cameras.main.flash(200, 200, 160, 80);
    this.pushChat(
      '시스템',
      mode === 'hero' ? '⚔ 용사 시점 — WASD 이동 · Shift 대시 · 1~4 스킬' : '👑 마왕 시점 — 소환 카드 조작',
      '#ffcc55',
    );
  }

  // 소환 바 표시 토글. Phaser는 invisible 오브젝트에 입력을 안 보내므로 슬라이더 히트박스도 같이 죽는다.
  setSummonVisible(v: boolean) {
    for (const o of this.summonObjs) (o as Phaser.GameObjects.Image).setVisible(v);
    if (!v) this.dragging = null; // 숨기는 순간 잡고 있던 슬라이더를 놓는다
  }

  // 용사 모드 스킬 시전 (1~4키). 도네 리듬 경로(resolveRhythmResult)와 달리 배율 없이 쿨타임으로 제한한다.
  castSkill(i: number) {
    const id = gameState().skills[i];
    if (!id || (this.skillCd[id] ?? 0) > 0) return;
    this.skillCd[id] = SKILLS[id].cd;
    SKILLS[id].effect(this.skillContext(), 1);
    this.cameras.main.flash(150, 255, 255, 200);
    this.floatText(this.hero.x, this.hero.y - 40, `⚡ ${SKILLS[id].name}`, '#ffee44');
  }

  buildUI() {
    const add = this.add;
    // 아레나 배경 — 에피소드 시드로 생성한 40×15 타일맵을 scale 2로 깔면 ARENA(1280×480)에 맞는다
    const { ground, props } = buildArenaMap(gameState().episode);
    const map = this.make.tilemap({ data: ground, tileWidth: 16, tileHeight: 16 });
    const tiles = map.addTilesetImage('tiles', 'tiles', 16, 16, 0, 1)!;
    map.createLayer(0, tiles, ARENA.x, ARENA.y)!.setScale(2).setDepth(-10);
    map.createBlankLayer('Props', tiles, ARENA.x, ARENA.y)!.setScale(2).setDepth(-9).putTilesAt(props, 0, 0);

    // 전투 영역 chrome (상단바=Hud, 리듬레인=Rhythm)
    this.reg(add.rectangle(CX, (SUMMON_Y + CANVAS.H) / 2, ARENA.w, CANVAS.H - SUMMON_Y, 0x1a1a24).setDepth(5)); // 소환 바
    this.reg(add.line(0, 0, ARENA.x, SUMMON_Y, ARENA.w, SUMMON_Y, 0x333344).setOrigin(0).setDepth(5));
    this.slots = this.available.map((k, i) => this.buildCard(k, i));
    this.toggleSlot(this.slots[0]); // 첫 카드는 켜둔다 — 수동 소환이 없어 전부 OFF면 방송이 안 굴러간다
  }

  // 소환 바 오브젝트 등록 — 용사 모드 전환 때 setSummonVisible이 한 번에 껐다 켠다
  reg<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.summonObjs.push(o);
    return o;
  }

  // 소환 카드 1장: 초상화 + 종류 정보 + 주기/수량 슬라이더. 카드 본체 클릭 = ON/OFF.
  buildCard(t: MonsterId, i: number): SummonSlot {
    const add = this.add;
    const def = MONSTERS[t];
    const x = CARD.x + i * (CARD.w + CARD.gap);
    const y = CARD.y;

    const bg = this.reg(
      add.rectangle(x, y, CARD.w, CARD.h, 0x22222e).setOrigin(0).setDepth(6).setStrokeStyle(2, 0x3a3a4a),
    ).setInteractive();
    this.reg(
      add
        .rectangle(x + 8, y + 8, 44, 44, 0x11111a)
        .setOrigin(0)
        .setDepth(7)
        .setStrokeStyle(1, 0x4a4a5e),
    );
    this.reg(
      add
        .image(x + 30, y + 30, `m_${t}`)
        .setDisplaySize(40, 40)
        .setDepth(8),
    );
    this.reg(add.text(x + 60, y + 10, def.name, { fontSize: '13px', fontStyle: 'bold', color: '#ffffff' }).setDepth(8));
    this.reg(
      add
        .text(x + 60, y + 30, `[${i + 1}] ⚔${def.dmg} ♥${def.hp} 💰${def.gold}`, {
          fontSize: '11px',
          color: '#8a8aa0',
        })
        .setDepth(8),
    );
    const chip = this.reg(
      add
        .text(x + CARD.w - 10, y + 10, '', { fontSize: '12px', fontStyle: 'bold' })
        .setOrigin(1, 0)
        .setDepth(8),
    );
    const cd = this.reg(
      add
        .rectangle(x + 2, y + CARD.h - 6, 0, 4, 0xffaa33)
        .setOrigin(0)
        .setDepth(8),
    );

    const iv = this.buildSlider(x, y + 58);
    const ct = this.buildSlider(x, y + 82);
    const slot: SummonSlot = { type: t, on: false, interval: 3, count: 1, t: 0, bg, chip, cd, iv, ct };

    bg.on('pointerdown', () => this.toggleSlot(slot));
    iv.hit.on('pointerdown', (p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation(); // 슬라이더 조작이 카드 토글로 새지 않게
      this.dragging = { slot, kind: 'interval', x: x + SLIDER.x };
      this.dragTo(p.x);
    });
    ct.hit.on('pointerdown', (p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.dragging = { slot, kind: 'count', x: x + SLIDER.x };
      this.dragTo(p.x);
    });
    this.refreshCard(slot);
    return slot;
  }

  // 트랙 + 채움 + 판정용 히트박스(트랙보다 세로로 넉넉하게 — 얇은 바를 정확히 집기 어렵다)
  buildSlider(x: number, ry: number): SliderView & { hit: Phaser.GameObjects.Rectangle } {
    const add = this.add;
    const label = this.reg(add.text(x + 10, ry, '', { fontSize: '11px', color: '#c8c8dd' }).setDepth(8));
    this.reg(
      add
        .rectangle(x + SLIDER.x, ry - 1, SLIDER.w, SLIDER.h, 0x11111a)
        .setOrigin(0)
        .setDepth(7),
    );
    const fill = this.reg(
      add
        .rectangle(x + SLIDER.x, ry - 1, 0, SLIDER.h, 0x5566cc)
        .setOrigin(0)
        .setDepth(8),
    );
    const hit = this.reg(
      add
        .rectangle(x + SLIDER.x, ry - 6, SLIDER.w, SLIDER.h + 12, 0xffffff, 0)
        .setOrigin(0)
        .setDepth(9),
    ).setInteractive();
    return { label, fill, hit };
  }

  toggleSlot(s: SummonSlot) {
    s.on = !s.on;
    s.t = 0; // 켜자마자 1회
    this.refreshCard(s);
  }

  // 클릭/드래그 x → 슬라이더 값. 트랙 밖으로 나가도 양 끝에 물린다.
  dragTo(px: number) {
    const d = this.dragging;
    if (!d) return;
    const r = clamp((px - d.x) / SLIDER.w, 0, 1);
    if (d.kind === 'interval') {
      d.slot.interval = Math.round((INTERVAL_MIN + r * (INTERVAL_MAX - INTERVAL_MIN)) * 10) / 10;
      d.slot.t = Math.min(d.slot.t, d.slot.interval);
    } else {
      d.slot.count = Math.round(COUNT_MIN + r * (COUNT_MAX - COUNT_MIN));
    }
    this.refreshCard(d.slot);
  }

  refreshCard(s: SummonSlot) {
    s.bg.setFillStyle(s.on ? 0x2c3350 : 0x22222e).setStrokeStyle(2, s.on ? 0xffaa33 : 0x3a3a4a);
    s.chip.setText(s.on ? '● ON' : '○ OFF').setColor(s.on ? '#ffcc44' : '#666677');
    s.iv.label.setText(`주기 ${s.interval.toFixed(1)}s`);
    s.iv.fill.width = (SLIDER.w * (s.interval - INTERVAL_MIN)) / (INTERVAL_MAX - INTERVAL_MIN);
    s.ct.label.setText(`수량 ×${s.count}`);
    s.ct.fill.width = (SLIDER.w * (s.count - COUNT_MIN)) / (COUNT_MAX - COUNT_MIN);
  }

  // 카드별 자동 소환: 활성 카드는 서로 독립적으로 자기 주기마다 count마리
  stepSummon(dt: number) {
    for (const s of this.slots) {
      if (!s.on) {
        s.cd.width = 0;
        continue;
      }
      s.t -= dt;
      if (s.t <= 0) {
        for (let i = 0; i < s.count; i++) this.summonRandom(s.type);
        s.t = s.interval;
      }
      s.cd.width = (CARD.w - 4) * (1 - clamp(s.t / s.interval, 0, 1));
    }
  }

  // ── 소환: 용사 반경(SUMMON_MIN_RADIUS) 밖 랜덤 지점 ──
  summonRandom(t: MonsterId) {
    if (this.over || this.monsters.length >= MAX_ALIVE) return;
    for (let i = 0; i < 10; i++) {
      // ponytail: 아레나가 넓어 몇 번 안에 성공, 실패 시 이번 입력 무시
      const x = Phaser.Math.Between(arenaBounds.minX, arenaBounds.maxX);
      const y = Phaser.Math.Between(arenaBounds.minY, arenaBounds.maxY);
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
    // 보스 등장 컷씬 — 도네이션과 같은 방식으로 전투를 멈추고 React에 넘긴다
    this.scene.pause('Hud');
    this.scene.pause();
    gameState().playCuts(bossCut(gameState().episode), () => {
      this.scene.resume();
      this.scene.resume('Hud');
    });
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
    if (card.trait) {
      // 특성 카드는 스탯이 아니라 전투 규칙을 준다 — grantCard/applyLiveUpgrade 경로를 안 탄다
      gameState().grantTrait(card.trait);
      const t = TRAITS[card.trait];
      this.cameras.main.flash(400, 255, 120, 220);
      this.floatText(this.hero.x, this.hero.y - 40, `${t.icon} ${t.name} 각성!`, '#ff66cc');
      this.pushChat('시스템', `🎁 특성 획득 — ${t.icon} ${t.name}: ${t.desc}`, '#ff66cc');
    } else {
      gameState().grantCard(card);
      this.applyLiveUpgrade(card.key, card.delta, `🎁 ${RARITY[card.rarity].label} 카드!`);
    }
    if (this.pendingSkill) {
      this.resolveRhythmResult(this.pendingSkill);
      this.pendingSkill = null;
    }
  }

  // ── 리듬 보상: 시청자 변화율 + 스킬 등급 획득 (+ ALL PERFECT 추가 후원) — GDD 3-4, 2026-07-28 개편.
  // 예전엔 보유 스킬 중 하나가 배율로 발동했지만, 이제 리듬 결과 자체가 신규 스킬 지급을 겸한다.
  resolveRhythmResult(res: SkillOutcome) {
    if (res.penalty) {
      this.viewers = Math.max(MIN_VIEWERS, this.viewers * res.viewerMult);
      this.pushChat('시스템', '스킬 불발... 시청자가 실망했다', '#ff6666');
      return;
    }
    this.viewers *= res.viewerMult;
    const parts = [`시청자 +${Math.round((res.viewerMult - 1) * 100)}%`];

    const gained = res.rarity ? pickSkillReward(gameState().skills, res.rarity) : null;
    if (gained) {
      gameState().learnSkill(gained, 0);
      parts.push(`${RARITY_LABEL[res.rarity!]} 스킬 [${SKILLS[gained].name}] 획득`);
    }

    if (res.bonusDonation) {
      const { amount } = rollDonation(this.viewers);
      gameState().addGold(amount);
      this.totalDonated += amount;
      parts.push(`추가 후원 ${amount.toLocaleString()}G`);
    }

    this.cameras.main.flash(res.clear ? 400 : 150, 255, 255, 200);
    this.floatText(this.hero.x, this.hero.y - 40, `🎁 ${res.grade}`, '#ffee44');
    this.pushChat('시스템', `🎁 ${res.grade} — ${parts.join(' · ')}`, '#ffee44');
    if (res.clear) {
      for (const line of CHAT_POOLS.allperfect) {
        const who = this.randomViewer();
        if (who) this.pushChat(who, line, '#ffee44');
      }
    }
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
      // 콤보는 용사 모드 전용 — 카드를 켜두고 방치하면 쌓이는 자동 소환 처치까지 세면 의미가 없다
      if (gameState().mode === 'hero') {
        bumpCombo(this);
        if (this.combo >= 2) this.floatText(m.x, m.y - 20, `${this.combo} COMBO`, '#ffaa33');
      }
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
    } else if (this.stageGold >= this.target) {
      this.spawnBoss();
    }

    this.stepSummon(dt);

    const near = countNear(this.monsters, H);
    // this는 { viewers, peakViewers, drift } 필드를 가져 ViewerState로 그대로 넘긴다.
    const step = stepViewers(this, H.hp / H.maxHp, near, dt);
    this.D = step.D;
    this.tier = step.tier;
    this.updateRequest(dt); // 위기 판정 전 — 요청 보상이 그 프레임의 시청자 수에 바로 반영된다
    this.updateCritical(dt);
    if (this.over) return;

    if (!this.isFinal) {
      // 최종화는 도네이션 금지 (GDD 7장, 2026-07-28 정정)
      this.donateT -= dt;
      if (this.donateT <= 0) {
        this.fireDonation();
        this.donateT = donationInterval(this.viewers);
      }
    }

    for (const id of Object.keys(this.skillCd) as SkillId[]) this.skillCd[id] = Math.max(0, this.skillCd[id]! - dt);
    this.modeCd = Math.max(0, this.modeCd - dt);
    this.noHitT += dt; // hurtHero가 0으로 되돌린다

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

  // 경보 단계가 바뀔 때만 흔들림을 갈아끼운다 (매 프레임 shake 재호출은 진동이 튄다).
  // GDD 3-9 정정(2026-07-28): warn(시청자 ≤5)은 화면 흔들림 없이 주황 비네팅만 — 흔들림은
  // critical(1명)에서만. HudScene.alertVignette가 b.alert를 읽어 비네팅 색/알파를 그린다.
  syncAlert() {
    const next = viewerAlert(this.viewers, this.critical);
    if (next === this.alert) return;
    this.alert = next;
    this.cameras.main.shakeEffect.reset();
    if (next === 'warn') {
      this.pushChat('시스템', '시청자가 빠지고 있다...', '#ff9933');
    } else if (next === 'critical') {
      this.cameras.main.shake(SHAKE_HOLD, 0.006);
    }
  }

  // 용사 모드일 때만 입력 벡터를 만든다. 마왕 모드면 undefined → stepHero가 자동 AI로 돈다.
  heroInput(): HeroInput | undefined {
    if (gameState().mode !== 'hero') return undefined;
    const k = this.keys;
    const down = (a: Phaser.Input.Keyboard.Key, b: Phaser.Input.Keyboard.Key) => (a.isDown || b.isDown ? 1 : 0);
    return {
      dx: down(k.D, k.RIGHT) - down(k.A, k.LEFT),
      dy: down(k.S, k.DOWN) - down(k.W, k.UP),
      dash: k.SHIFT.isDown,
    };
  }

  // 용사 피격 단일 진입점 — 무적(대시) 판정을 한 곳에 모은다. 근접·화살 양쪽이 여기로 온다.
  // 반환값 = 실제로 맞았는가 (반격 특성이 이걸 보고 반사한다).
  hurtHero(dmg: number): boolean {
    if (this.hero.invulnT > 0) return false;
    this.hero.hp -= dmg;
    this.noHitT = 0;
    return true;
  }

  // 용사가 이번에 넣는 피해 — 광전사(HP 낮을수록 ↑)가 여기서만 곱해진다.
  heroDamage(): number {
    return this.hero.atk * heroAtkMult(gameState().traits, this.hero.hp / this.hero.maxHp);
  }

  updateHero(dt: number, nearCount: number) {
    const H = this.hero;
    // 결정 로직은 battleSim.stepHero(순수). 씬은 결과를 스프라이트에 반영 + 공격만 처리.
    const intent = stepHero(H, this.monsters, nearCount, dt, { x: CX, y: 300 }, arenaBounds, this.heroInput());
    if (intent.attack) {
      const dmg = this.heroDamage();
      this.damageMonster(intent.attack, dmg);
      H.hp = Math.min(H.maxHp, H.hp + vampHeal(gameState().traits, dmg)); // 흡혈
    }
    this.heroSpr.setPosition(H.x, H.y);
    this.heroSpr.setAlpha(H.invulnT > 0 ? 0.5 : 1); // 대시 무적을 눈에 보이게
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
        case 'melee': {
          // 반격은 실제로 맞았을 때만 (대시 무적으로 흘리면 반사도 없다)
          const thorns = this.hurtHero(intent.dmg) ? thornsDmg(gameState().traits, intent.dmg) : 0;
          if (thorns > 0 && !m.dead) this.hitFx(m, thorns);
          if (intent.suicide && !m.dead) {
            m.dead = true;
            m.spr.destroy();
          }
          break;
        }
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
      if (res !== 'expire') this.hurtHero(res.hit); // 명중이면 용사 피격 (무적 판정은 hurtHero)
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

  // ── 시청자 요청: 채팅으로 요구가 뜨고 제한시간 안에 조건을 채우면 시청자가 몰린다 ──
  // 판정은 requests.stepRequest(순수). 씬은 출제 타이밍과 연출만 소유.
  updateRequest(dt: number) {
    if (this.req) {
      const c = this.reqCtx(this.req);
      this.reqPct = reqProgress(this.req, c);
      const ev = stepRequest(this.req, c, dt);
      if (ev) this.endRequest(ev === 'success');
      return;
    }
    this.reqT -= dt;
    if (this.reqT > 0) return;
    const boss = this.boss && !this.boss.dead ? this.boss : null;
    const def = pickRequest(
      { unlocked: this.available, hero: gameState().mode === 'hero', boss: !!boss },
      Math.random,
      this.lastReq ?? undefined,
    );
    if (!def) return;
    // 목표치는 출제 시점의 용사 전투력으로 확정 — 용사가 셀수록 시청자 요구도 커진다
    this.req = startRequest(def, heroPower(gameState().hero), this.kills, boss?.hp ?? 0);
    this.reqPct = 0;
    this.lastReq = def;
    this.pushChat(this.randomViewer() ?? '시청자', `📢 ${this.req.label}`, '#66ddff');
  }

  reqCtx(r: ActiveRequest): ReqCtx {
    const alive = this.monsters.filter((m) => !m.dead); // 같은 프레임에 죽은 몬스터는 아직 배열에 남아있다
    return {
      count: (t) => alive.filter((m) => m.type === t).length,
      total: alive.length,
      hpRatio: this.hero.hp / this.hero.maxHp,
      killsSince: this.kills - r.kills0,
      combo: this.combo,
      noHitT: this.noHitT,
      // 보스 HP는 단조 감소라 시작 시점 스냅샷만 있으면 누적기 없이 진행률이 나온다
      bossDmgRatio: r.bossHp0 > 0 ? clamp((r.bossHp0 - (this.boss?.hp ?? 0)) / r.bossHp0, 0, 1) : 0,
    };
  }

  endRequest(ok: boolean) {
    this.req = null;
    this.reqT = REQ_GAP;
    this.viewers = Math.max(MIN_VIEWERS, this.viewers * (ok ? REQ_WIN : REQ_LOSE));
    if (ok) {
      this.pushChat('시스템', '📢 요청 달성! 시청자가 몰려온다', '#66ddff');
      this.floatText(this.hero.x, this.hero.y - 60, '📢 요청 달성!', '#66ddff');
      const who = this.randomViewer();
      if (who) this.pushChat(who, Phaser.Utils.Array.GetRandom(CHAT_POOLS.allperfect as string[]), '#66ddff');
    } else {
      this.pushChat('시스템', '📢 요청 실패... 시청자가 나간다', '#ff9933');
    }
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
