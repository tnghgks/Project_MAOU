import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './ui/styles.css';

// ponytail: StrictMode 생략 — 개발 시 이펙트 이중 호출이 Phaser 캔버스 생성/파괴와 충돌
createRoot(document.getElementById('root')).render(<App />);
