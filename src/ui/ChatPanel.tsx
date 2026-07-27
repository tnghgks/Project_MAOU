import { useStore } from 'zustand';
import { gameStore } from '../game/store.ts';
import { useChatLog } from './useChatLog.ts';
import { useDrag } from './useDrag.ts';

// 방송 화면 위에 얹는 반투명 오버레이 채팅. 유저는 채팅을 못 치니 입력창도 스크롤도 없다 —
// 화면에 보이는 만큼만 남기고 아래로 흘린다(내역 보관은 useChatLog).
// 시스템/후원 줄은 강조, 일반 줄은 "닉네임: 메시지" (닉네임에만 색)
const isNotice = (who: string) => who === '시스템' || who.startsWith('🎁');

export default function ChatPanel() {
  const viewers = useStore(gameStore, (s) => s.viewers);
  const lines = useChatLog();
  const drag = useDrag();

  return (
    <aside className="chat" style={drag.style}>
      {/* 손잡이 겸 시청자 수 — 오버레이에서 유일하게 클릭을 받는 부분 */}
      <span className="chat-grip" {...drag.handle}>
        ⠿ 👁 {viewers.toLocaleString()}
      </span>
      <ul>
        {lines.map((l) => (
          <li key={l.id} className={isNotice(l.who) ? 'notice' : undefined}>
            {isNotice(l.who) ? (
              <span style={{ color: l.color }}>{l.msg}</span>
            ) : (
              <>
                <span className="badge">💜</span>
                <b style={{ color: l.color }}>{l.who}</b>
                <span className="msg">{l.msg}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
