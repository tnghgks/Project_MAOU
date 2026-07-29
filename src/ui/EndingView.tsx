import { useEffect } from 'react';
import { useStore } from 'zustand';
import { gameStore, gameState } from '../game/store.ts';
import { HERO_TARGET_HP } from '../data/progression.ts';
import { endingCut } from '../data/cutscenes.ts';

// ponytail: 스텁 — 스탯비율(GDD 7장) 근사 판정. 전용 연출·사운드 보류.
const ENDINGS = {
  bad: { title: 'BAD — "싱겁네요"', desc: '용사가 너무 약했다. 마왕은 이겼지만 채널은 망했다.', cls: 'bad' },
  best: { title: 'BEST — "전설의 방송"', desc: '마왕은 쓰러졌지만 역대 최고 동접을 달성했다.', cls: 'best' },
  hidden: { title: 'HIDDEN — "1분 컷"', desc: '용사가 너무 강했다. 마왕 즉사. 클립만 남았다.', cls: 'hidden' },
};

export default function EndingView() {
  const { hero, lastRun } = useStore(gameStore, (s) => ({ hero: s.hero, lastRun: s.lastRun }));
  const ratio = hero.maxHp / HERO_TARGET_HP;
  const e = ratio < 0.6 ? ENDINGS.bad : ratio > 1.2 ? ENDINGS.hidden : ENDINGS.best;
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
