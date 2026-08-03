import { useEffect } from 'react';
import { useStore } from 'zustand';
import { gameStore, type GameState } from '../game/store.ts';
import { playBgm, stopBgm, pauseBgm, duckBgm, stageBgm, type BgmTrack } from '../game/sfx.ts';
import { useBusEvent } from './useBusEvent.ts';

// 상황 → 트랙. 여기 없는 페이즈(result·upgrade·ending)는 무음.
function trackOf(s: GameState): BgmTrack | null {
  if (s.phase === 'title') return 'title';
  if (s.phase === 'broadcast') return stageBgm(s.episode, s.bossUp);
  return null;
}

// BGM 지휘자. App이 한 번만 부른다.
// 재생 조건이 페이즈·화·보스(지속 상태) + 컷씬 큐(지속 상태) + 도네이션(순간 이벤트) 세 갈래라
// 각 소비처에 흩지 않고 여기 한 곳에 모았다.
export function useBgm(): void {
  const track = useStore(gameStore, trackOf);
  const inCutscene = useStore(gameStore, (s) => s.cuts.length > 0);
  const bgmOn = useStore(gameStore, (s) => s.bgmOn);

  useEffect(() => {
    if (!track) stopBgm();
    // 컷씬은 <video>가 autoPlay로 소리를 내므로 겹치면 안 된다 (보스 등장 컷씬이 방송 중에 뜬다).
    // Off도 같은 일시정지 — 되감지 않아야 다시 켰을 때 끊긴 지점부터 이어진다.
    else if (inCutscene || !bgmOn) pauseBgm();
    else playBgm(track); // 트랙이 바뀌었으면 여기서 갈아끼우고, 같으면 이어서 튼다
  }, [track, inCutscene, bgmOn]);

  // 방송 중 언마운트(게임 종료·HMR)에도 소리가 남지 않게
  useEffect(() => () => stopBgm(), []);

  // 후원 팝업 동안은 볼륨을 낮춘다 — 후원 효과음과 리듬 노트가 BGM에 묻히면 안 된다
  useBusEvent('donation:arrive', () => duckBgm(true));
  useBusEvent('donation:end', () => duckBgm(false));
}
