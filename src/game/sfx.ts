import type { DonationTier } from '../formulas.ts';
import { FINAL_EP } from '../data/progression.ts';

// 효과음 재생기. Phaser sound가 아니라 HTMLAudioElement를 쓰는 이유 두 가지:
//  1. 후원 효과음은 Battle/Hud 씬이 pause된 상태에서 울려야 한다 (fireDonation 참고).
//  2. 부르는 주체가 씬만이 아니다 — 타이틀/상점/리듬 UI는 Phaser 밖(React)에서 소리를 낸다.
// 경로는 BASE_URL을 붙인다 — GitHub Pages 서브패스 배포(homepage)에서도 깨지지 않게.
//
// 파일명은 팩에서 받은 원본 그대로 둔다 — 라이선스 고지(public/THIRD-PARTY-NOTICES.md)와 대조할 때
// 팩 이름이 파일에 남아 있는 편이 추적이 쉽다. 공백은 아래 make()에서 인코딩한다.
// Footstep 1은 안 쓴다: 용사는 상시 이동이라 발소리를 붙이면 다른 전투음을 전부 덮는다.
const PACK = 'assets/sounds/sfx/JDSherbert - Pixel Game Essentials SFX Pack - ';
const SRC = {
  donationSmall: 'assets/sounds/sfx/small_donation.mp3',
  donationMiddle: 'assets/sounds/sfx/middle_donation.mp3',
  donationBig: 'assets/sounds/sfx/big_donation.mp3',
  // 전투
  hit: `${PACK}Damage 1.ogg`, // 용사 공격 적중 (스윙 1회 = 1번, 동시 타격 수와 무관)
  heroHurt: `${PACK}Damage 2.ogg`, // 용사 피격 · 저주 카드
  dodge: `${PACK}Jump 2.ogg`, // 회피(MISS)
  dash: `${PACK}Jump 1.ogg`, // Shift 대시
  kill: `${PACK}Box Break 1.ogg`, // 몬스터 처치
  bossDown: `${PACK}Die 2.ogg`, // 보스 격파
  heroDie: `${PACK}Die 1.ogg`, // 용사 사망
  skill: `${PACK}Shoot 1.ogg`, // QWER 스킬 시전
  enemyShot: `${PACK}Shoot 2.ogg`, // 궁수 화살 · 보스 원거리 패턴
  // 보상 · 진행
  card: `${PACK}Powerup 1.ogg`, // 스탯 카드 획득
  trait: `${PACK}Powerup 2.ogg`, // 특성 각성
  questClear: `${PACK}Checkpoint 1.ogg`, // 시청자 요청 달성
  stageClear: `${PACK}Level Complete 1.ogg`, // 보스 격파 → 스테이지 클리어
  runFail: `${PACK}Level Fail 1.ogg`, // 시청자 이탈로 채널 폐지
  // UI
  buy: `${PACK}Coin 1.ogg`, // 상점 구매
  uiSelect: `${PACK}Coin 2.ogg`, // 메뉴 결정
  uiMove: `${PACK}Switch 1.ogg`, // 커서 이동 · 일시정지 토글 · 리듬 노트 명중
} as const;

export type SfxKey = keyof typeof SRC;

// ponytail: 볼륨 knob — 파일마다 녹음 레벨이 달라 개별로 잡는다. 큰 후원일수록 존재감 있게.
// 자주 울리는 소리(hit·enemyShot)는 낮게, 한 판에 몇 번 없는 소리(stageClear 등)는 높게 둔다.
const VOLUME: Record<SfxKey, number> = {
  donationSmall: 0.4,
  donationMiddle: 0.55,
  donationBig: 0.7,
  hit: 0.22,
  heroHurt: 0.5,
  dodge: 0.3,
  dash: 0.25,
  kill: 0.3,
  bossDown: 0.6,
  heroDie: 0.6,
  skill: 0.45,
  enemyShot: 0.18,
  card: 0.5,
  trait: 0.6,
  questClear: 0.5,
  stageClear: 0.6,
  runFail: 0.55,
  buy: 0.4,
  uiSelect: 0.4,
  uiMove: 0.3,
};

// 연타 억제 — 같은 소리가 이 간격(ms) 안에 다시 요청되면 무시한다. 광역 스킬 한 방에 열 마리가
// 동시에 죽거나 궁수 여럿이 같은 프레임에 쏘면 같은 파일이 겹쳐 울려 그냥 소음이 된다.
// ponytail: 스팸 억제 knob — 올릴수록 "한 번만 울린 것"처럼 뭉친다.
const MIN_GAP_DEFAULT = 40;
const MIN_GAP: Partial<Record<SfxKey, number>> = {
  hit: 70,
  kill: 90,
  enemyShot: 110,
};

const DONATION_SFX: Record<DonationTier, SfxKey> = {
  small: 'donationSmall',
  middle: 'donationMiddle',
  big: 'donationBig',
};

// 키마다 원본(template)을 하나 두고, 재생할 때마다 그걸 복제해서 튼다.
//
// 하나를 currentTime=0으로 되감아 재사용하지 않는 이유가 두 가지다:
//  1. 겹치는 소리가 서로를 끊는다. 후원음은 드물어서 티가 안 났지만 전투음(타격·처치)은 서로 잡아먹는다.
//  2. 되감기(시크)가 파일에 따라 재생기를 아예 망가뜨린다. 실제로 이 팩의 Damage 2.ogg는 첫 재생은
//     되지만 currentTime=0을 준 순간 Chrome 디먹서가
//     `DEMUXER_ERROR_COULD_NOT_PARSE: FFmpegDemuxer: PTS is not defined` 로 죽고, 그 요소는 이후
//     영구히 무음이 된다(용사 피격음이 통째로 사라졌다). 파일 자체는 멀쩡해서 — decodeAudioData도,
//     새 요소로 처음부터 트는 것도 정상이다 — 시크만 피하면 된다.
// 복제 비용은 재생당 0.02ms 수준이라(측정치) 60fps 프레임 예산에서 무시할 만하다.
const POOL_MAX = 4; // 한 소리가 동시에 겹칠 수 있는 최대 개수
const templates = new Map<SfxKey, HTMLAudioElement>();
const live = new Map<SfxKey, HTMLAudioElement[]>(); // 지금 울리고 있는 복제본들
const lastAt = new Map<SfxKey, number>();

// 옵션 화면의 음량 설정(0~1). 파일별 기본 볼륨에 곱하는 배율이라 1이 "지금까지와 같음"이다.
// 설정의 주인은 스토어고 여기엔 미러링만 둔다 — 동기화는 useBgm 한 곳이 맡는다.
let masterSfx = 1;
let masterBgm = 1;
const clampVol = (v: number) => Math.min(1, Math.max(0, v));

export function setSfxVolume(v: number): void {
  masterSfx = clampVol(v);
  // 지금 울리고 있는 소리까지 그 자리에서 바뀐다. 원본은 복제될 때 볼륨을 넘겨주지 않지만
  // (volume은 속성이 아니라 프로퍼티라 cloneNode가 안 옮긴다) 값의 출처를 한 군데로 두려고 같이 맞춘다.
  for (const [key, el] of templates) el.volume = VOLUME[key] * masterSfx;
  for (const [key, list] of live) for (const el of list) el.volume = VOLUME[key] * masterSfx;
}

export function setBgmVolume(v: number): void {
  masterBgm = clampVol(v);
  applyBgmVolume();
}

// 팩 파일명엔 공백이 들어 있다. 대부분의 브라우저가 알아서 인코딩하지만 여기서 한 번 확실히 한다
// (encodeURI는 이미 인코딩된 %XX를 다시 건드리지 않아 BASE_URL이 인코딩돼 있어도 안전하다).
// 팩 파일명엔 공백이 들어 있다. 대부분의 브라우저가 알아서 인코딩하지만 여기서 한 번 확실히 한다
// (encodeURI는 이미 인코딩된 %XX를 다시 건드리지 않아 BASE_URL이 인코딩돼 있어도 안전하다).
function template(key: SfxKey): HTMLAudioElement {
  let el = templates.get(key);
  if (!el) {
    el = new Audio(encodeURI(`${import.meta.env.BASE_URL}${SRC[key]}`));
    el.preload = 'auto';
    el.volume = VOLUME[key] * masterSfx;
    templates.set(key, el);
  }
  return el;
}

// 첫 재생에서 다운로드 지연으로 소리가 늦게 붙는 걸 막는다. App 마운트 시 1회.
// 원본만 받아두면 충분하다 — 복제본은 같은 URL이라 브라우저 캐시에서 바로 나온다.
export function preloadSfx(): void {
  for (const key of Object.keys(SRC) as SfxKey[]) template(key).load();
}

export function playSfx(key: SfxKey): void {
  const now = performance.now();
  const gap = MIN_GAP[key] ?? MIN_GAP_DEFAULT;
  const prev = lastAt.get(key);
  if (prev !== undefined && now - prev < gap) return;
  lastAt.set(key, now);

  let list = live.get(key);
  if (!list) {
    list = [];
    live.set(key, list);
  }
  // 다 울린 복제본은 여기서 흘려보낸다 — 목록이 무한정 자라지 않게 하는 유일한 지점이다.
  for (let i = list.length - 1; i >= 0; i--) if (list[i].ended || list[i].paused) list.splice(i, 1);
  // 상한까지 겹쳤으면 가장 먼저 시작한 걸 끊는다. 같은 소리가 이미 네 겹이라 하나쯤 빠져도 안 들린다.
  if (list.length >= POOL_MAX) list.shift()?.pause();

  const el = template(key).cloneNode() as HTMLAudioElement;
  el.volume = VOLUME[key] * masterSfx; // cloneNode는 volume(프로퍼티)을 안 옮긴다 — 매번 직접 준다
  list.push(el);
  // 사용자 조작 전이면 브라우저 자동재생 정책이 거부한다(NotAllowedError).
  // 효과음은 부가 연출이라 여기서 실패해도 게임 진행을 막아선 안 된다 — 조용히 넘긴다.
  void el.play().catch(() => {});
}

export const playDonationSfx = (tier: DonationTier): void => playSfx(DONATION_SFX[tier]);

// ── BGM ───────────────────────────────────────────────────────────────────
// 효과음과 달리 preloadSfx에 넣지 않는다 — 5MB대라 타이틀 화면부터 전부 받아두면 낭비다.
// 실제로 트는 순간(playBgm)에 그 트랙만 만들면서 받는다.
// ponytail: 트랙 파일 knob — 1·2화 보스는 아직 전용 곡이 없어 같은 파일을 본다. 곡 오면 여기 경로만 갈아끼운다.
const BGM_SRC = {
  title: 'assets/sounds/bgm/title_bgm.mp3',
  stage1: 'assets/sounds/bgm/stage-1_bgm.mp3',
  stage2: 'assets/sounds/bgm/stage-2_bgm.mp3',
  stage3: 'assets/sounds/bgm/stage-3_bgm.mp3',
  boss1: 'assets/sounds/bgm/boss_bgm.mp3',
  boss2: 'assets/sounds/bgm/boss_bgm.mp3',
  boss3: 'assets/sounds/bgm/final-boss_bgm.mp3',
} as const;

export type BgmTrack = keyof typeof BGM_SRC;

// 화 번호 + 보스 등장 여부 → 트랙 키. 범위 밖 화는 최종화 곡으로 떨어뜨린다.
export const stageBgm = (episode: number, boss: boolean): BgmTrack =>
  `${boss ? 'boss' : 'stage'}${Math.min(Math.max(episode, 1), FINAL_EP)}` as BgmTrack;

// ponytail: BGM 볼륨 knob. 효과음(0.4~0.7)보다 확실히 낮아야 후원 소리가 묻히지 않는다.
const BGM_VOLUME = 0.3;
const BGM_DUCK_VOLUME = 0.1; // 도네이션 팝업 동안

const bgmCache = new Map<BgmTrack, HTMLAudioElement>();
let bgm: HTMLAudioElement | null = null; // 지금 트는 트랙 (정지 상태면 null)
let ducked = false;

// 볼륨은 항상 여기로 모아 계산한다. 더킹 중에 컷씬이 끝나 playBgm이 다시 불려도
// 원래 볼륨으로 튀지 않게 하려면 "지금 더킹인가"가 유일한 기준이어야 한다.
function applyBgmVolume(): void {
  if (bgm) bgm.volume = (ducked ? BGM_DUCK_VOLUME : BGM_VOLUME) * masterBgm;
}

// 재생 겸 트랙 전환. 같은 트랙이면 되감지 않고 이어서 튼다 — 컷씬 복귀가 이 경로를 탄다.
export function playBgm(track: BgmTrack): void {
  let next = bgmCache.get(track);
  if (!next) {
    next = new Audio(`${import.meta.env.BASE_URL}${BGM_SRC[track]}`);
    next.loop = true;
    next.preload = 'auto';
    bgmCache.set(track, next);
  }
  if (bgm && bgm !== next) {
    bgm.pause();
    bgm.currentTime = 0; // 나중에 이 트랙으로 돌아오면 처음부터 (보스 → 다음 화 스테이지)
  }
  bgm = next;
  applyBgmVolume();
  // 자동재생 차단은 무시 — playSfx와 같은 이유. 첫 방문 타이틀 화면은 조작 전이라 대부분 여기 걸린다.
  void bgm.play().catch(() => {});
}

export function stopBgm(): void {
  if (!bgm) return; // 한 번도 안 틀었으면 5MB를 받으러 갈 이유가 없다
  bgm.pause();
  bgm.currentTime = 0;
  bgm = null;
  ducked = false; // 도네이션 도중 방송이 끝나면 donation:end가 안 온다 — 여기서 되돌려 놓는다
}

export function pauseBgm(): void {
  bgm?.pause();
}

export function duckBgm(on: boolean): void {
  ducked = on;
  applyBgmVolume();
}

// HMR로 이 모듈이 갈릴 때 bgmCache는 새로 비워지지만, 재생 중이던 Audio는 아무도 못 잡는 채로
// 계속 울린다 — 새 모듈이 같은 곡을 틀면 그대로 겹친다. 교체 직전에 끊고 넘긴다 (개발 전용).
import.meta.hot?.dispose(() => stopBgm());
