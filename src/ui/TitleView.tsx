import { useState, type CSSProperties } from 'react';
import { useStore } from 'zustand';
import { gameStore, gameState } from '../game/store.ts';
import { stageCut } from '../data/cutscenes.ts';

type Panel = 'help' | 'options' | 'credits' | null;

// 타이틀 화면 "조작법" 패널 전용 — 예전엔 방송 중 떠 있는 별도 팝업(HelpPopup)과 공유했지만,
// 그 팝업은 시점 통합(2026-08-05) 이후 하단 패널만 보면 조작이 다 드러나서 없앴다.
// 여긴 시작 전에 한 번 훑어보는 용도라 그대로 남기고, 내용만 최신 조작으로 갱신한다.
const CONTROLS = [
  '방향키: 이동 · Shift: 대시(무적)',
  '1~4: 몬스터 즉시 소환 (하단 패널 버튼 클릭도 동일)',
  'Q W E R: 스킬 시전 · 도네이션 리듬 중엔 같은 키로 노트 판정',
  '짧은 간격으로 연속 처치하면 콤보가 쌓여 하이프가 오른다',
  'HP 30% 이하를 버티면 시청자가 몰린다 — 벼랑끝이 제일 잘 팔린다',
  '후원 카드에서 드물게 특성(흡혈·반격·광전사 등)이 나온다 — 이번 방송 한정',
  '목표 골드를 채우면 보스 등장 · 용사가 보스를 잡으면 방송 성공',
  '시청자가 다 나가면 채널 폐지',
  '용사를 죽이지 마라. 단, 죽기 직전까지 몰아붙여라.',
];

// public/ 자산이라 번들러가 경로를 안 바꾼다 — 상대경로 빌드(base './')를 직접 붙여준다.
// CSS 변수로 넘기는 url() 은 상대경로면 스타일시트(/assets/*.css) 기준으로 풀려 assets/assets/ 가 된다.
// 문서 기준 절대 URL 로 고정한다.
const BG_URL = new URL(`${import.meta.env.BASE_URL}assets/bg.png`, location.href).href;

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
