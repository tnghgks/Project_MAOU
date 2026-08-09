import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './ui/styles.css';
// 16-bit 공용 토큰·프리미티브. styles.css 뒤에 둬서 --px-* 가 전역에 깔린다 —
// 타이틀(title.css)과 웨이브 편성(lineup.css)이 둘 다 이걸 전제로 쓴다.
import './ui/pixel.css';

// ponytail: StrictMode 생략 — 개발 시 이펙트 이중 호출이 Phaser 캔버스 생성/파괴와 충돌
createRoot(document.getElementById('root')!).render(<App />);
