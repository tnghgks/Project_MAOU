import { useStore } from 'zustand';
import { gameStore, gameState } from '../game/store.ts';

const FAIL = {
  death: { title: '📵 방 송 사 고', desc: '용사가 사망했습니다. 채널이 폭파되었습니다.' },
  abandoned: { title: '🕸 채 널 폐 지', desc: '시청자가 모두 떠났습니다. 목표 후원을 채우지 못했습니다.' },
};

export default function ResultView() {
  const { lastRun, gold, episode } = useStore(gameStore, (s) => ({ lastRun: s.lastRun, gold: s.gold, episode: s.episode }));
  const fail = lastRun.outcome === 'clear' ? null : FAIL[lastRun.outcome];
  const proceed = () => {
    if (fail) { gameState().resetRun(); gameState().setPhase('title'); }
    else gameState().setPhase('upgrade');
  };
  return (
    <div className="menu">
      {fail ? (
        <>
          <h2 className="result-title bad">{fail.title}</h2>
          <p className="subtitle">{fail.desc}</p>
        </>
      ) : (
        <>
          <h2 className="result-title good">📺 {episode}화 목표 달성</h2>
          <p className="subtitle">오늘도 무사히(?) 방송을 마쳤습니다.</p>
        </>
      )}
      <dl className="stats">
        <div><dt>최고 동접</dt><dd>{lastRun.peakViewers.toLocaleString()}명</dd></div>
        <div><dt>총 도네이션</dt><dd>{lastRun.totalDonated.toLocaleString()}G</dd></div>
        <div><dt>보유 골드</dt><dd>{Math.floor(gold).toLocaleString()}G</dd></div>
        <div><dt>처치한 몬스터</dt><dd>{lastRun.kills}마리</dd></div>
      </dl>
      <button className="cta" onClick={proceed}>{fail ? '↺ 타이틀로' : '▶ 육성 화면으로'}</button>
    </div>
  );
}
