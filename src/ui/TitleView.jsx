import { useStore } from 'zustand';
import { gameStore, gameState } from '../game/store.js';

export default function TitleView() {
  const records = useStore(gameStore, (s) => s.records);
  const start = () => { gameState().resetRun(); gameState().setPhase('broadcast'); };
  return (
    <div className="menu">
      <h1 className="title-logo">마왕 채널</h1>
      <p className="subtitle">MAOU CHANNEL — 구독과 좋아요, 그리고 나를 죽일 용사</p>
      <div className="howto">
        <p>마우스 클릭: 몬스터 소환 (숫자키로 종류 선택)</p>
        <p>D F J K: 도네이션 리듬 판정</p>
        <p>용사를 죽이지 마라. 단, 죽기 직전까지 몰아붙여라.</p>
      </div>
      {(records.bestViewers || records.bestGold) > 0 && (
        <p className="records">최고 동접 {records.bestViewers.toLocaleString()}명 · 최고 골드 {records.bestGold.toLocaleString()}G</p>
      )}
      <button className="cta" onClick={start}>▶ 방송 시작</button>
    </div>
  );
}
