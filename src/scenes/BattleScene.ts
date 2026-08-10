import Phaser from 'phaser';
import {
  clamp,
  hypeTier,
  donationInterval,
  rollDonation,
  clampDonation,
  donationTier,
  stepCritical,
  viewerAlert,
  rollChance,
  critMultiplier,
  mitigate,
  goldWithBonus,
  MIN_VIEWERS,
  CRIT_TIME,
  COMBO_FULL,
  COMBO_DONATION_CUT,
  type HypeTier,
  type SkillOutcome,
  type ViewerAlert,
} from '../formulas.ts';
import { dirOf, playAnim, playOnce, makeActor, type Dir } from '../game/anims.ts';
import { HERO_CHAR, BOX_TEXTURE, FX_BASH, GLOW_TEXTURE, RING_GLOW_TEXTURE } from './BootScene.ts';
import { gameState, heroPower } from '../game/store.ts';
import { playSfx } from '../game/sfx.ts';
import { bus, busBind } from '../game/events.ts';
import { ARENA, CANVAS, SUMMON_Y, CX, arenaBounds } from '../game/layout.ts';
import { drawArena } from '../game/arenaRender.ts';
import { spawnHero, type HeroEntity, type MonsterEntity, type Arrow, type SkillContext } from '../game/entities.ts';
import {
  stepHero,
  stepMonster,
  stepBossGolem,
  stepBossKnight,
  stepBossMaou,
  stepArrow,
  stepViewers,
  bumpCombo,
  countNear,
  facingOf,
  applyAuras,
  armorReduce,
  SUMMON_MIN_RADIUS,
  HIT_INVULN_DUR,
  GOLEM_PATTERN_CD,
  GOLEM_STOMP_RADIUS,
  KNIGHT_PATTERN_CD,
  KNIGHT_SWORDBEAM_SPEED,
  KNIGHT_SWORDBEAM_WINDUP,
  KNIGHT_CHARGE_WINDUP,
  KNIGHT_SPACESLASH_THRESHOLD,
  KNIGHT_SPACESLASH_WINDUP,
  KNIGHT_SPACESLASH_RANGE,
  MAOU_PATTERN_CD,
  MAOU_ENERGYBALL_SPEED,
  MAOU_ENERGYBALL_WINDUP,
  MAOU_LIGHTRAIN_WINDUP,
  MAOU_LIGHTRAIN_COUNT,
  MAOU_LIGHTRAIN_RADIUS,
  MAOU_LIGHTRAIN_SCATTER_MIN,
  MAOU_LIGHTRAIN_SCATTER_MAX,
  MAOU_METEOR_WINDUP,
  MAOU_WARP_WINDUP,
  type HeroInput,
  type Facing,
  type BossPattern,
} from '../game/battleSim.ts';
import {
  hasTrait,
  heroAtkMult,
  timeSlashMult,
  vampHeal,
  thornsDmg,
  warriorBloodHeal,
  defenseBonus,
  applyDot,
  applyStun,
  TRAITS,
  HEAVY_STRIKE_EVERY,
  HEAVY_STRIKE_MULT,
  HEAVY_STRIKE_STUN,
  THORN_BLADE_CHANCE,
  THORN_BLADE_DOT_T,
  THORN_BLADE_DPS_RATIO,
  WIND_SLASH_DMG_RATIO,
  WAR_CRY_STUN,
  FLAME_SWORD_DOT_T,
  FLAME_SWORD_DPS_RATIO,
  FLAME_SWORD_MAX_STACK,
  FROST_STRIKE_STUN,
  FROST_STRIKE_BOSS_STUN,
  CHAIN_LIGHTNING_CHANCE,
  CHAIN_LIGHTNING_TARGETS,
  CHAIN_LIGHTNING_RATIO,
  SHADOW_CLONE_CHANCE,
  FURY_BLAST_RATIO,
  FURY_BLAST_RADIUS,
  GIANT_BLADE_ATKSPD_MULT,
  GIANT_BLADE_RANGE_MULT,
  PHOENIX_HP_RATIO,
  PHOENIX_BURN_DPS_RATIO,
  PHOENIX_BURN_T,
  TIME_SLASH_EVERY,
  TIME_SLASH_FREEZE_MS,
} from '../data/traits.ts';
import { MONSTERS, type MonsterId, type MonsterDef } from '../data/monsters.ts';
import { syncRoster } from '../data/nicknames.ts';
import { upgradeCostRange } from '../data/upgrades.ts';
import { RARITY, type Card, type StatMod } from '../data/cards.ts';
import { SUMMON_CURSES } from '../data/cardCurses.ts';
import { SKILLS, type Skill, type SkillId } from '../data/skills.ts';
import { CHAT_POOLS, pickChatMood, pickDonationMessage } from '../data/chat.ts';
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
import { FINAL_EP, targetGold, bossOf, START_VIEWERS, viewerCap } from '../data/progression.ts';
import {
  waveAt,
  stepWave,
  filledWaves,
  lineupMonsters,
  defaultLineup,
  validateLineup,
  WAVE_INTERVAL,
  type Lineup,
  type WaveEntry,
} from '../data/waves.ts';
import { bossCut } from '../data/cutscenes.ts';
import type { RunOutcome } from '../game/store.ts';

const MAX_ALIVE = 60; // 동시 생존 상한 — 넘으면 소환 스킵 (프레임 보호)
// 첫 웨이브까지의 유예. 방송 시작 직후 몇 초는 화면이 비어야 "이제 시작한다"가 읽히지만,
// 길면 예전처럼 무목표 구간이 된다 — WAVE_INTERVAL보다 훨씬 짧게 잡는다.
const WAVE_FIRST_DELAY = 2.5;
// 즉시 호출(SPACE)로 웨이브를 앞당겼을 때 붙는 보상. 위험을 먼저 감수한 대가로 시청자가 붙는다.
const WAVE_CALL_VIEWER_BONUS = 1.06;

const HP_BAR_W = 48; // ponytail: 체력바 크기 knob
const HP_BAR_H = 8;
const KNOCKBACK_RADIUS = 120; // ponytail: 방패 밀치기 발동 반경(px) — GDD엔 확률만 있고 거리는 없어 여기서 정한다
const KNOCKBACK_DIST = 60; // 밀려나는 거리(px)
const HIT_KNOCKBACK_DIST = 22; // ponytail: 공격 적중마다 밀려나는 기본 거리(px) — monsters.ts의 kb 배율이 곱해진다
const HIT_KNOCKBACK_DUR = 0.15; // 넉백이 슬라이드로 보이는 시간(초) — 이 안에 위 거리만큼 이동
const CHARGE_HERO_KB_DIST = 70; // ponytail: 사이클롭스 돌진 충돌 시 용사가 밀려나는 거리(px)
// 보스 패턴 → 윈드업 동안 돌릴 모션. 사르가스 아틀라스는 패턴별로 전용 액션을 들고 있다
// (throwing = 돌을 줍고 머리 위로 들기 · attack = 뛰어올라 내려찍기). 재생 속도는 anims.ts가
// 윈드업 길이에 맞춰 놨으므로 시작만 걸어두면 발동 시각에 딱 그 프레임이 나온다.
// charge/knightCharge는 비어 있다: 윈드업 동안은 제자리라 rush(질주)를 걸면 발이 미끄러진다 — 예고는
// 조준선이 맡고, 실제 rush는 돌진이 시작되는 bossChargeMove/bossKnightChargeMove부터 돈다.
const BOSS_WINDUP_ANIM: Partial<Record<BossPattern, string>> = {
  rock: 'throwing',
  stomp: 'attack',
  // 베르하르트 검기: attack 애니메이션(윈드업 0.7초에 맞춰 느리게 재생, 마지막 프레임에서 발사)
  swordbeam: 'attack',
  // 공간 가르기는 윈드업 때 idle만 (실제 발동 시 attack 재생)
};
// 용사 원본은 92×92 캔버스에 인물 ~20×46px.
// 1 = 리샘플 없음 = pixelArt 필터에서 가장 깨끗하다. ponytail: 화면상 크기 knob, 줄이면 축소 시 픽셀이 떤다.
const HERO_SCALE = 1;
const SHAKE_HOLD = 999_999; // critical 흔들림은 단계가 바뀔 때까지 유지 (reset으로 끈다). warn은 흔들지 않는다

export default class BattleScene extends Phaser.Scene {
  isFinal!: boolean;
  hero!: HeroEntity;
  monsters!: MonsterEntity[];
  arrows!: Arrow[];
  viewers!: number;
  peakViewers!: number;
  viewerSyncT!: number;
  hudSyncT!: number; // React InfoLayer로 쏘는 hud:tick 스로틀 (씬 전용 값만 — store 중복값은 안 보낸다)
  totalDonated!: number;
  kills!: number;
  killGold!: number; // 몬스터 처치로 번 골드
  target!: number; // 보스 등장 조건: stageGold 목표
  boss!: MonsterEntity | null; // 등장 후 유지 — 죽으면 스테이지 클리어
  critical = false; // 시청자 바닥 위기 (카운트다운 진행 중)
  critT = 0;
  alert: ViewerAlert = 'normal'; // React InfoLayer가 hud:tick으로 받아 시청자 수 색을 바꾼다
  audience: string[] = []; // 현재 접속 중인 시청자 닉네임 — 채팅·후원자가 여기서만 나온다
  drift = 0; // 시청자 증감률에 얹히는 흔들림 (기계적인 지수곡선 방지)
  combo = 0; // 처치 콤보 — ComboMeter가 읽고, FULL이면 도네이션 확률도 보정된다
  comboT = 0;
  noHitT!: number; // 마지막 피격 이후 경과(초) — "노 데미지" 요청이 읽는다
  donateT!: number;
  freezeUntil!: number; // 시간 정지 스킬
  D!: number;
  tier!: HypeTier; // React InfoLayer가 hud:tick으로 읽음
  over!: boolean;
  // ── 웨이브 편성 (2026-08-09) — 소환은 더 이상 방송 중 조작이 아니다 ──
  // 방송 전 편성 화면에서 짠 lineup이 여기 복사돼 오고, waveT가 0이 될 때마다 다음 웨이브가 투입된다.
  // 씬이 store를 매 프레임 다시 읽지 않도록 create에서 한 번만 스냅샷한다 — 방송 중엔 편성이 안 바뀐다.
  lineup!: Lineup;
  lineupTypes!: MonsterId[]; // 편성에 들어간 몬스터 종류 — 시청자 요청 출제 풀
  waveIndex!: number; // 지금까지 투입한 웨이브 수 (다음에 나갈 웨이브의 인덱스)
  waveT!: number; // 다음 웨이브까지 남은 시간(초). SPACE 즉시 호출이 이 값을 0으로 만든다
  keys!: Record<string, Phaser.Input.Keyboard.Key>; // 용사 이동/대시 (폴링)
  skillCd: Partial<Record<SkillId, number>> = {}; // QWER 스킬 시전 쿨타임 (castSkill 재사용 가능 판정용)
  heroSpr!: Phaser.GameObjects.Sprite;
  facingDir: Dir = 'south'; // 마지막으로 바라본 방향 — 정지 시 이 방향 대기 모션으로 선다
  heroHpBar!: Phaser.GameObjects.Graphics;
  pendingSkill: SkillOutcome | null = null; // 리액션 리듬 결과 — 전투 재개 시점에 발동
  donationPaused = false; // fireDonation이 대박이라 scene.pause()를 걸었는지 — endDonation이 자기 몫만 resume하게
  chatT = 0;
  req: ActiveRequest | null = null; // 진행 중인 시청자 요청 (React InfoLayer가 hud:tick으로 받아 배너 렌더)
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
    this.hudSyncT = 0;
    this.totalDonated = 0;
    this.kills = 0;
    this.killGold = 0;
    this.target = targetGold(S.episode);
    // 개발 리모콘의 보스 버튼으로 들어온 방송 — 등장 게이지를 채운 채로 시작한다. 첫 update()가
    // 평소 경로 그대로 spawnBoss()로 넘어가므로 보스전 전용 진입 경로를 따로 만들지 않아도 된다
    // (killGold는 게이지·HUD용 집계일 뿐이라 실제 보유 골드나 정산에는 영향이 없다).
    if (import.meta.env.DEV && S.devBossJump) {
      this.killGold = this.target;
      S.setDevBossJump(false);
    }
    this.boss = null;
    S.setBossUp(false); // 지난 화 보스 BGM이 새 방송까지 따라오지 않게
    this.critical = false;
    this.critT = 0;
    this.alert = 'normal';
    this.audience = syncRoster([], this.viewers);
    this.drift = 0;
    this.combo = 0;
    this.comboT = 0;
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

    // 편성 스냅샷. 편성 화면을 건너뛰고 들어온 경우(개발 리모콘·세이브 복구)에도 방송이 굴러가야 하므로
    // 유효하지 않으면 자동 편성으로 대체한다 — "아무것도 안 나오는 방송"이 제일 나쁘다.
    this.lineup = validateLineup(S.lineup, S.episode) ? defaultLineup(S.episode) : S.lineup;
    this.lineupTypes = lineupMonsters(this.lineup);
    this.waveIndex = 0;
    this.waveT = WAVE_FIRST_DELAY;
    this.skillCd = {};
    S.resetSkillUses(); // 스테이지 시작 시 스킬 사용 횟수 초기화

    this.buildUI();
    // 최종화: 도네이션 금지(GDD 7장) — 소환 버튼도 숨긴다(React SummonPanel이 isFinal을 직접 계산해 처리).
    // 도네이션 차단은 update()의 donateT 블록에서 isFinal로 건너뛴다.
    this.heroSpr = makeActor(this, this.hero.x, this.hero.y, HERO_CHAR, 48, BOX_TEXTURE).spr.setScale(HERO_SCALE);
    // 대기 모션은 별도 스프라이트 없이 트윈으로. y는 매 프레임 덮어써지므로 scaleY만 건드린다.
    this.tweens.add({
      targets: this.heroSpr,
      scaleY: HERO_SCALE * 1.06,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.heroHpBar = this.add.graphics().setDepth(3); // 몬스터·화살 위로

    // 전투 정지는 딱 리듬 미니게임이 시작되는 순간부터다 — 알림(alert)·춤 연출(reaction) 동안은
    // 화면을 안 덮으니 안 멈춘다. rhythm:start는 React(DonationEvent)가 그 시점에만 쏜다.
    busBind(this, 'rhythm:start', () => {
      this.donationPaused = true;
      this.scene.pause();
      bus.emit('battle:pause', null); // InfoLayer/ComboMeter 등 React UI도 같이 멈춰야 한다
    });
    // 리듬 결과는 씬이 멈춰 있는 동안 도착한다. 카드 룰렛(donation-widget)은 화면을 안 덮으니
    // 전투를 계속 멈춰둘 필요가 없다 — 리듬이 끝나는 이 시점에 바로 재개한다. 스킬 발동/카드 지급
    // 자체는 룰렛이 다 끝난 뒤(donation:end → endDonation)까지 미룬다.
    busBind(this, 'rhythm:result', (res) => {
      this.pendingSkill = res;
      if (this.donationPaused) {
        this.donationPaused = false;
        this.scene.resume();
        bus.emit('battle:resume', null);
      }
    });
    busBind(this, 'donation:end', ({ card }) => this.endDonation(card));
    busBind(this, 'pause:toggle', () => this.toggleUserPause());
    // React SummonPanel의 "웨이브 즉시 호출" 버튼 → SPACE와 같은 경로.
    busBind(this, 'wave:call', () => this.callWaveNow());
    busBind(this, 'skill:request', ({ index }) => this.castSkill(index));
    // 개발 모드 전용: 보스 강제 소환
    busBind(this, 'dev:spawn-boss', () => this.spawnBoss());
    // 개발 모드 전용: 보스 즉시 처치
    busBind(this, 'dev:kill-boss', () => {
      if (this.boss && this.boss.hp > 0) {
        this.boss.hp = 0;
      }
    });
    // 개발 모드 전용: 보스 패턴 강제 실행
    busBind(this, 'dev:boss-pattern', ({ pattern }) => this.forceBossPattern(pattern));

    // 용사 이동/대시는 폴링 (매 프레임 눌림 상태를 읽어야 한다). 2026-08-10: 방향키 → WASD.
    // 예전엔 W가 스킬(Q/W/E/R)과 부딪혀 방향키를 썼지만, 스킬이 숫자키로 내려가면서 자리가 비었다.
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    // SPACE = 다음 웨이브 즉시 호출, 1/2/3/4 = 스킬 1~4 시전.
    // 숫자키 소환은 없어졌다(2026-08-09 웨이브 편성 개편) — 그래서 비어 있던 숫자열을 스킬이 가져갔다.
    // 도네이션 중엔 이 씬이 pause라 QWER(RhythmLane 리듬 판정)와 동시 발화하지 않는다.
    // 둘 다 메서드를 직접 부르지 않고 이벤트로 emit한다 — React SummonPanel 버튼 클릭과 같은 경로를
    // 타야 그쪽의 클릭 피드백(팝 애니메이션)이 키 입력에도 걸린다.
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault(); // 스페이스는 브라우저 기본 스크롤이 붙는다
        return bus.emit('wave:call', null);
      }
      const slot = ['1', '2', '3', '4'].indexOf(e.key);
      if (slot >= 0) bus.emit('skill:request', { index: slot });
    });

    this.pushChat(
      '시스템',
      this.isFinal ? '최종화 — 마왕이 직접 나선다!' : `${S.episode}화 방송이 시작되었습니다.`,
      '#888888',
    );
    // 시작 소환은 없다 — WAVE_FIRST_DELAY 뒤 첫 웨이브가 통째로 들어온다.
    if (!this.isFinal) {
      this.pushChat(
        '시스템',
        `📋 ${filledWaves(this.lineup)}개 웨이브 편성 완료 · SPACE = 다음 웨이브 즉시 호출`,
        '#88ddaa',
      );
    }
  }

  // 스킬 시전 (QWER키). 쿨타임 + 스테이지당 사용 횟수 제한을 함께 검사한다.
  castSkill(i: number) {
    const S = gameState();
    const id = S.skills[i];
    if (!id || (this.skillCd[id] ?? 0) > 0) return;
    // 스테이지당 사용 횟수 제한 검사 — useSkill이 false 반환 시 횟수 소진
    if (!S.useSkill(id)) {
      this.floatText(this.hero.x, this.hero.y - 40, '❌ 사용 횟수 소진', '#ff6666');
      return;
    }
    this.skillCd[id] = SKILLS[id].cd;
    playSfx('skill');
    SKILLS[id].effect(this.skillContext(), 1);
    if (!(SKILLS[id] as Skill).noScreenFlash) this.cameras.main.flash(150, 255, 255, 200);
    this.floatText(this.hero.x, this.hero.y - 40, `⚡ ${SKILLS[id].name}`, '#ffee44');
  }

  buildUI() {
    // 아레나 배경(타일맵 + 소품)은 던전 상점(ShopScene)과 공유한다 — game/arenaRender.ts
    drawArena(this, gameState().episode);
    // 전투 영역 chrome — 상단바(InfoLayer)·하단 소환/용사 패널(SummonPanel)·리듬레인(Rhythm) 전부 React.
  }

  // 보스전 중엔 도네이션·소환·시청자 요청을 전부 막는다(2026-08-07, 피드백: "보스전엔 다른 거 다
  // 막고 보스에만 집중하고 싶다") — 보스가 죽거나(endRun 'clear') 용사가 죽는 것 말고는 보스전을
  // 벗어날 방법이 없어서, "잠깐 막았다가 나중에 푼다" 같은 재개 로직이 필요 없다.
  bossActive(): boolean {
    return !!this.boss && !this.boss.dead;
  }

  // ── 소환: 용사 반경(SUMMON_MIN_RADIUS) 밖 랜덤 지점 ──
  summonRandom(t: MonsterId) {
    if (this.over || this.bossActive() || this.monsters.length >= MAX_ALIVE) return;
    for (let i = 0; i < 10; i++) {
      // ponytail: 아레나가 넓어 몇 번 안에 성공, 실패 시 이번 입력 무시
      const x = Phaser.Math.Between(arenaBounds.minX, arenaBounds.maxX);
      const y = Phaser.Math.Between(arenaBounds.minY, arenaBounds.maxY);
      if (Phaser.Math.Distance.Between(x, y, this.hero.x, this.hero.y) >= SUMMON_MIN_RADIUS) {
        return this.doSummon(t, x, y);
      }
    }
  }

  // ── 웨이브 ──
  // 방송 중 몬스터가 나오는 유일한 경로(저주 카드의 기습 소환만 예외). 편성한 칸을 순서대로 돌고,
  // 다 돌면 처음으로 돌아가되 물량이 불어난다(waves.waveAt).
  spawnWave() {
    if (this.over || this.bossActive() || this.isFinal) return;
    const entries = waveAt(this.lineup, this.waveIndex);
    if (!entries.length) return; // 편성이 비어 있으면 조용히 넘긴다 (create가 막지만 방어적으로)
    this.waveIndex++;
    for (const e of entries) for (let i = 0; i < e.count; i++) this.summonRandom(e.type);

    const label = entries.map((e) => `${MONSTERS[e.type].name}×${e.count}`).join(' · ');
    this.pushChat('시스템', `🌊 웨이브 ${this.waveIndex} — ${label}`, '#88ddaa');
    this.floatText(CX, ARENA.y + 40, `🌊 WAVE ${this.waveIndex}`, '#88ddaa');
    playSfx('questClear');
  }

  // SPACE(또는 React 버튼) — 다음 웨이브를 기다리지 않고 지금 부른다.
  // 앞 웨이브가 아직 살아있는 채로 겹쳐 밀려오므로 위험하지만, 그만큼 판이 커져 시청자가 붙는다.
  // 이게 방송 중 남은 유일한 소환 조작이자 "슬라임 N마리 세워봐" 류 시청자 요청의 대응 수단이다.
  callWaveNow() {
    if (this.over || this.bossActive() || this.isFinal) return;
    // 씬이 멈춰 있는 동안엔 무시한다. 버스 구독은 scene.pause()와 무관하게 계속 살아 있어서,
    // 도네이션 리듬·컷씬·일시정지 중에 SPACE를 누르면 멈춘 화면에 몬스터가 쏟아졌다
    // (컷씬 스킵 버튼도 SPACE라 특히 겹치기 쉽다).
    if (!this.scene.isActive()) return;
    if (this.monsters.length >= MAX_ALIVE) {
      this.floatText(this.hero.x, this.hero.y - 40, '❌ 화면이 꽉 찼다', '#ff6666');
      return;
    }
    this.spawnWave();
    this.waveT = WAVE_INTERVAL; // 타이머는 그대로 리셋 — 연타해도 간격 이득은 없다
    this.viewers *= WAVE_CALL_VIEWER_BONUS;
    this.pushChat(this.randomViewer() ?? '시청자', '오 미친 벌써 다음 웨이브 부름 ㅋㅋㅋ', '#ffcc66');
  }

  // 분열 몬스터 처치 처리. 분열체는 split을 지운 def로 넣어 1세대에서 끊는다 —
  // 안 그러면 분열체가 또 분열해 무한 증식한다.
  splitProc(m: MonsterEntity) {
    const s = m.def.split;
    if (!s || this.monsters.length >= MAX_ALIVE) return;
    // split.into는 타입 순환을 피하려고 string이다(monsters.ts 주석 참고) — 실재하는 id인지 여기서 확인한다.
    // 오타 자체는 test/waves.test.ts가 전수 검사로 먼저 잡는다.
    const into = s.into as MonsterId;
    const base: MonsterDef | undefined = MONSTERS[into];
    if (!base) return;
    const { split: _drop, ...childDef } = base; // 분열체는 split을 뗀 def로 — 1세대에서 끊는다
    for (let i = 0; i < s.count; i++) {
      const x = clamp(m.x + Phaser.Math.Between(-28, 28), arenaBounds.minX, arenaBounds.maxX);
      const y = clamp(m.y + Phaser.Math.Between(-28, 28), arenaBounds.minY, arenaBounds.maxY);
      this.doSummon(into, x, y).def = childDef;
    }
    this.floatText(m.x, m.y - 30, '분열!', '#ffaa66');
  }

  doSummon(t: MonsterId, x: number, y: number): MonsterEntity {
    const def: MonsterDef = MONSTERS[t];
    const { spr, char } = makeActor(this, x, y, def.char, def.size, BOX_TEXTURE);
    if (def.tint) spr.setTint(def.tint);
    // 곱셈이라 대체 상자(setDisplaySize로 이미 스케일이 들어간)에도 그대로 먹는다
    if (def.scale) spr.setScale(spr.scaleX * def.scale, spr.scaleY * def.scale);
    const m: MonsterEntity = { type: t, def, hp: def.hp, x, y, atkCd: 0, windupT: 0, spr, char };
    this.monsters.push(m);
    return m;
  }

  // ── 보스: 목표 골드 도달 시 용사 반대편에 등장. 격파 = 스테이지 클리어 ──
  spawnBoss() {
    const t = bossOf(gameState().episode);
    const x = this.hero.x < CX ? arenaBounds.maxX - 40 : arenaBounds.minX + 40;
    this.boss = this.doSummon(t, x, (ARENA.y + SUMMON_Y) / 2);
    // 보스 전용 상태머신 초기화 — 등장 직후 바로 패턴이 나가면 컷씬 끝나자마자 맞을 수 있어
    // 짧은 유예(cooldown)를 깔고 시작한다.
    if (t === 'boss_golem') {
      this.boss.bossPhase = 'cooldown';
      this.boss.bossT = GOLEM_PATTERN_CD * 0.5;
    } else if (t === 'boss_knight') {
      this.boss.bossPhase = 'cooldown';
      this.boss.bossT = KNIGHT_PATTERN_CD * 0.5;
    } else if (t === 'boss_maou') {
      this.boss.bossPhase = 'cooldown';
      this.boss.bossT = MAOU_PATTERN_CD * 0.5;
      this.boss.warpPhase = 0;
    }
    gameState().setBossUp(true); // BGM 전환(useBgm) — 아래 playCuts와 같은 렌더에 묶여 컷씬 뒤 보스 곡으로 이어진다
    gameState().recordBossSeen(t); // 해금 도감 — 등장을 본 순간이 기준이다 (잡았는지는 안 따진다)
    // 진행 중이던 시청자 요청이 있었다면 그 자리에서 정리 — bossActive() 가드가 걸린 뒤로는
    // updateRequest가 더 이상 안 돌아서(런이 끝날 때까지 보스전만 이어진다) 방치하면 HUD에 낡은
    // 요청이 그대로 박제된다.
    this.req = null;
    this.reqPct = 0;
    this.cameras.main.flash(600, 255, 80, 80);
    this.floatText(this.boss.x, this.boss.y - 60, `☠ ${MONSTERS[t].name} 등장!`, '#ff4444');
    this.pushChat('시스템', `☠ ${MONSTERS[t].name} 등장! 용사가 쓰러뜨리면 방송 성공`, '#ff4444');
    this.pushChat(
      '시스템',
      '⚔ 보스전 — 도네이션·시청자 요청·소환이 중단됩니다. 지금 있는 것만으로 싸워야 해요',
      '#ff8844',
    );
    // 보스 등장 컷씬 — 도네이션과 같은 방식으로 전투를 멈추고 React에 넘긴다
    this.scene.pause();
    bus.emit('battle:pause', null); // InfoLayer/ComboMeter 등 React UI도 같이 멈춰야 한다
    gameState().playCuts(bossCut(gameState().episode), () => {
      this.scene.resume();
      bus.emit('battle:resume', null);
    });
  }

  // 개발 모드 전용: 보스 패턴 강제 실행
  forceBossPattern(pattern: BossPattern) {
    // 보스가 없으면 먼저 소환 (컷씬 없이)
    if (!this.boss) {
      const t = bossOf(gameState().episode);
      const x = this.hero.x < CX ? arenaBounds.maxX - 40 : arenaBounds.minX + 40;
      this.boss = this.doSummon(t, x, (ARENA.y + SUMMON_Y) / 2);
      gameState().setBossUp(true);
      this.floatText(this.boss.x, this.boss.y - 60, `☠ ${MONSTERS[t].name} (DEV)`, '#ff4444');
    }

    const boss = this.boss;
    // 베르하르트/그림하르트만 지원(사르가스는 거리 기반 랜덤 선택이라 강제 실행할 필요가 적었다)
    if (boss.type !== 'boss_knight' && boss.type !== 'boss_maou') {
      console.warn('[DEV] 현재 보스는 패턴 강제 실행을 지원하지 않습니다:', boss.type);
      return;
    }
    if (boss.type === 'boss_knight' && !['swordbeam', 'knightCharge', 'spaceSlash'].includes(pattern)) {
      console.warn('[DEV] 베르하르트 패턴이 아닙니다:', pattern);
      return;
    }
    if (boss.type === 'boss_maou' && !['energyBall', 'lightRain', 'meteor', 'warp'].includes(pattern)) {
      console.warn('[DEV] 그림하르트 패턴이 아닙니다:', pattern);
      return;
    }

    // 패턴 강제 설정 및 즉시 실행
    boss.bossPattern = pattern;
    boss.bossPhase = 'windup';

    // 윈드업 시간 설정(+ 패턴별 사전 세팅) — 실제 stepBossKnight/stepBossMaou의 cooldown 분기가
    // 하는 일을 그대로 여기서 한 번만 흉내 낸다.
    if (pattern === 'swordbeam') {
      boss.bossT = KNIGHT_SWORDBEAM_WINDUP;
    } else if (pattern === 'knightCharge') {
      boss.bossT = KNIGHT_CHARGE_WINDUP;
      boss.chargeTx = this.hero.x;
      boss.chargeTy = this.hero.y;
    } else if (pattern === 'spaceSlash') {
      boss.bossT = KNIGHT_SPACESLASH_WINDUP;
      boss.channelDamageTaken = 0;
    } else if (pattern === 'energyBall') {
      boss.bossT = MAOU_ENERGYBALL_WINDUP;
    } else if (pattern === 'lightRain') {
      boss.bossT = MAOU_LIGHTRAIN_WINDUP;
      const H = this.hero;
      const points = [{ x: H.x, y: H.y }];
      for (let i = 1; i < MAOU_LIGHTRAIN_COUNT; i++) {
        const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const r = Phaser.Math.Between(MAOU_LIGHTRAIN_SCATTER_MIN, MAOU_LIGHTRAIN_SCATTER_MAX);
        points.push({ x: H.x + Math.cos(ang) * r, y: H.y + Math.sin(ang) * r });
      }
      boss.areaPoints = points;
    } else if (pattern === 'meteor') {
      boss.bossT = MAOU_METEOR_WINDUP;
      boss.channelDamageTaken = 0;
    } else if (pattern === 'warp') {
      boss.bossT = MAOU_WARP_WINDUP;
    }

    // 강제 실행은 stepBossKnight/stepBossMaou의 cooldown→windup 전환 프레임을 건너뛰므로, 그 프레임이
    // 원래 걸었을 텔레그래프 연출(경고 원·낙하 효과·채널링 오라 등)도 여기서 직접 걸어야 한다 — 안 그러면
    // 예고 없이 바로 발동만 보인다(피드백: "dev 모드에서 어디에 떨어질지 안 보인다·낙하 효과도 없다").
    if (pattern === 'spaceSlash') {
      // 공간 가르기는 bossTelegraphFx가 아니라 별도 오라 연출을 쓴다(case 'bossSpaceSlashCharge'와 동일)
      const aura = this.add.circle(boss.x, boss.y, 60, 0x8844ff, 0.3).setDepth(1);
      this.tweens.add({ targets: aura, scale: 1.2, alpha: 0.1, duration: 500, yoyo: true, repeat: -1 });
      this.time.delayedCall(KNIGHT_SPACESLASH_WINDUP * 1000, () => aura.destroy());
    } else if (pattern === 'meteor') {
      // 메테오도 위치가 아니라 채널링-저지형이라 전용 오라를 쓴다(case 'bossMeteorCharge'와 동일)
      this.meteorChannelFx(boss, MAOU_METEOR_WINDUP);
    } else {
      this.bossTelegraphFx(boss, pattern, boss.bossT!, boss.chargeTx, boss.chargeTy, boss.areaPoints);
    }

    this.floatText(boss.x, boss.y - 40, `[DEV] ${pattern}`, '#ffaa44');
  }

  // ── 도네이션: 대박(리듬 미니게임)만 전투를 멈추고 React(DonationEvent)에 넘긴다.
  // 일반 후원은 화면 구석 위젯(알림→룰렛)만 뜨고 전투는 계속 진행된다. 재개는 endDonation. ──
  fireDonation() {
    const { min, max } = upgradeCostRange(gameState().upgradeLevels);
    const rolled = rollDonation(this.viewers);
    const amount = clampDonation(rolled.amount, min, max);
    const jackpot = rolled.jackpot;
    // 단계 판정은 클램프 이후 실제 지급액 기준 — 상하한에 걸린 금액이 곧 플레이어가 보는 금액이다
    const tier = donationTier(amount, min, max, jackpot);
    gameState().addGold(amount);
    this.totalDonated += amount;
    const name = this.randomViewer() ?? '익명';
    const msg = `${name}님 ${amount.toLocaleString()}G${jackpot ? ' 대박 후원!!' : '!'}`;
    this.pushChat('🎁 후원', msg, jackpot ? '#ff66cc' : '#ffdd44');
    this.pendingSkill = null;
    // 대박 시 전투를 멈추는 로직은 donation:arrive 리스너(create()) 쪽에 있다 — 이 emit이 그걸 트리거한다.
    bus.emit('donation:arrive', { amount, donor: name, jackpot, tier, message: pickDonationMessage() });
  }

  // 카드 확정 → 강화 적용. 전투 재개는 이미 rhythm:result 시점에 끝났다(카드 룰렛은 화면을 안 덮으니
  // 안 멈춰도 된다) — 여기선 카드/특성 지급과 예약된 스킬(resolveRhythmResult) 발동만 담당한다.
  // card === null: 리듬 완전 실패(penalty) — 보상 없이 페널티만(아래 resolveRhythmResult가 처리) 적용한다.
  endDonation(card: Card | null) {
    if (card) {
      if (card.trait) {
        // 특성 카드는 스탯이 아니라 전투 규칙을 준다 — grantCard/applyLiveCard 경로를 안 탄다
        gameState().grantTrait(card.trait);
        const t = TRAITS[card.trait];
        playSfx('trait');
        this.cameras.main.flash(400, 255, 120, 220);
        this.floatText(this.hero.x, this.hero.y - 40, `${t.icon} ${t.name} 각성!`, '#ff66cc');
        this.pushChat('시스템', `🎁 특성 획득 — ${t.icon} ${t.name}: ${t.desc}`, '#ff66cc');
      } else if (card.summonCurse) {
        // 나쁜 카드: 스탯은 안 건드리고 즉시 몬스터를 기습 소환한다 — MAX_ALIVE 꽉 찼으면
        // summonRandom이 그냥 무시하니 별도 방어 불필요.
        const s = SUMMON_CURSES[card.summonCurse];
        for (let i = 0; i < s.count; i++) this.summonRandom(Phaser.Utils.Array.GetRandom(s.pool));
        playSfx('heroHurt'); // 보상이 아니라 사고다 — 카드 획득음(card)이 울리면 정반대로 읽힌다
        this.shakeCam(300, 0.008);
        this.floatText(this.hero.x, this.hero.y - 40, `${s.icon} ${s.name}!`, '#ff5555');
        this.pushChat('시스템', `💀 ${s.name} — ${s.desc}`, '#ff5555');
      } else {
        gameState().grantCard(card);
        playSfx(card.curse ? 'heroHurt' : 'card'); // 저하형 카드(curse)도 강화음이 울리면 안 된다
        this.applyLiveCard(card, card.curse ? `💀 저주받은 카드...` : `🎁 ${RARITY[card.rarity].label} 카드!`);
      }
      this.onCardGranted(card);
    }
    if (this.pendingSkill) {
      this.resolveRhythmResult(this.pendingSkill);
      this.pendingSkill = null;
    }
  }

  // ESC 일시정지: 도네이션/보스 컷씬과 같은 scene.pause()라 실제로 전투 루프가 멈춘다.
  // 이미 다른 이유로 멈춰 있을 때 이 경로를 타지 않게 하는 건 PauseOverlay(React) 쪽 책임이다.
  toggleUserPause() {
    if (this.scene.isPaused()) {
      this.scene.resume();
      bus.emit('battle:resume', null);
    } else {
      this.scene.pause();
      bus.emit('battle:pause', null);
    }
  }

  // 카드 획득 공통 후처리: 전투의 함성(카드 획득마다 전체 기절) + 일부 특성의 1회성 즉시 효과.
  onCardGranted(card: Card) {
    if (hasTrait(gameState().traits, 'warCry') && this.monsters.length) {
      for (const m of this.monsters) if (!m.dead) applyStun(m, WAR_CRY_STUN);
      this.floatText(this.hero.x, this.hero.y - 70, '📢 전투의 함성!', '#ffaa33');
    }
    if (card.trait === 'giantBlade' || card.trait === 'excalibur') this.applyTraitOneShot(card.trait);
  }

  // 거인의 대검·엑스칼리버: 특성 자체는 상시 배율(heroAtkMult)로 처리하지만, 습득 즉시 붙는
  // 공속/사거리 변화는 매 프레임 재계산할 게 아니라 이 시점에 한 번만 스탯에 반영해야 한다.
  applyTraitOneShot(id: 'giantBlade' | 'excalibur') {
    const stats = gameState().hero;
    const mods: StatMod[] =
      id === 'giantBlade'
        ? [
            { stat: 'atkSpd', mode: 'pctCurrent', value: GIANT_BLADE_ATKSPD_MULT - 1 },
            { stat: 'range', mode: 'pctCurrent', value: GIANT_BLADE_RANGE_MULT - 1 },
          ]
        : [{ stat: 'range', mode: 'flat', value: ARENA.w / 2 - stats.range }]; // 화면 절반을 목표로 요청 — store가 RANGE_CAP으로 자른다
    gameState().applyStatMods(mods);
    const H = this.hero;
    const applied = gameState().hero;
    for (const stat of new Set(mods.map((m) => m.stat))) H[stat] = applied[stat];
  }

  // ── 리듬 보상: 시청자 변화율 (+ ALL PERFECT 추가 후원) — GDD 3-4, 2026-07-28 개편.
  // 2026-08-07: 스킬은 무조건 상점(UpgradeView.learn, SKILL_COST)에서만 산다 — 예전엔 이 리듬 결과가
  // 신규 스킬을 공짜로 지급하기도 했는데, 전투 중 아무 예고 없이 스킬이 생기는 게 "갑자기 활성화된다"는
  // 피드백을 받아 뺐다. res.rarity는 skillResult가 여전히 채워 주지만(formulas.test.ts가 그 등급 산정
  // 로직을 검증) 이 씬에선 더 이상 쓰지 않는다.
  resolveRhythmResult(res: SkillOutcome) {
    if (res.penalty) {
      this.viewers = Math.max(MIN_VIEWERS, this.viewers * res.viewerMult);
      this.pushChat('시스템', '스킬 불발... 시청자가 실망했다', '#ff6666');
      return;
    }
    this.viewers *= res.viewerMult;
    const parts = [`시청자 +${Math.round((res.viewerMult - 1) * 100)}%`];

    if (res.bonusDonation) {
      const { min, max } = upgradeCostRange(gameState().upgradeLevels);
      const amount = clampDonation(rollDonation(this.viewers).amount, min, max);
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

  // ── 도네 카드 반영: store는 이미 갱신됨(grantCard) — 씬 로컬 hero에 mods가 건드린 필드만 동기화 + 연출.
  // curse(저하형 카드)는 색만 cyan→red, 화살표만 ▲→▼로 바꿔 "나쁜 카드"임을 전투 화면에서도 구분한다 ──
  applyLiveCard(card: Card, via: string) {
    const H = this.hero;
    const stats = gameState().hero;
    for (const stat of new Set(card.mods.map((m) => m.stat))) {
      if (stat === 'maxHp') {
        const inc = stats.maxHp - H.maxHp;
        H.maxHp = stats.maxHp;
        H.hp = Math.min(H.maxHp, H.hp + inc); // 최대치 증가분만큼 즉시 회복(감소분이면 즉시 손실)
      } else {
        H[stat] = stats[stat];
      }
    }
    // 임팩트: 확산 링 + 상승/하강 숫자
    const color = card.curse ? 0xff4444 : 0x44ddff;
    const hex = card.curse ? '#ff5555' : '#44ddff';
    const ring = this.add.circle(H.x, H.y, 20, color, 0).setStrokeStyle(3, color, 1).setDepth(9);
    this.tweens.add({ targets: ring, radius: 60, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
    this.heroSpr.setTint(card.curse ? 0xff9999 : 0x88ffff);
    this.time.delayedCall(200, () => this.heroSpr.clearTint());
    this.floatText(H.x, H.y - 40, `${card.curse ? '▼' : '▲'} ${card.name}`, hex);
    this.pushChat('시스템', `${via} ${card.name} — ${card.desc}`, hex);
  }

  // 스킬이 쓰는 좁은 표면. 씬 헬퍼를 SkillContext로 감싸 skills.ts가 BattleScene에 의존하지 않게 한다.
  skillContext(): SkillContext {
    return {
      hero: this.hero,
      monsters: this.monsters,
      hit: (m, dmg) => this.hitFx(m, dmg),
      fxCircle: (x, y, r, kind) => (kind === 'fire' ? this.fireSlashFx(x, y, r) : this.skillStrikeFx(x, y, r)),
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
    this.impactFx(m.x, m.y, 14);
  }

  // 칼에 맞았을 때의 히트 스파크 — 작게 튀어나왔다 빠르게 사그라드는 흰 스파크 한 번으로 단순화했다
  // (뇌전 등 다른 이펙트와 겹쳐도 이건 늘 "칼에 맞았다"로 읽히게, 화려한 잔상 없이 짧고 굵게).
  // 스스로 페이드아웃 후 파괴한다 — fireSkill 한 곳에서만 뒤늦게 청소하면 castSkill(직접 시전) 등
  // 그 경로를 안 타는 곳에서 안 지워지고 쌓이는 버그(#6)가 났었다.
  impactFx(x: number, y: number, r: number) {
    const c = this.add.circle(x, y, r * 0.5, 0xffffff, 0.95).setDepth(3);
    this.tweens.add({
      targets: c,
      radius: r,
      alpha: 0,
      duration: 140,
      ease: 'Cubic.Out',
      onComplete: () => c.destroy(),
    });
  }

  // 스킬 착탄 지점 연출(SkillContext.fxCircle — 낙뢰 등) — 칼 스파크(impactFx)와 같은 걸 쓰면
  // "뭔가 떨어졌다"가 아니라 그냥 또 한 번 베인 것처럼 보였다. 커지는 원 두 겹은 과했다(2026-08-04
  // 1차 수정) — 위에서 지그재그로 내리꽂히는 번개 줄기 + 착지 스파크로 단순화해 전기 느낌을 낸다.
  skillStrikeFx(x: number, y: number, r: number) {
    const topY = y - 160;
    const bolt = this.add.graphics().setDepth(4);
    bolt.lineStyle(3, 0xddf6ff, 0.95);
    bolt.beginPath();
    bolt.moveTo(x, topY);
    bolt.lineTo(x + (Math.random() - 0.5) * 24, topY + (y - topY) * 0.5);
    bolt.lineTo(x, y);
    bolt.strokePath();
    this.tweens.add({ targets: bolt, alpha: 0, duration: 160, onComplete: () => bolt.destroy() });
    const spark = this.add.circle(x, y, r * 0.3, 0xddf6ff, 0.95).setDepth(4);
    this.tweens.add({
      targets: spark,
      radius: r * 0.7,
      alpha: 0,
      duration: 200,
      ease: 'Cubic.Out',
      onComplete: () => spark.destroy(),
    });
  }

  // 화염폭발 착탄 연출 — 용사를 중심으로 화염색 충격파가 반경 전체로 퍼진다. 뇌전(청록/번개 줄기)과는
  // 색과 모양 둘 다 다르게 해서 스킬끼리도 한눈에 구분되게 한다.
  // 2026-08-04 2차 수정: Graphics.circle은 테두리가 딱딱해 "빛나는 에너지"가 아니라 그냥 도형처럼
  // 보였다 — GLOW_TEXTURE/RING_GLOW_TEXTURE(캔버스 radial gradient) + ADD 블렌드로 겹쳐 쌓아
  // 실제로 빛이 번지는 느낌을 내고, 화면 전체를 덮는 카메라 flash 없이도(noScreenFlash) 존재감을
  // 대신하도록 코어 플래시 + 이중 링 + 튀는 불씨로 구성했다.
  fireSlashFx(x: number, y: number, r: number) {
    const scaleFor = (px: number) => (px * 2) / 256; // 글로우 텍스처 지름 256px 기준 스케일 환산

    const core = this.add
      .image(x, y, GLOW_TEXTURE)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffcc66)
      .setScale(scaleFor(r * 0.4))
      .setDepth(4);
    this.tweens.add({
      targets: core,
      scale: scaleFor(r * 0.95),
      alpha: 0,
      duration: 300,
      ease: 'Cubic.Out',
      onComplete: () => core.destroy(),
    });

    // 두 겹을 살짝 시차를 두고 퍼뜨려 "두께감 있는 충격파"처럼 보이게 한다.
    for (let i = 0; i < 2; i++) {
      const ring = this.add
        .image(x, y, RING_GLOW_TEXTURE)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xff4411)
        .setAlpha(0.95)
        .setScale(scaleFor(r * 0.5))
        .setDepth(4);
      this.tweens.add({
        targets: ring,
        scale: scaleFor(r * 1.35),
        alpha: 0,
        delay: i * 70,
        duration: 420 + i * 100,
        ease: 'Cubic.Out',
        onComplete: () => ring.destroy(),
      });
    }

    // 튀는 불씨 6개 — 중심에서 사방으로 흩어지며 사그라든다.
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
      const dist = r * (0.6 + Math.random() * 0.3);
      const ember = this.add
        .image(x, y, GLOW_TEXTURE)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffaa33)
        .setScale(scaleFor(16))
        .setDepth(4);
      this.tweens.add({
        targets: ember,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        scale: scaleFor(4),
        alpha: 0,
        duration: 350 + Math.random() * 150,
        ease: 'Cubic.Out',
        onComplete: () => ember.destroy(),
      });
    }
  }

  // 칼 궤적 — angle(rad) 방향 호가 훑고 지나간다. impactFx와 같은 자기 청소 규칙.
  // 판정은 반경 r 반원인데 시트 프레임(64px) 안에 여백이 있어 그대로 r*2를 주면 작아 보인다.
  // 심플하게 정리(2026-08-04): 배율 3→2, 알파를 살짝 낮추고 페이드아웃을 얹어 잔상이 덜 튄다.
  // ponytail: 눈으로 맞추는 배율 knob — 판정보다 커 보이면 줄인다
  static readonly FX_BASH_SCALE = 2;

  swingFx(x: number, y: number, r: number, angle: number) {
    // 용사 중앙에서 시작해 사거리를 덮는다. 초승달이 대상 쪽으로 볼록해야 베는 것처럼 보이는데
    // 시트 원본은 볼록한 쪽이 -x라 π를 더한다.
    const s = this.add
      .sprite(x, y, FX_BASH)
      .setDepth(4)
      .setAlpha(0.75)
      .setRotation(angle + Math.PI)
      .setDisplaySize(r * BattleScene.FX_BASH_SCALE, r * BattleScene.FX_BASH_SCALE)
      .play(FX_BASH);
    this.tweens.add({ targets: s, alpha: 0, delay: 120, duration: 120 });
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, (_a: unknown, _f: unknown, spr: Phaser.GameObjects.Sprite) =>
      spr.destroy(),
    );
  }

  // silent = 도트(화상/출혈) 틱 전용 — 매 프레임 발생해 콤보에 끼면 실력 지표가 왜곡되고,
  // 데미지 숫자도 프레임마다 스팸이 된다(아래 damageText도 같이 건너뛴다).
  damageMonster(m: MonsterEntity, dmg: number, silent = false) {
    // 방어력(바위 거북)은 실타격에만 먹인다. 도트에 걸면 armorReduce의 최소 피해(ARMOR_MIN_DMG)가
    // 프레임마다 적용돼 오히려 도트가 세지는 역전이 난다 — 틱 피해는 원래도 소수점이라 감산이 무의미하다.
    if (!silent) dmg = armorReduce(dmg, m.def.armor);
    m.hp -= dmg;
    // 채널링-저지형 패턴(베르하르트 공간 가르기 · 그림하르트 메테오) 중이면 데미지 추적
    if ((m.bossPattern === 'spaceSlash' || m.bossPattern === 'meteor') && m.bossPhase === 'windup') {
      m.channelDamageTaken = (m.channelDamageTaken ?? 0) + dmg;
    }
    if (!silent) this.damageText(m.x, m.y - 20, dmg);
    m.spr.setAlpha(0.5);
    this.time.delayedCall(80, () => {
      if (m.spr.active) m.spr.setAlpha(1);
    });
    // 2026-07-30: 처치가 아니라 타격마다 쌓이도록 변경 — 명중 자체가 실력 지표라는 판단.
    if (!silent) {
      bumpCombo(this);
      bus.emit('combo:hit', { combo: this.combo });
    }
    if (m.hp <= 0 && !m.dead) {
      m.dead = true;
      // 보스는 잡몹 처치음에 묻히면 안 된다 — 격파 자체가 스테이지의 결말이라 따로 운다
      // (뒤이어 endRun이 800ms 후 stageClear를 얹는다).
      playSfx(m === this.boss ? 'bossDown' : 'kill');
      const gold = goldWithBonus(m.def.gold, gameState().hero.goldBonus);
      gameState().addGold(gold);
      this.killGold += gold;
      this.kills++;
      const H = this.hero;
      H.hp = Math.min(H.maxHp, H.hp + warriorBloodHeal(gameState().traits, H.maxHp));
      this.splitProc(m); // 분열 슬라임 — 죽어야 진짜 물량이 나온다
      m.spr.destroy();
    }
  }

  pushChat(who: string, msg: string, color = '#cccccc') {
    bus.emit('chat:line', { who, msg, color });
  }

  randomViewer(): string | null {
    return this.audience.length ? Phaser.Utils.Array.GetRandom(this.audience) : null;
  }

  // 카메라 흔들림의 유일한 출입구. 옵션(설정 → 화면 흔들림)을 끈 플레이어에겐 아무 일도 없어야 하는데,
  // 호출부가 다섯 군데라 각자 검사하면 새 연출을 넣을 때마다 빠뜨린다.
  shakeCam(duration: number, intensity: number) {
    if (gameState().screenShake) this.cameras.main.shake(duration, intensity);
  }

  floatText(x: number, y: number, msg: string, color: string) {
    const t = this.add.text(x, y, msg, { fontSize: '16px', fontStyle: 'bold', color }).setOrigin(0.5).setDepth(9);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  // 피격 대미지 숫자 — 몬스터 머리 위로 살짝 떠오르며 사라진다. x를 살짝 흔들어 스윙 한 번에
  // 여러 마리(또는 뇌전 전이)가 동시에 맞아도 숫자끼리 완전히 겹치지 않게 한다.
  damageText(x: number, y: number, dmg: number) {
    const t = this.add
      .text(x + Phaser.Math.Between(-6, 6), y, Math.round(dmg).toString(), {
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(9);
    this.tweens.add({ targets: t, y: y - 26, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  // ── 메인 루프 ──
  update(_: number, deltaMs: number) {
    if (this.over) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    const H = this.hero;

    if (this.boss) {
      if (this.boss.dead) return this.endRun('clear');
    } else if (this.isFinal || this.stageGold >= this.target) {
      // 최종화는 골드 모으기 단계 없이 입장 즉시 마왕전 (create()가 아니라 첫 update에서 — spawnBoss가
      // scene.pause()를 걸어서 create가 끝난 뒤여야 한다)
      this.spawnBoss();
    }

    const near = countNear(this.monsters, H); // updateHero(회복 판정)가 여전히 쓴다 — danger()는 이제 HP만 본다
    // this는 { viewers, peakViewers, drift } 필드를 가져 ViewerState로 그대로 넘긴다.
    const step = stepViewers(this, H.hp / H.maxHp, dt, viewerCap(gameState().episode));
    this.D = step.D;
    this.tier = step.tier;
    this.updateRequest(dt); // 위기 판정 전 — 요청 보상이 그 프레임의 시청자 수에 바로 반영된다
    this.updateCritical(dt);
    if (this.over) return;

    if (!this.isFinal && !this.bossActive()) {
      // 최종화는 도네이션 금지 (GDD 7장, 2026-07-28 정정) — 보스전도 같은 이유(2026-08-07): 보스전엔
      // 순수 실력전이어야 하니 중간에 카드/버프가 끼어들면 안 된다.
      this.donateT -= dt;
      if (this.donateT <= 0) {
        this.fireDonation();
        // FULL 콤보 중 터진 도네이션은 다음 간격을 살짝 당겨준다 (체감 미미한 보상)
        const cut = this.combo >= COMBO_FULL ? COMBO_DONATION_CUT : 0;
        this.donateT = donationInterval(this.viewers) - cut;
      }
    }

    // 웨이브 자동 투입 — 보스전·최종화엔 안 돈다(소환이 통째로 막히는 구간이라 spawnWave도 자체 가드).
    // this는 { waveT } 필드를 가져 WaveTimer로 그대로 넘긴다 (stepCritical과 같은 관용구).
    if (!this.isFinal && !this.bossActive() && stepWave(this, dt)) this.spawnWave();

    for (const id of Object.keys(this.skillCd) as SkillId[]) this.skillCd[id] = Math.max(0, this.skillCd[id]! - dt);
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

    // React InfoLayer — 씬 전용(store에 없는) 실시간 값만 스로틀로 쏜다. viewers/gold는 store가 이미 커버.
    this.hudSyncT -= dt;
    if (this.hudSyncT <= 0) {
      bus.emit('hud:tick', {
        D: this.D,
        tierLabel: this.tier.label,
        tierColor: this.tier.color,
        alert: this.alert,
        critical: this.critical,
        critT: this.critT,
        boss: this.boss ? { name: this.boss.def.name, hp: Math.max(0, this.boss.hp), maxHp: this.boss.def.hp } : null,
        stageGold: this.stageGold,
        target: this.target,
        req: this.req ? { label: this.req.label, pct: this.reqPct, t: Math.max(0, this.req.t) } : null,
        // 보스전·최종화엔 웨이브가 안 돌므로 null — SummonPanel이 웨이브 칸을 통째로 숨긴다
        wave:
          this.isFinal || this.bossActive()
            ? null
            : {
                index: this.waveIndex,
                t: Math.max(0, this.waveT),
                next: waveAt(this.lineup, this.waveIndex),
              },
        skillCd: this.skillCd,
        dashCd: this.hero.dashCd,
      });
      this.hudSyncT = 0.1;
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
  // critical(1명)에서만. React InfoLayer의 info-alert-vignette가 hud:tick의 alert로 색/알파를 그린다.
  syncAlert() {
    const next = viewerAlert(this.viewers, this.critical);
    if (next === this.alert) return;
    this.alert = next;
    this.cameras.main.shakeEffect.reset();
    if (next === 'warn') {
      this.pushChat('시스템', '시청자가 빠지고 있다...', '#ff9933');
    } else if (next === 'critical') {
      this.shakeCam(SHAKE_HOLD, 0.006);
    }
  }

  // WASD 입력 벡터 — 상시 수동 조작이라 항상 값을 만든다(자동 AI 없음).
  heroInput(): HeroInput {
    const k = this.keys;
    return {
      dx: (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0),
      dy: (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0),
      dash: k.SHIFT.isDown,
    };
  }

  // 용사 피격 단일 진입점 — 무적(대시/피격 직후)·회피·방어 판정을 한 곳에 모은다. 근접·화살 양쪽이 여기로 온다.
  // 반환값 = 실제로 맞았는가 (반격 특성이 이걸 보고 반사한다).
  hurtHero(rawDmg: number): boolean {
    const H = this.hero;
    if (H.invulnT > 0) return false;
    const traits = gameState().traits;
    if (rollChance(H.dodge)) {
      playSfx('dodge');
      this.floatText(H.x, H.y - 50, 'MISS', '#88ccff');
      return false;
    }
    const defense = clamp(H.defense + defenseBonus(traits, H.hp / H.maxHp), 0, 100);
    H.hp -= mitigate(rawDmg, defense);
    playSfx('heroHurt');
    H.invulnT = HIT_INVULN_DUR; // 같은 프레임에 몬스터 여럿이 때려도 한 번만 맞는다
    this.noHitT = 0;
    if (this.combo > 0) {
      this.combo = 0;
      this.comboT = 0;
      bus.emit('combo:reset', null); // 콤보 = 무피격 실력 지표라 맞는 순간 끊긴다
    }
    if (hasTrait(traits, 'furyBlast')) this.furyBlastProc();
    if (rollChance(H.knockback)) this.knockbackProc();
    if (H.hp <= 0 && hasTrait(traits, 'phoenixFeather') && !H.phoenixUsed) this.phoenixProc();
    return true;
  }

  // 폭발적인 분노: 피격 시 주변 적 전체에게 공격력의 FURY_BLAST_RATIO배 피해
  furyBlastProc() {
    const H = this.hero;
    const dmg = H.atk * FURY_BLAST_RATIO;
    for (const m of this.monsters) {
      if (!m.dead && Phaser.Math.Distance.Between(m.x, m.y, H.x, H.y) <= FURY_BLAST_RADIUS) this.hitFx(m, dmg);
    }
    this.impactFx(H.x, H.y, FURY_BLAST_RADIUS);
  }

  // 방패 밀치기: 피격 시 확률로 주변 몬스터를 밀쳐낸다
  knockbackProc() {
    const H = this.hero;
    for (const m of this.monsters) {
      if (m.dead) continue;
      const d = Phaser.Math.Distance.Between(m.x, m.y, H.x, H.y);
      if (d > 0 && d < KNOCKBACK_RADIUS) {
        m.x += ((m.x - H.x) / d) * KNOCKBACK_DIST;
        m.y += ((m.y - H.y) / d) * KNOCKBACK_DIST;
        m.spr.setPosition(m.x, m.y);
      }
    }
    this.floatText(H.x, H.y - 50, '💫 밀쳐내기!', '#ffaa66');
  }

  // 공격 적중 넉백: 매 타격마다 살짝 밀어낸다. 거리는 몬스터별 kb 배율(monsters.ts)로 갈린다 —
  // 슬라임처럼 가벼운 몬스터는 많이, 골렘/미니보스는 조금, 보스(kb: 0)는 전혀 밀리지 않는다.
  // 즉시 순간이동시키지 않고 kbT/kbVx/kbVy로 속도를 실어 stepMonster가 몇 프레임에 걸쳐
  // 밀어내게 한다 — 그래야 한 프레임짜리 점프가 아니라 눈에 보이는 슬라이드가 된다.
  attackKnockback(m: MonsterEntity) {
    const kb = m.def.kb ?? 1;
    if (kb <= 0 || m.dead) return;
    const H = this.hero;
    const d = Phaser.Math.Distance.Between(m.x, m.y, H.x, H.y);
    if (d <= 0) return;
    const speed = (HIT_KNOCKBACK_DIST * kb) / HIT_KNOCKBACK_DUR;
    m.kbT = HIT_KNOCKBACK_DUR;
    m.kbVx = ((m.x - H.x) / d) * speed;
    m.kbVy = ((m.y - H.y) / d) * speed;
  }

  // 불사조의 깃털: 치명적인 피해를 받으면 이번 런 1회, 체력 50%로 부활 + 전체 화상
  phoenixProc() {
    const H = this.hero;
    H.phoenixUsed = true;
    H.hp = H.maxHp * PHOENIX_HP_RATIO;
    for (const m of this.monsters) if (!m.dead) applyDot(m, H.atk * PHOENIX_BURN_DPS_RATIO, PHOENIX_BURN_T);
    this.cameras.main.flash(500, 255, 140, 40);
    this.floatText(H.x, H.y - 60, '🪶 불사조의 깃털!', '#ffaa33');
    this.pushChat('시스템', '🪶 불사조의 깃털 발동 — 부활!', '#ffaa33');
  }

  // 용사가 이번에 넣는 피해 — 광전사/거인의 대검/엑스칼리버(heroAtkMult)·시공간 베기 발동 창이 여기서 곱해지고,
  // 거합도(첫 공격 필중 치명타) 또는 치명타 확률 롤 결과에 따라 치명타 배율까지 확정한다.
  heroDamage(): { dmg: number; crit: boolean } {
    const H = this.hero;
    const traits = gameState().traits;
    const base = H.atk * heroAtkMult(traits, H.hp / H.maxHp) * timeSlashMult(H);
    const forceCrit = hasTrait(traits, 'iaido') && !H.firstAtkDone;
    const crit = forceCrit || rollChance(H.critChance);
    if (!H.firstAtkDone) H.firstAtkDone = true;
    return { dmg: crit ? base * critMultiplier(H.critMult) : base, crit };
  }

  // 공격 1회가 대상 1명에게 적중 — 묵직한 강타/빙결의 일격/가시 돋친 검/화염검/뇌전 방출/그림자 분신이 여기서 갈린다.
  heroHit(m: MonsterEntity, dmg: number, crit: boolean) {
    const traits = gameState().traits;
    const H = this.hero;
    let total = dmg;
    if (hasTrait(traits, 'heavyStrike') && H.atkCount % HEAVY_STRIKE_EVERY === 0) {
      total *= HEAVY_STRIKE_MULT;
      applyStun(m, HEAVY_STRIKE_STUN);
    }
    this.hitFx(m, total);
    this.attackKnockback(m);
    // 흡혈(카드 lifesteal)은 여기서 안 준다 — 스윙당 한 번만(아래 updateHero) 적용해야 한다.
    // 예전엔 대상마다 여기서 흡혈해 사거리↑ → 동시 타격 수↑ → 흡혈량↑로 무한 증식했다(#피드백:
    // "사거리 늘어나면 사기". vamp 특성도 원래부터 광역과 무관하게 1회분만 준다 — 카드 쪽도 그 규칙에 맞춘다).
    if (crit && hasTrait(traits, 'frostStrike')) applyStun(m, m.def.tint ? FROST_STRIKE_BOSS_STUN : FROST_STRIKE_STUN);
    if (hasTrait(traits, 'thornBlade') && rollChance(THORN_BLADE_CHANCE * 100)) {
      applyDot(m, H.atk * THORN_BLADE_DPS_RATIO, THORN_BLADE_DOT_T);
    }
    if (hasTrait(traits, 'flameSword')) {
      applyDot(
        m,
        H.atk * FLAME_SWORD_DPS_RATIO,
        FLAME_SWORD_DOT_T,
        H.atk * FLAME_SWORD_DPS_RATIO * FLAME_SWORD_MAX_STACK,
      );
    }
    if (hasTrait(traits, 'chainLightning') && rollChance(CHAIN_LIGHTNING_CHANCE * 100)) this.chainLightningProc(m, dmg);
    if (hasTrait(traits, 'shadowClone') && rollChance(SHADOW_CLONE_CHANCE * 100)) this.hitFx(m, dmg);
  }

  // 뇌전 방출: 적중 대상 주변 가장 가까운 몬스터들에게 전이 피해.
  // hitFx(칼 스파크)를 그대로 재사용하면 "칼에 또 맞은 것"처럼 겹쳐 보여 구분이 안 됐다 —
  // 대미지 적용(damageMonster)은 그대로 쓰되 연출은 lightningFx(전선 + 스파크)로 따로 그린다.
  chainLightningProc(origin: MonsterEntity, dmg: number) {
    const targets = this.monsters
      .filter((x) => x !== origin && !x.dead)
      .sort(
        (a, b) =>
          Phaser.Math.Distance.Between(a.x, a.y, origin.x, origin.y) -
          Phaser.Math.Distance.Between(b.x, b.y, origin.x, origin.y),
      )
      .slice(0, CHAIN_LIGHTNING_TARGETS);
    for (const t of targets) {
      this.damageMonster(t, dmg * CHAIN_LIGHTNING_RATIO);
      this.lightningFx(origin.x, origin.y, t.x, t.y);
    }
  }

  // 뇌전 전용 연출 — 두 점 사이에 한 번 꺾인 전선을 그리고, 도착점에 옅은 청색 스파크를 남긴다.
  // impactFx(흰색, 칼 스파크)와 색·모양을 다르게 해서 "이건 전기 피해"라고 한눈에 구분되게 한다.
  lightningFx(x1: number, y1: number, x2: number, y2: number) {
    const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * 24;
    const my = (y1 + y2) / 2 + (Math.random() - 0.5) * 24;
    const g = this.add.graphics().setDepth(4);
    g.lineStyle(2.5, 0x66ddff, 0.9).beginPath().moveTo(x1, y1).lineTo(mx, my).lineTo(x2, y2).strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 140, onComplete: () => g.destroy() });
    const spark = this.add.circle(x2, y2, 8, 0x66ddff, 0.9).setDepth(4);
    this.tweens.add({ targets: spark, radius: 14, alpha: 0, duration: 160, onComplete: () => spark.destroy() });
  }

  // 바람 가르기: 공격이 발동하면(사거리 안 명중 여부와 무관) 사거리 밖 가장 가까운 적에게도 피해
  windSlashProc(dmg: number) {
    if (!hasTrait(gameState().traits, 'windSlash')) return;
    const H = this.hero;
    let target: MonsterEntity | null = null,
      best = Infinity;
    for (const m of this.monsters) {
      if (m.dead) continue;
      const d = Phaser.Math.Distance.Between(m.x, m.y, H.x, H.y);
      if (d > H.range && d < best) {
        best = d;
        target = m;
      }
    }
    if (target) this.hitFx(target, dmg * WIND_SLASH_DMG_RATIO);
  }

  updateHero(dt: number, nearCount: number) {
    const H = this.hero;
    const traits = gameState().traits;
    // 결정 로직은 battleSim.stepHero(순수). 씬은 결과를 스프라이트에 반영 + 공격만 처리.
    // 대시 발동은 intent에 안 실린다(순수 시뮬은 소리를 모른다) — 쿨타임이 줄기만 하다가 이번
    // 프레임에 되레 늘었다면 그게 곧 "방금 대시했다"다.
    const dashCdBefore = H.dashCd;
    const intent = stepHero(H, this.monsters, nearCount, dt, arenaBounds, this.heroInput(), traits);
    if (H.dashCd > dashCdBefore) playSfx('dash');
    if (intent.swung) {
      playSfx('hit'); // 스윙 단위 — 광역으로 열 마리를 동시에 베어도 칼 소리는 한 번이다
      const { dmg, crit } = this.heroDamage();
      for (const m of intent.attacks) this.heroHit(m, dmg, crit);
      this.windSlashProc(dmg); // 사거리 밖 추가 타격 — 스윙당 1회, 명중 대상 유무와 무관
      // 시공간 베기: N번째 공격마다 시간 정지 + 그 동안 가한 피해 증폭(timeSlashMult가 다음 타격부터 적용)
      if (hasTrait(traits, 'timeSlash') && H.atkCount % TIME_SLASH_EVERY === 0) {
        H.timeSlashT = TIME_SLASH_FREEZE_MS / 1000;
        this.freezeUntil = this.time.now + TIME_SLASH_FREEZE_MS;
        this.cameras.main.flash(300, 200, 220, 255);
        this.floatText(H.x, H.y - 60, '⏳ 시공간 베기!', '#88ddff');
      }
      // 참격 축은 시뮬이 정한 값 하나 — 씬이 대상 좌표로 각도를 다시 구하면 판정과 연출이 어긋난다.
      if (intent.swingAngle !== null) {
        this.swingFx(H.x, H.y, H.range, intent.swingAngle);
        // 공격 모션도 같은 축을 본다 — 궤적과 스프라이트가 따로 놀면 타격감이 어긋난다
        const [dir, flip] = dirOf(facingOf(Math.cos(intent.swingAngle), Math.sin(intent.swingAngle)) ?? this.facingDir);
        this.facingDir = dir;
        this.heroSpr.setFlipX(flip);
        playOnce(this.heroSpr, HERO_CHAR, 'attack', dir);
      }
      // CRIT 표시는 최근접 피격 대상 위에
      if (crit && intent.attacks.length) {
        const lead = intent.attacks.reduce((a, b) =>
          Phaser.Math.Distance.Between(b.x, b.y, H.x, H.y) < Phaser.Math.Distance.Between(a.x, a.y, H.x, H.y) ? b : a,
        );
        this.floatText(lead.x, lead.y - 24, 'CRIT!', '#ff4444');
      }
      H.hp = Math.min(H.maxHp, H.hp + vampHeal(traits, dmg)); // 흡혈(특성) — 광역이어도 1회분
      // 흡혈(카드 lifesteal) — 특성 흡혈과 같은 규칙: 명중 대상 수와 무관하게 스윙당 1회, 단일 타격 기준 피해로만 계산
      if (H.lifesteal > 0) H.hp = Math.min(H.maxHp, H.hp + dmg * (H.lifesteal / 100));
    }
    this.heroSpr.setPosition(H.x, H.y);
    this.heroSpr.setAlpha(H.invulnT > 0 ? 0.5 : 1); // 대시 무적을 눈에 보이게
    if (intent.facing) {
      const [dir, flip] = dirOf(intent.facing);
      this.facingDir = dir;
      this.heroSpr.setFlipX(flip);
      playAnim(this.heroSpr, HERO_CHAR, 'walk', dir);
    } else {
      playAnim(this.heroSpr, HERO_CHAR, 'idle', this.facingDir); // 대기 모션이 없는 방향은 걷기 0번 프레임
    }

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

  // 몬스터가 보는 4방향을 스프라이트에 반영하고, 애니메이션이 쓰는 3방향 키를 돌려준다.
  // (서쪽 = 동쪽 프레임 + flipX — 아트가 3방향뿐이라 씬이 매번 이 매핑을 해준다.)
  faceMonster(m: MonsterEntity, facing: Facing): Dir {
    const [dir, flip] = dirOf(facing);
    m.spr.setFlipX(flip);
    return dir;
  }

  updateMonsters(dt: number) {
    const H = this.hero;
    this.monsters = this.monsters.filter((m) => !m.dead);
    if (this.time.now < this.freezeUntil) return; // 시간 정지 — 도트도 같이 멈춘다(시공간 베기 연출 일관성)
    applyAuras(this.monsters); // 주술사 오라 — AI가 배율을 읽기 전에 매 프레임 다시 칠한다
    for (const m of this.monsters) {
      // 화상/출혈 도트 — 콤보에 안 끼게 silent로 처리
      if (m.dotT && m.dotT > 0) {
        m.dotT -= dt;
        this.damageMonster(m, (m.dotDps ?? 0) * dt, true);
        if (m.dotT <= 0) m.dotDps = 0;
        if (m.dead) continue; // 도트로 죽었으면 이번 프레임 AI는 스킵
      }
      // 보스들은 전용 AI 사용
      const intent =
        m.type === 'boss_golem'
          ? stepBossGolem(m, H, dt, Math.random, arenaBounds) // 돌진이 맵 끝에 처박히는 판정을 위해 경계를 넘긴다
          : m.type === 'boss_knight'
            ? stepBossKnight(m, H, dt)
            : m.type === 'boss_maou'
              ? stepBossMaou(m, H, dt)
              : stepMonster(m, H, dt);
      const dir = this.faceMonster(m, intent.facing);
      switch (intent.kind) {
        case 'move': {
          m.spr.setPosition(m.x, m.y);
          playAnim(m.spr, m.char, 'walk', dir); // char 없으면(=대체 상자) no-op
          break;
        }
        // 돌진 중 — 걷기가 아니라 전력 질주(rush). 슬금슬금 다가오는 'move'와 같은 그림이면
        // "지금 돌진 중"이 안 읽힌다. 돌진은 사르가스 전용이고 rush 아트도 사르가스에만 있다.
        case 'bossChargeMove': {
          m.spr.setPosition(m.x, m.y);
          playAnim(m.spr, m.char, 'rush', dir);
          break;
        }
        // 시위를 당기기 시작. 화살은 아직 없다 — 모션만 걸고 릴리즈 프레임까지 기다린다.
        case 'draw':
          playOnce(m.spr, m.char, 'attack', dir); // 공격 아트가 없는 몬스터면 no-op
          break;
        // 시위를 놓는 순간. 모션은 draw에서 이미 돌고 있으니 여기선 화살만 만든다.
        case 'arrow': {
          playSfx('enemyShot');
          const spr = this.add.image(intent.x, intent.y, 'arrow').setDepth(2).setScale(0.7);
          spr.setRotation(Math.atan2(intent.ty - intent.y, intent.tx - intent.x) + Math.PI / 2);
          this.arrows.push({ x: intent.x, y: intent.y, tx: intent.tx, ty: intent.ty, spr, dmg: intent.dmg });
          break;
        }
        case 'melee': {
          playOnce(m.spr, m.char, 'attack', dir);
          // 반격은 실제로 맞았을 때만 (대시 무적·회피로 흘리면 반사도 없다)
          const thorns = this.hurtHero(intent.dmg) ? thornsDmg(gameState().traits, intent.dmg) : 0;
          if (thorns > 0 && !m.dead) this.hitFx(m, thorns);
          if (intent.suicide && !m.dead) {
            m.dead = true;
            m.spr.destroy();
          }
          break;
        }
        // 사거리 안에서 다음 공격을 기다리는 중. 제자리걸음이 아니라 대기 모션으로 선다
        // (idle 아트가 없으면 playAnim이 그 방향 걷기 0번 프레임에 멈춘다).
        case 'idle':
          playAnim(m.spr, m.char, 'idle', dir);
          break;
        // ── 여기부터 사르가스(1탄 보스) 전용 3패턴 연출/판정 ──
        // 패턴 결정 프레임(윈드업 시작) — 실제 공격 판정은 없고, 앞으로 windup초 동안 뭐가
        // 나올지 미리 보여주는 경고 연출만 건다. 그동안(윈드업 중)엔 매 프레임 'idle'만 오는데,
        // 여기서 건 1회성 모션이 playAnim의 busy 가드에 걸려 끝까지 살아남는다 — 즉 모션 자체가
        // 텔레그래프다. 그래서 발동 프레임(bossRock/bossStomp)에선 모션을 다시 걸지 않는다.
        case 'bossTelegraph': {
          const windupAnim = BOSS_WINDUP_ANIM[intent.pattern];
          if (windupAnim) playOnce(m.spr, m.char, windupAnim, dir);
          else playAnim(m.spr, m.char, 'idle', dir);
          this.bossTelegraphFx(m, intent.pattern, intent.windup, intent.chargeTx, intent.chargeTy, intent.areaPoints);
          break;
        }
        // 던지기 발동 = throwing 마지막 프레임(돌을 머리 위로 든 자세). 모션은 이미 그 자세라 그대로 두고
        // 돌만 띄운다 — 여기서 다시 재생하면 이미 던진 돌을 다시 줍는 그림이 된다.
        case 'bossRock': {
          playSfx('enemyShot');
          // 사실적인 바위 모양 생성
          const rock = this.add.graphics();
          rock.setPosition(intent.x, intent.y);
          rock.setDepth(2);

          // 더 불규칙한 다각형으로 바위 모양 (포인트 증가)
          const points = [
            { x: -22, y: -8 },
            { x: -18, y: -18 },
            { x: -8, y: -26 },
            { x: 2, y: -28 },
            { x: 12, y: -24 },
            { x: 20, y: -16 },
            { x: 26, y: -4 },
            { x: 24, y: 8 },
            { x: 18, y: 18 },
            { x: 8, y: 26 },
            { x: -2, y: 28 },
            { x: -12, y: 24 },
            { x: -20, y: 16 },
            { x: -26, y: 6 },
          ];

          // 그림자 레이어 (더 진하고 블러 효과처럼)
          rock.fillStyle(0x1a1510, 0.4);
          rock.beginPath();
          rock.moveTo(points[0].x + 5, points[0].y + 5);
          for (let i = 1; i < points.length; i++) {
            rock.lineTo(points[i].x + 5, points[i].y + 5);
          }
          rock.closePath();
          rock.fillPath();

          // 베이스 그림자
          rock.fillStyle(0x2a2520, 0.5);
          rock.beginPath();
          rock.moveTo(points[0].x + 3, points[0].y + 3);
          for (let i = 1; i < points.length; i++) {
            rock.lineTo(points[i].x + 3, points[i].y + 3);
          }
          rock.closePath();
          rock.fillPath();

          // 메인 바위 (회갈색)
          rock.fillStyle(0x6b5d54, 1);
          rock.beginPath();
          rock.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            rock.lineTo(points[i].x, points[i].y);
          }
          rock.closePath();
          rock.fillPath();

          // 테두리 (윤곽 강조)
          rock.lineStyle(1.5, 0x4a3d35, 0.9);
          rock.beginPath();
          rock.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            rock.lineTo(points[i].x, points[i].y);
          }
          rock.closePath();
          rock.strokePath();

          // 어두운 음영 구역 (오른쪽 아래 - 큰 영역)
          rock.fillStyle(0x3a3330, 0.7);
          rock.fillCircle(12, 10, 14);
          rock.fillCircle(6, 18, 10);
          rock.fillCircle(-4, 14, 8);

          // 중간 톤 영역
          rock.fillStyle(0x5a4d44, 0.5);
          rock.fillCircle(-6, 0, 12);
          rock.fillCircle(8, -6, 10);

          // 밝은 하이라이트 (위쪽 왼쪽 - 광원)
          rock.fillStyle(0xaa9a8a, 0.6);
          rock.fillCircle(-12, -12, 10);
          rock.fillCircle(-4, -16, 7);
          rock.fillCircle(4, -14, 5);

          // 더 밝은 하이라이트 포인트
          rock.fillStyle(0xc0b0a0, 0.5);
          rock.fillCircle(-10, -14, 4);
          rock.fillCircle(2, -16, 3);

          // 갈라진 선들 (바위 균열 - 더 많이)
          rock.lineStyle(2, 0x2a2520, 0.8);
          rock.beginPath();
          rock.moveTo(-12, -18);
          rock.lineTo(-8, -4);
          rock.lineTo(-4, 12);
          rock.strokePath();

          rock.lineStyle(1.5, 0x2a2520, 0.7);
          rock.beginPath();
          rock.moveTo(6, -16);
          rock.lineTo(10, -2);
          rock.lineTo(8, 14);
          rock.strokePath();

          // 작은 균열들
          rock.lineStyle(1, 0x3a3330, 0.6);
          rock.beginPath();
          rock.moveTo(-16, 2);
          rock.lineTo(-8, 8);
          rock.strokePath();

          rock.beginPath();
          rock.moveTo(14, 4);
          rock.lineTo(8, 10);
          rock.strokePath();

          // 작은 돌조각/디테일 (표면 텍스처)
          rock.fillStyle(0x4a3d35, 0.7);
          rock.fillCircle(-14, -6, 2);
          rock.fillCircle(12, -8, 2);
          rock.fillCircle(-6, 16, 2);
          rock.fillCircle(14, 12, 2);
          rock.fillCircle(0, -4, 2);

          // 회전 효과 (날아가면서 회전)
          this.tweens.add({
            targets: rock,
            angle: 360,
            duration: 800,
            repeat: -1,
          });

          this.arrows.push({
            x: intent.x,
            y: intent.y,
            tx: intent.tx,
            ty: intent.ty,
            spr: rock as any,
            dmg: intent.dmg,
          });
          this.floatText(m.x, m.y - m.def.size, '🪨 투척!', '#cc9966');
          break;
        }
        // 스톰핑 발동 = attack 착지 프레임. 남은 두 프레임(흙먼지)은 무방비(recover) 동안 이어서 돈다.
        case 'bossStomp': {
          this.impactFx(intent.x, intent.y, intent.radius);
          this.shakeCam(220, 0.012);
          if (Phaser.Math.Distance.Between(intent.x, intent.y, H.x, H.y) <= intent.radius) this.hurtHero(intent.dmg);
          this.floatText(m.x, m.y - m.def.size, '💥 스톰핑!', '#ff8844');
          break;
        }
        // 돌진 충돌 — 몸통으로 들이받은 것이라 새 모션을 걸지 않는다. attack(뛰어올라 내려찍기)을
        // 걸면 달려오다 갑자기 하늘로 솟는 그림이 된다. 달리던 rush 그대로 두고 충격만 보여준다.
        case 'bossChargeHit': {
          this.shakeCam(260, 0.016);
          if (this.hurtHero(intent.dmg)) this.chargeKnockHero(m);
          this.floatText(H.x, H.y - 50, '💢 충돌!', '#ff5555');
          break;
        }
        // 돌진하다 벽에 처박힘 — 시뮬이 이미 stunT를 걸어놨다. 여기선 "지금이 반격 타이밍"이라는
        // 신호만 크게 준다(별을 띄우고 화면을 흔든다). 다음 프레임부터는 stepStunOrKb가 idle을 준다.
        case 'bossChargeWall': {
          playSfx('heroHurt');
          this.shakeCam(400, 0.02);
          this.impactFx(m.x, m.y, 40);
          this.floatText(m.x, m.y - m.def.size, `💫 벽에 처박혔다! ${intent.stun}초 기절`, '#ffdd44');
          this.pushChat('시스템', '💫 사르가스가 벽에 처박혔다 — 지금이 기회!', '#ffdd44');
          break;
        }
        // ── 베르하르트(기사) 전용 패턴 ──
        // 검기 발산: 3개의 부채꼴 검기 발사
        // (attack 애니메이션은 bossTelegraph에서 이미 재생 중 — 윈드업 시간에 맞춰 느리게 돌아가다가 지금 마지막 프레임)
        case 'bossSwordbeam': {
          playSfx('enemyShot'); // 검기 3개가 한 번에 나가지만 소리는 한 번 — 발사는 한 동작이다
          for (const beam of intent.beams) {
            const angle = Math.atan2(beam.ty - intent.y, beam.tx - intent.x);
            const spr = this.swordbeamSprite();
            spr.setPosition(intent.x, intent.y).setRotation(angle);

            this.arrows.push({
              x: intent.x,
              y: intent.y,
              tx: beam.tx,
              ty: beam.ty,
              spr: spr as unknown as Phaser.GameObjects.Image,
              dmg: intent.dmg,
              speed: KNIGHT_SWORDBEAM_SPEED,
              checkMidair: true, // 비행 중에도 용사와 충돌 체크
            });
          }
          this.floatText(m.x, m.y - m.def.size, '⚔️ 검기!', '#ddeeff');
          break;
        }
        // 공간 가르기 시작 (윈드업 — 기를 모으는 단계, 칼 휘두르기는 발동 시)
        case 'bossSpaceSlashCharge': {
          this.floatText(m.x, m.y - m.def.size, `🌀 공간 가르기! (${intent.threshold} 데미지 필요)`, '#ffaa44');
          // 보스 주변에 보라색 오라 표시
          const aura = this.add.circle(m.x, m.y, 60, 0x8844ff, 0.3).setDepth(1);
          this.tweens.add({
            targets: aura,
            scale: 1.2,
            alpha: 0.1,
            duration: 500,
            yoyo: true,
            repeat: -1,
          });
          // 윈드업이 끝나면 제거
          this.time.delayedCall(KNIGHT_SPACESLASH_WINDUP * 1000, () => aura.destroy());
          break;
        }
        // 공간 가르기 저지 실패: 화면을 가르는 흰색 선
        case 'bossSpaceSlashFail': {
          // 칼 휘두르기 애니메이션 (공간을 가르는 순간)
          playOnce(m.spr, m.char, 'attack', dir);
          this.shakeCam(500, 0.04);

          // 화면 중앙에서 회전시킬 선 (scaleX로 늘어나는 효과)
          const angle = -18 + (Math.random() * 10 - 5); // -23도 ~ -13도 랜덤
          const centerX = CANVAS.W / 2;
          const centerY = CANVAS.H * 0.42; // 화면 42% 높이

          // 발광 효과를 위한 레이어들 (뒤에서 앞으로) - HTML 예시처럼 글로잉
          // 1. 가장 큰 발광 (매우 희미, 60px blur 효과)
          const glow4 = this.add
            .rectangle(centerX, centerY, CANVAS.W * 1.2, 60, 0xffffff, 0.15)
            .setDepth(10)
            .setRotation((angle * Math.PI) / 180)
            .setScale(0, 1)
            .setOrigin(0.5, 0.5);

          // 2. 중간 발광 (20px blur 효과)
          const glow3 = this.add
            .rectangle(centerX, centerY, CANVAS.W * 1.2, 20, 0xffffff, 0.3)
            .setDepth(10)
            .setRotation((angle * Math.PI) / 180)
            .setScale(0, 1)
            .setOrigin(0.5, 0.5);

          // 3. 밝은 발광
          const glow2 = this.add
            .rectangle(centerX, centerY, CANVAS.W * 1.2, 10, 0xffffff, 0.6)
            .setDepth(10)
            .setRotation((angle * Math.PI) / 180)
            .setScale(0, 1)
            .setOrigin(0.5, 0.5);

          // 4. 메인 선 (밝은 흰색)
          const slash = this.add
            .rectangle(centerX, centerY, CANVAS.W * 1.2, 5, 0xffffff, 1)
            .setDepth(10)
            .setRotation((angle * Math.PI) / 180)
            .setScale(0, 1)
            .setOrigin(0.5, 0.5);

          // scaleX: 0 → 1 로 쫙 그어지는 애니메이션
          const slashDuration = 480;
          [glow4, glow3, glow2, slash].forEach((line) => {
            this.tweens.add({
              targets: line,
              scaleX: 1,
              duration: slashDuration * 0.3, // 30%까지 나타남
              ease: 'Cubic.easeOut',
            });
          });

          // 선이 나타난 후 페이드아웃
          this.tweens.add({
            targets: [glow4, glow3, glow2, slash],
            alpha: 0,
            duration: slashDuration * 0.45,
            delay: slashDuration * 0.55,
            onComplete: () => {
              glow4.destroy();
              glow3.destroy();
              glow2.destroy();
              slash.destroy();
            },
          });

          // 화면 전체 강한 플래시
          this.time.delayedCall(260, () => {
            this.cameras.main.flash(200, 255, 255, 255);
          });

          // 피해 판정
          if (Phaser.Math.Distance.Between(intent.x, intent.y, H.x, H.y) <= intent.radius) this.hurtHero(intent.dmg);
          this.floatText(m.x, m.y - m.def.size, '⚡ 공간 베기!', '#ffffff');
          break;
        }
        // 베르하르트 돌진 이동
        case 'bossKnightChargeMove': {
          m.spr.setPosition(m.x, m.y);
          playAnim(m.spr, m.char, 'rush', dir);
          break;
        }
        // 베르하르트 돌진 충돌
        case 'bossKnightChargeHit': {
          this.shakeCam(280, 0.018);
          if (this.hurtHero(intent.dmg)) this.chargeKnockHero(m);
          this.floatText(H.x, H.y - 50, '💢 충돌!', '#ff6666');
          break;
        }
        // ── 그림하르트(최종보스) 전용 패턴 ──
        // 에너지볼 부채꼴 발사 — 검기(swordbeam)와 같은 arrows 파이프라인, 색·개수만 다르다
        case 'bossEnergyBall': {
          playSfx('enemyShot');
          for (const beam of intent.beams) {
            const orb = this.energyBallSprite();
            orb.setPosition(intent.x, intent.y);
            this.arrows.push({
              x: intent.x,
              y: intent.y,
              tx: beam.tx,
              ty: beam.ty,
              spr: orb as unknown as Phaser.GameObjects.Image,
              dmg: intent.dmg,
              speed: MAOU_ENERGYBALL_SPEED,
              checkMidair: true, // 5발이 부채꼴로 동시에 날아가므로 검기와 같은 방식으로 판정
            });
          }
          this.floatText(m.x, m.y - m.def.size, '🔮 에너지볼!', '#cc66ff');
          break;
        }
        // 빛의 심판 — 예고된 지점(bossTelegraph에서 이미 표시)에 전부 동시 타격. hurtHero의
        // 피격 무적(HIT_INVULN_DUR)이 겹치는 지점 중복 피해를 자동으로 막아준다. 타격 시점엔 하늘에서
        // 빛기둥이 내리꽂히는 연출(lightPillarFx)로 "심판"다운 무게감을 준다.
        case 'bossLightRain': {
          this.shakeCam(260, 0.014);
          for (const p of intent.points) {
            this.lightPillarFx(p.x, p.y);
            this.impactFx(p.x, p.y, intent.radius * 0.4);
            if (Phaser.Math.Distance.Between(p.x, p.y, H.x, H.y) <= intent.radius) this.hurtHero(intent.dmg);
          }
          this.floatText(m.x, m.y - m.def.size, '☄️ 빛의 심판!', '#ffee88');
          break;
        }
        // 메테오 채널링 시작 — 공간 가르기와 같은 저지형이라 여기선 예고만 하고 판정은 없다.
        case 'bossMeteorCharge': {
          this.floatText(m.x, m.y - m.def.size, `☄️ 메테오 낙하 중... (${intent.threshold} 피해로 저지)`, '#ff8822');
          this.meteorChannelFx(m, MAOU_METEOR_WINDUP);
          break;
        }
        // 메테오 저지 실패 — 위치·반경 판정이 없다(2026-08-07 재설계: 피하는 게 아니라 화력으로 끊는
        // 패턴). 폭발은 fallingMeteorFx가 떨어뜨린 자리(화면 중앙 고정)에서 터뜨려 낙하 연출과
        // 이어지게 하고, 피해는 그 위치와 무관하게 용사에게 그대로 들어간다.
        case 'bossMeteor': {
          const ix = CX;
          const iy = (ARENA.y + SUMMON_Y) / 2;
          this.shakeCam(420, 0.026);
          this.cameras.main.flash(220, 255, 140, 60);
          const blast = this.add.circle(ix, iy, 40, 0xff8822, 0.6).setDepth(2);
          this.tweens.add({
            targets: blast,
            radius: 180,
            alpha: 0,
            duration: 400,
            ease: 'Cubic.Out',
            onComplete: () => blast.destroy(),
          });
          this.impactFx(ix, iy, 100);
          this.hurtHero(intent.dmg);
          this.floatText(m.x, m.y - m.def.size, '☄️ 메테오 작렬!', '#ff8822');
          break;
        }
        // 워프 시작 — 회복 + 몬스터 소환 + 화면 밖으로 이동(별도 무적 플래그 없이 거리로 공격을 차단).
        case 'bossWarpStart': {
          m.hp = Math.min(m.def.hp, m.hp + m.def.hp * intent.healRatio);
          this.pushChat('시스템', `🌌 ${m.def.name}가 차원의 틈으로 사라졌다! HP를 회복하고 몬스터를 부른다`, '#cc66ff');
          this.floatText(m.x, m.y - m.def.size - 10, `🌌 회복 +${Math.round(intent.healRatio * 100)}%`, '#88ffaa');
          for (let i = 0; i < intent.summonCount; i++) {
            const t = this.lineupTypes[Phaser.Math.Between(0, this.lineupTypes.length - 1)];
            const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const r = Phaser.Math.Between(80, 220);
            const sx = clamp(m.x + Math.cos(ang) * r, arenaBounds.minX, arenaBounds.maxX);
            const sy = clamp(m.y + Math.sin(ang) * r, arenaBounds.minY, arenaBounds.maxY);
            this.doSummon(t, sx, sy);
          }
          m.x = -9999;
          m.y = -9999;
          m.spr.setVisible(false);
          this.cameras.main.flash(400, 140, 60, 255);
          this.shakeCam(300, 0.01);
          break;
        }
        // 워프 종료 — 재등장 좌표는 아레나 경계로 클램프해서 받는다(순수 로직은 경계를 모른다).
        case 'bossWarpEnd': {
          const rx = clamp(intent.x, arenaBounds.minX, arenaBounds.maxX);
          const ry = clamp(intent.y, arenaBounds.minY, arenaBounds.maxY);
          m.x = rx;
          m.y = ry;
          m.spr.setPosition(rx, ry).setVisible(true);
          this.cameras.main.flash(400, 140, 60, 255);
          this.floatText(rx, ry - m.def.size - 10, '👹 귀환!', '#ff66ff');
          this.pushChat('시스템', `👹 ${m.def.name}가 돌아왔다!`, '#ff66ff');
          break;
        }
      }
    }
  }

  // 윈드업 시작 프레임에 한 번만 호출 — 이후 windup초 동안은 매 프레임 'idle'만 오므로
  // 여기서 만든 트윈이 스스로 재생되며 "곧 온다"를 알린다. 패턴별로 다른 예고를 준다.
  bossTelegraphFx(
    m: MonsterEntity,
    pattern: BossPattern,
    windup: number,
    chargeTx?: number,
    chargeTy?: number,
    areaPoints?: Array<{ x: number; y: number }>,
  ) {
    const ms = windup * 1000;
    m.spr.setTint(0xff5555);
    this.time.delayedCall(ms, () => {
      if (!m.dead) m.spr.clearTint();
    });
    if (pattern === 'stomp') {
      const ring = this.add.circle(m.x, m.y, 8, 0xff3333, 0.22).setStrokeStyle(3, 0xff3333, 0.8).setDepth(1);
      this.tweens.add({
        targets: ring,
        radius: GOLEM_STOMP_RADIUS,
        alpha: 0.04,
        duration: ms,
        onComplete: () => ring.destroy(),
      });
      // 뛰어오르는 그림은 아트에 있다(sargas attack) — 예전엔 전용 프레임이 없어 스프라이트를 코드로
      // 들었다 내렸지만, 이제 그러면 그림의 점프와 트윈이 겹쳐 두 번 뛴다. 링 예고만 남긴다.
    } else if (pattern === 'charge') {
      this.tweens.add({
        targets: m.spr,
        scaleX: m.spr.scaleX * 1.12,
        scaleY: m.spr.scaleY * 1.12,
        duration: ms / 2,
        yoyo: true,
      });
      // 돌진은 이제 용사 앞에서 멈추지 않고 정해진 길이를 끝까지 달린다 — 그 선을 실제로 그려줘야
      // "옆으로 비키면 지나간다"가 읽힌다. 조준선 없이는 새 패턴이 그냥 불합리하게 느껴진다.
      if (chargeTx !== undefined && chargeTy !== undefined) {
        const line = this.add.graphics().setDepth(1);
        line.lineStyle(6, 0xff3333, 0.35).beginPath().moveTo(m.x, m.y).lineTo(chargeTx, chargeTy).strokePath();
        this.tweens.add({ targets: line, alpha: 0, duration: ms, onComplete: () => line.destroy() });
      }
    } else if (pattern === 'spaceSlash') {
      // 공간 가르기: 커지는 보라색 원
      const ring = this.add.circle(m.x, m.y, 20, 0x8844ff, 0.3).setStrokeStyle(4, 0x8844ff, 0.9).setDepth(1);
      this.tweens.add({
        targets: ring,
        radius: 100,
        alpha: 0.1,
        duration: ms,
        onComplete: () => ring.destroy(),
      });
    } else if (pattern === 'knightCharge') {
      // 베르하르트 돌진: 크기 확대 효과만
      this.tweens.add({
        targets: m.spr,
        scaleX: m.spr.scaleX * 1.1,
        scaleY: m.spr.scaleY * 1.1,
        duration: ms / 2,
        yoyo: true,
      });
    } else if (pattern === 'energyBall') {
      // 에너지볼 채널링 — 보스 앞에 보라색 구슬이 커지며 응축된다
      const orb = this.add.circle(m.x, m.y - m.def.size * 0.4, 6, 0xaa55ff, 0.7).setDepth(2);
      this.tweens.add({ targets: orb, radius: 16, alpha: 0.15, duration: ms, onComplete: () => orb.destroy() });
    } else if (pattern === 'lightRain') {
      // 빛의 심판: 예고 지점마다 커지는 노란 경고 원 — 하나는 반드시 용사 현재 위치와 겹친다
      for (const p of areaPoints ?? []) {
        const ring = this.add.circle(p.x, p.y, 10, 0xffee88, 0.25).setStrokeStyle(3, 0xffee88, 0.85).setDepth(1);
        this.tweens.add({
          targets: ring,
          radius: MAOU_LIGHTRAIN_RADIUS,
          alpha: 0.05,
          duration: ms,
          onComplete: () => ring.destroy(),
        });
      }
    } else if (pattern === 'warp') {
      // 워프: 사라지기 직전 서서히 투명해진다 — 원복은 bossWarpEnd(재등장)에서
      this.tweens.add({ targets: m.spr, alpha: 0.25, duration: ms });
    }
    // meteor/spaceSlash는 여기까지 안 온다 — 각자 전용 intent(bossMeteorCharge/bossSpaceSlashCharge)로
    // 갈라져서 별도 채널링 연출(meteorChannelFx 등)을 쓴다.
    const icon =
      pattern === 'rock'
        ? '🪨'
        : pattern === 'stomp'
          ? '💥'
          : pattern === 'swordbeam'
            ? '⚔️'
            : pattern === 'energyBall'
              ? '🔮'
              : pattern === 'lightRain'
                ? '☄️'
                : pattern === 'warp'
                  ? '🌌'
                  : '⚡';
    this.floatText(m.x, m.y - m.def.size - 20, icon, '#ff6666');
  }

  // 빛의 심판 타격 지점마다 호출 — 하늘 위에서 빛기둥이 내리꽂히는 연출(글로우 2겹 + 흰 코어,
  // 위쪽 기준점에서 아래로 스케일이 자라나 "떨어진다"는 느낌을 준다). impactFx(땅 스파크)와 같이
  // 써서 기둥이 꽂히는 순간 바닥에서도 반응이 보이게 한다.
  lightPillarFx(x: number, y: number) {
    const topY = y - 420;
    const h = y - topY;
    const mk = (w: number, color: number, alpha: number) =>
      this.add.rectangle(x, topY, w, h, color, alpha).setOrigin(0.5, 0).setDepth(2);
    const group = [mk(90, 0xfff2b0, 0.18), mk(50, 0xfff2b0, 0.35), mk(18, 0xffffff, 0.95)];
    group.forEach((r) => r.setScale(1, 0));
    this.tweens.add({ targets: group, scaleY: 1, duration: 150, ease: 'Cubic.In' });
    this.tweens.add({
      targets: group,
      alpha: 0,
      delay: 180,
      duration: 220,
      onComplete: () => group.forEach((r) => r.destroy()),
    });
  }

  // 검기 — 양 끝이 뾰족한 렌즈(eye) 모양. "느낌 좋다"는 피드백을 받은 디자인으로 되돌렸다(초승달은
  // "완전 이상하다"로 폐기). tip이 로컬 +X를 향하도록 그려서 setRotation(진행각)만 걸면 칼끝이
  // 그대로 진행 방향을 가리킨다. 발 수는 대신 늘렸다(피드백: "eye 모양으로 되돌리고 수를 늘려달라"
  // — KNIGHT_SWORDBEAM_COUNT 3→5, battleSim.ts 참고). 바깥 글로우 → 몸통 → 코어 하이라이트 3겹.
  // Phaser Graphics엔 곡선 API가 없어(moveTo/lineTo/arc뿐) 곡선을 여러 점의 다각형으로 근사한다.
  swordbeamSprite(): Phaser.GameObjects.Graphics {
    const g = this.add.graphics().setDepth(2);
    const lens = (len: number, w: number) => {
      // 위쪽 절반: 코끝(len,0) → 중앙(-len*0.55,0)까지 5점으로 곡선 근사, 아래쪽은 y 반전해 대칭.
      const upper: [number, number][] = [
        [len, 0],
        [len * 0.7, -w * 0.55],
        [len * 0.35, -w * 0.9],
        [0, -w],
        [-len * 0.3, -w * 0.5],
        [-len * 0.55, 0],
      ];
      const pts = [...upper, ...upper.slice(1, -1).reverse().map(([x, y]) => [x, -y] as [number, number])];
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
      g.closePath();
    };
    g.fillStyle(0xaaddff, 0.28);
    lens(50, 16);
    g.fillPath();
    g.fillStyle(0xeaf6ff, 0.85);
    lens(40, 9);
    g.fillPath();
    g.fillStyle(0xffffff, 0.95);
    lens(30, 4);
    g.fillPath();
    return g;
  }

  // 에너지볼 — 동심원 5겹(바깥 아우라 → 어두운 테두리 → 보라 몸통 → 밝은 안쪽 → 흰 코어)에 좌상단
  // 오프셋 하이라이트 점 하나를 더해 "빛나는 구체"처럼 보이게 한다. 2026-08-10 정교화(피드백:
  // "지금 나쁘지 않으니 좀 더 구체화" — 레이어를 늘리고 하이라이트로 곡면 느낌을 살렸다).
  energyBallSprite(): Phaser.GameObjects.Graphics {
    const g = this.add.graphics().setDepth(2);
    g.fillStyle(0x8844ff, 0.15).fillCircle(0, 0, 20);
    g.fillStyle(0x220044, 0.5).fillCircle(0, 0, 14);
    g.fillStyle(0x8844ff, 0.85).fillCircle(0, 0, 10);
    g.fillStyle(0xb377ff, 0.9).fillCircle(0, 0, 6);
    g.fillStyle(0xddaaff, 0.95).fillCircle(0, 0, 3);
    g.fillStyle(0xffffff, 0.85).fillCircle(-3, -3, 1.6); // 좌상단 하이라이트 — 구형 곡면 느낌
    g.lineStyle(1, 0xddaaff, 0.4).strokeCircle(0, 0, 14);
    return g;
  }

  // 메테오 채널링 연출 — 시전자(보스) 몸에는 오라만 걸고, 실제로 떨어지는 운석은 보스 머리 위가
  // 아니라 화면(아레나) 중앙 고정 좌표로 보낸다(2026-08-07: "그림하르트 위에 떨어져서 이상하다"
  // 피드백 — 캐스터와 착탄 지점을 분리했다). 낙하 시간을 windup 전체로 맞춰서 저지 실패 시(=
  // bossMeteor 발동 프레임) 정확히 도착한 것처럼 보인다.
  meteorChannelFx(boss: MonsterEntity, windup: number) {
    const ms = windup * 1000;
    const aura = this.add.circle(boss.x, boss.y, 50, 0xff5522, 0.28).setStrokeStyle(4, 0xff5522, 0.9).setDepth(1);
    this.tweens.add({ targets: aura, scale: 1.25, alpha: 0.12, duration: 450, yoyo: true, repeat: -1 });
    this.time.delayedCall(ms, () => aura.destroy());
    this.fallingMeteorFx(CX, (ARENA.y + SUMMON_Y) / 2, ms);
  }

  // 실제로 화면을 가로질러 떨어지는 운석. 2026-08-07 재작업(피드백: "묘사가 부자연스럽다, 더
  // 운석같이") — 각진 다각형 대신 크레이터 있는 둥근 소행성으로 바꾸고, 멀리서 작게 시작해 떨어질수록
  // 커지는 원근감(scale 0.4→1.5)을 줘서 "카메라 쪽으로 다가온다"는 느낌을 살렸다. 회전도 900ms마다
  // 팽이처럼 도는 대신 낙하 내내 한 바퀴 남짓만 천천히 돌아 무거운 바위처럼 보이게 했다.
  // 2026-08-10: 불꼬리·잔불 파편은 뺐다(피드백: "꼬리는 너무 이상해") — 글로우 + 바위 본체만 남긴다.
  fallingMeteorFx(x: number, y: number, fallMs: number) {
    const container = this.add.container(x, y - 760).setDepth(5).setScale(0.4);

    // 대기권 진입 글로우 — 가장 바깥, 낙하 내내 은은하게 맥동
    const glow = this.add.circle(0, 0, 46, 0xff7722, 0.22).setDepth(-2);
    container.add(glow);
    this.tweens.add({ targets: glow, alpha: 0.4, scale: 1.15, duration: 500, yoyo: true, repeat: -1 });

    // 운석 본체 — 완전한 원이 아니라 반지름을 점마다 흔든 다각형 실루엣(피드백: "너무 동그래,
    // 울퉁불퉁하게"). Phaser Graphics엔 곡선 API가 없어 다각형으로 그리는데, 어차피 소행성은
    // 매끈한 곡선보다 이런 각진 실루엣이 더 그럴듯하다.
    const rock = this.add.graphics();
    const JAG = [1, 0.78, 1.15, 0.7, 1.1, 0.8, 1.2, 0.72, 1.08, 0.85, 1.12, 0.76]; // 반지름 배율 — 울퉁불퉁 패턴
    const blob = (baseR: number) => {
      rock.beginPath();
      JAG.forEach((mult, i) => {
        const a = (i / JAG.length) * Math.PI * 2;
        const x = Math.cos(a) * baseR * mult;
        const y = Math.sin(a) * baseR * mult;
        if (i === 0) rock.moveTo(x, y);
        else rock.lineTo(x, y);
      });
      rock.closePath();
    };
    rock.fillStyle(0x3a2418, 1);
    blob(20);
    rock.fillPath();
    rock.fillStyle(0x2a1710, 1).fillCircle(-6, 7, 8).fillCircle(9, -4, 5); // 어두운 크레이터
    rock.fillStyle(0xff9a44, 0.85).fillCircle(-9, -8, 7).fillCircle(7, 6, 4); // 달아오른 균열
    rock.fillStyle(0xffe1a8, 0.9).fillCircle(-7, -9, 2.6);
    rock.lineStyle(2, 0x140b06, 0.85);
    blob(20);
    rock.strokePath();
    container.add(rock);

    this.tweens.add({ targets: container, angle: 200, duration: fallMs, ease: 'Linear' }); // 낙하 내내 한 바퀴 남짓 천천히 자전
    this.tweens.add({
      targets: container,
      y,
      scale: 1.5, // 다가올수록 커 보이는 원근감
      duration: fallMs,
      ease: 'Cubic.In',
      onComplete: () => container.destroy(),
    });
  }

  // 돌진 충돌 시 용사를 보스 반대 방향으로 밀어낸다 — knockbackProc(방패 밀치기)과 같은 즉시 이동 패턴,
  // 대상만 몬스터가 아니라 용사다. 아레나 경계는 넘지 않는다.
  chargeKnockHero(boss: MonsterEntity) {
    const H = this.hero;
    const d = Phaser.Math.Distance.Between(boss.x, boss.y, H.x, H.y) || 1;
    H.x = clamp(H.x + ((H.x - boss.x) / d) * CHARGE_HERO_KB_DIST, arenaBounds.minX, arenaBounds.maxX);
    H.y = clamp(H.y + ((H.y - boss.y) / d) * CHARGE_HERO_KB_DIST, arenaBounds.minY, arenaBounds.maxY);
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
  // 보스전 중엔 아예 안 돈다(spawnBoss가 이미 진행 중이던 요청도 정리했다) — needsBoss 요청("보스만
  // 노려!")은 이 가드 때문에 더 이상 출제되지 않는다. 필요하면 requests.ts에서 걷어내도 된다.
  updateRequest(dt: number) {
    if (this.bossActive()) return;
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
    // 출제 풀은 "해금된 몬스터"가 아니라 "이번 방송에 편성한 몬스터"다 — 안 데려온 몬스터를 요구하면
    // 달성할 방법이 아예 없다(소환이 자동 웨이브가 됐으므로). 덕분에 편성이 요청 내용까지 좌우한다.
    const def = pickRequest({ monsters: this.lineupTypes, boss: !!boss }, Math.random, this.lastReq ?? undefined);
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
      playSfx('questClear');
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
      playSfx('heroDie');
      const who = this.randomViewer();
      if (who) this.pushChat(who, '...', '#666666');
      this.pushChat('시스템', '용사가 죽었다. 방송 종료', '#ff4444');
      this.shakeCam(500, 0.01);
    } else if (outcome === 'abandoned') {
      playSfx('runFail');
      this.pushChat('시스템', '아무도 보지 않는다. 채널 폐지', '#ff4444');
    } else {
      this.pushChat('시스템', `🎯 ${this.boss!.def.name} 격파! 스테이지 클리어`, '#ffdd44');
    }
    this.time.delayedCall(cleared ? 800 : 1500, () => {
      // 클리어 팡파레는 여기서 운다 — 보스 격파음(bossDown)이 바로 직전 프레임에 울렸으니
      // 곧바로 겹치면 둘 다 뭉개진다. 화면이 정산으로 넘어가는 이 시점이 제자리다.
      if (cleared) playSfx('stageClear');
      gameState().setPhase(cleared && this.isFinal ? 'ending' : 'result');
    });
  }
}
