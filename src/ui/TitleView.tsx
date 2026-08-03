import { useState, type CSSProperties } from 'react';
import { useStore } from 'zustand';
import { gameStore, gameState } from '../game/store.ts';
import { stageCut } from '../data/cutscenes.ts';
import { CONTROLS } from './HelpPopup.tsx';

type Panel = 'help' | 'options' | 'credits' | null;

// public/ 자산이라 번들러가 경로를 안 바꾼다 — 상대경로 빌드(base './')를 직접 붙여준다.
const BG_URL = `${import.meta.env.BASE_URL}assets/bg.png`;

export default function TitleView() {
  const records = useStore(gameStore, (s) => s.records);
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  // 프롤로그 → 1화 진입 컷씬이 끝나면 방송 시작
  const start = () => {
    gameState().resetRun();
    gameState().playCuts(['intro', stageCut(1)], () => gameState().setPhase('broadcast'));
  };

  return (
    <div className="menu title-screen" style={{ '--title-bg': `url(${BG_URL})` } as CSSProperties}>
      <h1 className="title-logo">마왕 채널</h1>
      <p className="subtitle">MAOU CHANNEL — 구독과 좋아요, 그리고 나를 죽일 용사</p>

      <div className="title-menu">
        <button className="cta" onClick={start}>
          ▶ 게임 시작
        </button>
        <button className="cta ghost" onClick={() => toggle('help')}>
          조작법
        </button>
        <button className="cta ghost" onClick={() => toggle('options')}>
          옵션
        </button>
        <button className="cta ghost" onClick={() => toggle('credits')}>
          제작자
        </button>
      </div>

      {panel === 'help' && (
        <div className="howto">
          {CONTROLS.map((c) => (
            <p key={c}>{c}</p>
          ))}
        </div>
      )}
      {/* ponytail: 설정 항목이 아직 없다 — 사운드/저장 옵션 생기면 여기에 붙인다 */}
      {panel === 'options' && <div className="howto">설정 항목 준비 중</div>}
      {panel === 'credits' && (
        <div className="howto">
          <p>기획 · 개발 — Project MAOU</p>
          <p>엔진 Phaser 3 · React · Zustand</p>
          <p>폰트 Galmuri</p>
        </div>
      )}

      {(records.bestViewers || records.bestGold) > 0 && (
        <p className="records">
          최고 동접 {records.bestViewers.toLocaleString()}명 · 최고 골드 {records.bestGold.toLocaleString()}G
        </p>
      )}
    </div>
  );
}
