import type { DonationTier } from '../formulas.ts';

// 효과음 재생기. Phaser sound가 아니라 HTMLAudioElement를 쓰는 이유 두 가지:
//  1. 후원 효과음은 Battle/Hud 씬이 pause된 상태에서 울려야 한다 (fireDonation 참고).
//  2. 재생을 부르는 주체가 Phaser 씬이 아니라 React UI(DonationToast)다.
// 경로는 BASE_URL을 붙인다 — GitHub Pages 서브패스 배포(homepage)에서도 깨지지 않게.
const SRC = {
  donationSmall: 'assets/sounds/sfx/small_donation.mp3',
  donationMiddle: 'assets/sounds/sfx/middle_donation.mp3',
  donationBig: 'assets/sounds/sfx/big_donation.mp3',
} as const;

export type SfxKey = keyof typeof SRC;

// ponytail: 볼륨 knob — 파일마다 녹음 레벨이 달라 개별로 잡는다. 큰 후원일수록 존재감 있게.
const VOLUME: Record<SfxKey, number> = {
  donationSmall: 0.4,
  donationMiddle: 0.55,
  donationBig: 0.7,
};

const DONATION_SFX: Record<DonationTier, SfxKey> = {
  small: 'donationSmall',
  middle: 'donationMiddle',
  big: 'donationBig',
};

const cache = new Map<SfxKey, HTMLAudioElement>();

function audio(key: SfxKey): HTMLAudioElement {
  const cached = cache.get(key);
  if (cached) return cached;
  const el = new Audio(`${import.meta.env.BASE_URL}${SRC[key]}`);
  el.preload = 'auto';
  el.volume = VOLUME[key];
  cache.set(key, el);
  return el;
}

// 첫 후원에서 다운로드 지연으로 소리가 늦게 붙는 걸 막는다. App 마운트 시 1회.
export function preloadSfx(): void {
  for (const key of Object.keys(SRC) as SfxKey[]) audio(key).load();
}

export function playSfx(key: SfxKey): void {
  const el = audio(key);
  el.currentTime = 0; // 인스턴스를 재사용하므로 매번 처음으로 되감는다
  // 사용자 조작 전이면 브라우저 자동재생 정책이 거부한다(NotAllowedError).
  // 효과음은 부가 연출이라 여기서 실패해도 게임 진행을 막아선 안 된다 — 조용히 넘긴다.
  void el.play().catch(() => {});
}

export const playDonationSfx = (tier: DonationTier): void => playSfx(DONATION_SFX[tier]);

// ── BGM ───────────────────────────────────────────────────────────────────
// 효과음과 달리 preloadSfx에 넣지 않는다 — 5MB대라 타이틀 화면부터 받아두면 낭비다.
// 방송이 시작될 때(startBgm) 처음 만들면서 받는다.
const BGM_SRC = 'assets/sounds/bgm/stage-bgm.mp3';
// ponytail: BGM 볼륨 knob. 효과음(0.4~0.7)보다 확실히 낮아야 후원 소리가 묻히지 않는다.
const BGM_VOLUME = 0.3;
const BGM_DUCK_VOLUME = 0.1; // 도네이션 팝업 동안

let bgm: HTMLAudioElement | null = null;
let ducked = false;

function bgmElement(): HTMLAudioElement {
  if (bgm) return bgm;
  bgm = new Audio(`${import.meta.env.BASE_URL}${BGM_SRC}`);
  bgm.loop = true;
  bgm.preload = 'auto';
  return bgm;
}

// 볼륨은 항상 여기로 모아 계산한다. 더킹 중에 컷씬이 끝나 resumeBgm이 불려도
// 원래 볼륨으로 튀지 않게 하려면 "지금 더킹인가"가 유일한 기준이어야 한다.
function applyBgmVolume(): void {
  if (bgm) bgm.volume = ducked ? BGM_DUCK_VOLUME : BGM_VOLUME;
}

export function startBgm(): void {
  const el = bgmElement();
  applyBgmVolume();
  void el.play().catch(() => {}); // 자동재생 차단은 무시 — playSfx와 같은 이유
}

export function stopBgm(): void {
  if (!bgm) return; // 한 번도 안 틀었으면 5MB를 받으러 갈 이유가 없다
  bgm.pause();
  bgm.currentTime = 0;
  ducked = false; // 도네이션 도중 방송이 끝나면 donation:end가 안 온다 — 여기서 되돌려 놓는다
}

export function pauseBgm(): void {
  bgm?.pause();
}

export const resumeBgm = startBgm; // 되감지 않고 이어서 트는 것 = start와 같은 동작

export function duckBgm(on: boolean): void {
  ducked = on;
  applyBgmVolume();
}
