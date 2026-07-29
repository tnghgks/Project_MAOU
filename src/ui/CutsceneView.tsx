import { useEffect } from 'react';
import { useStore } from 'zustand';
import { gameStore, gameState } from '../game/store.ts';
import { CUTSCENES } from '../data/cutscenes.ts';

const DEFAULT_SEC = 5;

// 컷씬 재생기: 화면 전체를 덮고 큐를 한 장씩 소비한다. 클릭 / 스페이스 / 스킵 버튼 = 다음으로.
export default function CutsceneView() {
  const id = useStore(gameStore, (s) => s.cuts[0]);
  const cut = id ? CUTSCENES[id] : undefined;
  const sec = cut?.sec ?? DEFAULT_SEC;

  useEffect(() => {
    if (!id) return;
    if (!CUTSCENES[id]) return gameState().advanceCut(); // 미등록 id는 큐를 막지 않고 건너뛴다
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      gameState().advanceCut();
    };
    window.addEventListener('keydown', key);
    // 영상이 있으면 onEnded가 진행을 맡는다
    const timer = CUTSCENES[id].src ? null : window.setTimeout(() => gameState().advanceCut(), sec * 1000);
    return () => {
      window.removeEventListener('keydown', key);
      if (timer) clearTimeout(timer);
    };
  }, [id, sec]);

  if (!cut) return null;
  const next = () => gameState().advanceCut();

  return (
    // 검은 배경은 큐 내내 계속 붙어 있는다 — 컷씬 사이에 뒤(타이틀 메뉴)가 비치면 안 되므로
    // key/페이드는 안쪽 내용에만 건다.
    <div className={`cutscene ${cut.tone ?? ''}`} onClick={next}>
      {cut.src ? (
        <video key={id} className="cut-video" src={cut.src} autoPlay onEnded={next} />
      ) : (
        <div key={id} className="cut-frame">
          <span className="cut-mock">▶ CUTSCENE (mock)</span>
          <h2 className="cut-title">{cut.title}</h2>
          {cut.lines.map((l) => (
            <p key={l} className="cut-line">
              {l}
            </p>
          ))}
        </div>
      )}
      {/* 클릭 핸들러는 배경 하나뿐 — 버튼에도 달면 버블링으로 두 장이 한 번에 넘어간다 */}
      <button className="cut-skip">스킵 ▶▶ (SPACE)</button>
      {!cut.src && <div key={`bar-${id}`} className="cut-bar" style={{ animationDuration: `${sec}s` }} />}
    </div>
  );
}
