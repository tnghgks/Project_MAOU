import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore } from 'zustand';
import { gameStore, gameState } from '../../game/store.ts';
import { playSfx } from '../../game/sfx.ts';
import PixelWindow from './PixelWindow.tsx';
import UnlockPanel from './UnlockPanel.tsx';
import OptionsPanel from './OptionsPanel.tsx';
import CreditsPanel from './CreditsPanel.tsx';
import './title.css';

// 타이틀 화면. 옛 오락실 메뉴처럼 항목이 세로로 서 있고 커서(▶)가 위아래로 움직인다 —
// 마우스 hover와 ↑↓키가 같은 선택 상태를 공유하므로 둘 중 뭘 써도 화면이 똑같이 반응한다.
// 조작법 항목은 뺐다: 하단 소환 패널이 조작을 다 드러내서 시작 전에 읽힐 이유가 없어졌다(2026-08-05 시점 통합).

type PanelId = 'unlock' | 'options' | 'credits';

const MENU = [
  { id: 'start', label: '게임 시작' },
  { id: 'unlock', label: '해금' },
  { id: 'options', label: '옵션' },
  { id: 'credits', label: '제작자' },
] as const;

const PANEL_TITLE: Record<PanelId, string> = {
  unlock: '해금 도감',
  options: '옵션',
  credits: '제작자 · 라이선스',
};

// public/ 자산이라 번들러가 경로를 안 바꾼다 — 상대경로 빌드(base './')를 직접 붙여준다.
// CSS 변수로 넘기는 url() 은 상대경로면 스타일시트(/assets/*.css) 기준으로 풀려 assets/assets/ 가 된다.
// 문서 기준 절대 URL 로 고정한다.
const BG_URL = new URL(`${import.meta.env.BASE_URL}assets/bg.png`, location.href).href;

export default function TitleView() {
  const records = useStore(gameStore, (s) => s.records);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [sel, setSel] = useState(0);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  // 프롤로그가 끝나면 웨이브 편성 화면. 1화 진입 컷씬(stage-1)은 여기서 안 튼다 —
  // 편성을 마친 뒤 LineupView가 이어서 재생한다. 즉 순서는 intro → 편성 → stage-1 → 방송.
  // 컷씬이 "이제 방송 들어간다"는 신호라, 편성보다 뒤에 와야 그 신호가 실제 시작과 맞는다.
  const start = () => {
    gameState().resetRun();
    gameState().playCuts(['intro'], () => gameState().setPhase('lineup'));
  };

  // 커서 이동음은 자리가 실제로 바뀔 때만 — 이미 그 항목에 있는데 마우스가 다시 들어와도 울리면
  // 항목 위에서 손을 떠는 것만으로 소리가 난다.
  const move = (i: number) => {
    if (i !== sel) playSfx('uiMove'); // 소리는 setSel 업데이터 밖에서 — 업데이터는 순수해야 한다
    setSel(i);
  };

  const activate = (id: (typeof MENU)[number]['id']) => {
    playSfx('uiSelect');
    if (id === 'start') return start();
    setPanel((cur) => (cur === id ? null : id));
  };

  // ↑↓는 커서만 옮긴다 — 실행(Enter/Space)은 포커스된 버튼이 그대로 받으므로 따로 처리하지 않는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (panel) playSfx('uiMove'); // 이미 닫혀 있으면 ESC는 아무 일도 안 한다 — 소리도 안 난다
        setPanel(null);
        return;
      }
      if (panel) return; // 패널이 떠 있는 동안 뒤쪽 메뉴가 같이 움직이면 안 된다
      const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      playSfx('uiMove');
      setSel((i) => (i + step + MENU.length) % MENU.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  // 선택과 포커스를 붙여 둔다. 패널을 닫으면(panel → null) 커서가 있던 자리로 포커스가 돌아온다.
  useEffect(() => {
    if (!panel) items.current[sel]?.focus();
  }, [sel, panel]);

  const hasRecord = records.bestViewers > 0 || records.bestGold > 0;

  return (
    <div className="menu title-screen" style={{ '--title-bg': `url(${BG_URL})` } as CSSProperties}>
      <div className="px-scanlines" aria-hidden />

      <h1 className="title-logo">마왕 채널</h1>
      <div className="px-rule" aria-hidden />

      <nav className="title-menu" aria-label="타이틀 메뉴">
        {MENU.map((m, i) => (
          <button
            key={m.id}
            ref={(el) => {
              items.current[i] = el;
            }}
            className={i === sel ? 'px-item on' : 'px-item'}
            onMouseEnter={() => move(i)}
            onClick={() => activate(m.id)}
          >
            <span className="px-cursor" aria-hidden>
              ▶
            </span>
            <span className="px-label">{m.label}</span>
          </button>
        ))}
      </nav>

      {panel && (
        <PixelWindow
          title={PANEL_TITLE[panel]}
          onClose={() => {
            playSfx('uiMove'); // ✕ 버튼도 ESC와 같은 소리 — 닫는 동작은 하나다
            setPanel(null);
          }}
        >
          {panel === 'unlock' && <UnlockPanel />}
          {panel === 'options' && <OptionsPanel />}
          {panel === 'credits' && <CreditsPanel />}
        </PixelWindow>
      )}

      {hasRecord && (
        <p className="records">
          최고 동접 {records.bestViewers.toLocaleString()}명 · 최고 골드 {records.bestGold.toLocaleString()}G
        </p>
      )}
      <p className="px-hint">↑↓ 선택 · ENTER 결정 · ESC 닫기</p>
    </div>
  );
}
