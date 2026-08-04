import { useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { gameStore, gameState } from '../game/store.ts';
import ChatPanel from './ChatPanel.tsx';

// 실제 스트리밍 플랫폼 레이아웃(상단바 / 플레이어 / 방송정보 / 채팅)을 흉내낸 껍데기.
// 게임 캔버스와 오버레이는 children으로 .screen 안에 들어간다 — 좌표계(1280x720 %)는 그대로 유지.
export default function BroadcastFrame({ children }: { children: ReactNode }) {
  const phase = useStore(gameStore, (s) => s.phase);
  const episode = useStore(gameStore, (s) => s.episode);
  const viewers = useStore(gameStore, (s) => s.viewers);
  const mode = useStore(gameStore, (s) => s.mode);
  const bgmOn = useStore(gameStore, (s) => s.bgmOn);
  const [following, setFollowing] = useState(false);
  const [showChat, setShowChat] = useState(true); // 채팅은 화면 위 오버레이 — 숨겨도 내역은 ChatPanel 모듈이 보관
  const live = phase === 'broadcast';

  return (
    <div className={mode === 'hero' && live ? 'site hero-mode' : 'site'}>
      <header className="topbar">
        <span className="logo">
          마왕채널<sup>beta</sup>
        </span>
        <div className="topbar-actions">
          {/* 채팅을 숨겨도 버튼은 남아야 하므로 헤더에 고정 */}
          <button className="chat-toggle" onClick={() => setShowChat((v) => !v)}>
            {showChat ? '💬 채팅 숨기기' : '💬 채팅 보기'}
          </button>
          {/* 실제 재생/정지는 useBgm이 bgmOn을 보고 판단한다 — 여긴 설정만 뒤집는다.
              타이틀 화면(전체를 덮는 오버레이) 위로도 보이게 .bgm-toggle이 z-index를 올린다. */}
          <button
            className="chat-toggle bgm-toggle"
            onClick={() => gameState().toggleBgm()}
            aria-pressed={bgmOn}
            title="BGM 켜기/끄기"
          >
            {bgmOn ? '🔊 BGM' : '🔇 BGM'}
          </button>
        </div>
      </header>

      <main className="player">
        <div className="stage">
          <div className="screen">
            {children}
            {showChat && <ChatPanel />}
          </div>
        </div>
        <div className="meta">
          <h1 className="meta-title">
            {live && <span className="live-chip">LIVE</span>}
            마왕 채널 — {episode}화 방송
          </h1>
          <p className="meta-sub">
            시청자 {live ? viewers.toLocaleString() : 0}명 · {live ? '방송 중' : '오프라인'}
          </p>
          <div className="streamer">
            <span className="avatar">👑</span>
            <b>마왕</b>
            <button className={following ? 'follow on' : 'follow'} onClick={() => setFollowing((f) => !f)}>
              {following ? '✓ 팔로잉' : '＋ 팔로우'}
            </button>
            <button className="sub" disabled>
              구독
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
