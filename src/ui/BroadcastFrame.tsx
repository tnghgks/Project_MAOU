import { useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { gameStore } from '../game/store.ts';
import ChatPanel from './ChatPanel.tsx';

// 실제 스트리밍 플랫폼 레이아웃(상단바 / 플레이어 / 방송정보 / 채팅)을 흉내낸 껍데기.
// 게임 캔버스와 오버레이는 children으로 .screen 안에 들어간다 — 좌표계(1280x720 %)는 그대로 유지.
// ponytail: 검색창은 분위기용 정적 장식 — 게임 로직 없음
export default function BroadcastFrame({ children }: { children: ReactNode }) {
  const phase = useStore(gameStore, (s) => s.phase);
  const episode = useStore(gameStore, (s) => s.episode);
  const viewers = useStore(gameStore, (s) => s.viewers);
  const mode = useStore(gameStore, (s) => s.mode);
  const [following, setFollowing] = useState(false);
  const [showChat, setShowChat] = useState(true); // 채팅은 화면 위 오버레이 — 숨겨도 내역은 ChatPanel 모듈이 보관
  const live = phase === 'broadcast';

  return (
    <div className={mode === 'hero' && live ? 'site hero-mode' : 'site'}>
      <header className="topbar">
        <span className="logo">
          마왕채널<sup>beta</sup>
        </span>
        <input className="search" placeholder="스트리머, 게임 영상 검색" disabled />
        {/* 채팅을 숨겨도 버튼은 남아야 하므로 헤더에 고정 */}
        <button className="chat-toggle" onClick={() => setShowChat((v) => !v)}>
          {showChat ? '💬 채팅 숨기기' : '💬 채팅 보기'}
        </button>
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
