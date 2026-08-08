import type { ReactNode } from 'react';

// 타이틀 패널 3종(해금·옵션·제작자)이 공유하는 16-bit 창틀.
// 테두리는 이미지가 아니라 겹친 box-shadow라 어떤 해상도에서도 픽셀이 뭉개지지 않는다(title.css).
interface PixelWindowProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function PixelWindow({ title, onClose, children }: PixelWindowProps) {
  return (
    <section className="px-window" role="dialog" aria-label={title}>
      <header className="px-window-bar">
        <span className="px-window-title">◆ {title}</span>
        <button className="px-window-close" onClick={onClose} aria-label="닫기 (ESC)">
          ✕
        </button>
      </header>
      <div className="px-window-body">{children}</div>
    </section>
  );
}
