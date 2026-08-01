import { useEffect } from 'react';
import { useStore } from 'zustand';
import { gameStore } from '../game/store.ts';
import { stopBgm, pauseBgm, resumeBgm, duckBgm } from '../game/sfx.ts';
import { useBusEvent } from './useBusEvent.ts';

// 스테이지 BGM 지휘자. App이 한 번만 부른다.
// 재생 조건이 phase(지속 상태) + 컷씬 큐(지속 상태) + 도네이션(순간 이벤트) 세 갈래라
// 각 소비처에 흩지 않고 여기 한 곳에 모았다.
export function useBgm(): void {
  const onAir = useStore(gameStore, (s) => s.phase === 'broadcast');
  const inCutscene = useStore(gameStore, (s) => s.cuts.length > 0);

  useEffect(() => {
    if (!onAir) {
      stopBgm();
      return;
    }
    // 컷씬은 <video>가 autoPlay로 소리를 내므로 겹치면 안 된다 (보스 등장 컷씬이 방송 중에 뜬다).
    // 정지가 아니라 일시정지 — 컷씬이 끝나면 끊긴 지점부터 이어져야 방송이 매끄럽다.
    if (inCutscene) pauseBgm();
    else resumeBgm();
  }, [onAir, inCutscene]);

  // 방송 중 언마운트(게임 종료·HMR)에도 소리가 남지 않게
  useEffect(() => () => stopBgm(), []);

  // 후원 팝업 동안은 볼륨을 낮춘다 — 후원 효과음과 리듬 노트가 BGM에 묻히면 안 된다
  useBusEvent('donation:arrive', () => duckBgm(true));
  useBusEvent('donation:end', () => duckBgm(false));
}
