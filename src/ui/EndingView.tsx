import { useEffect } from 'react';
import { useStore } from 'zustand';
import { gameStore, gameState } from '../game/store.ts';
import { endingCut } from '../data/cutscenes.ts';

// 2026-08-10: 엔딩 분기 제거 — 마왕(boss_maou)을 격파하면 무조건 BEST 엔딩
// 최종 보스를 클리어한 것 자체가 최고의 성과다.
const ENDING = { title: 'BEST — "전설의 방송"', desc: '마왕은 쓰러졌고 역대 최고 동접을 달성했다.', cls: 'best' };

export default function EndingView() {
  const { lastRun } = useStore(gameStore, (s) => ({ lastRun: s.lastRun }));
  const e = ENDING; // 항상 BEST 엔딩
  // 엔딩 종류별 컷씬을 먼저 덮어씌운다 — 끝나면 아래 정산 화면이 드러난다
  useEffect(() => {
    gameState().playCuts(endingCut(e.cls));
  }, [e.cls]);
  const back = () => {
    gameState().resetRun();
    gameState().setPhase('title');
  };
  return (
    <div className="menu">
      <h2 className={`ending-title ${e.cls}`}>{e.title}</h2>
      <p className="subtitle">{e.desc}</p>
      <p className="records">최종 동접 {lastRun.peakViewers.toLocaleString()}명</p>
      <button className="cta" onClick={back}>
        ↺ 타이틀로
      </button>
    </div>
  );
}
