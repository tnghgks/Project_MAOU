import { useStore } from 'zustand';
import { gameStore } from '../game/store.js';
import TitleView from './TitleView.jsx';
import ResultView from './ResultView.jsx';
import UpgradeView from './UpgradeView.jsx';
import EndingView from './EndingView.jsx';

const VIEWS = { title: TitleView, result: ResultView, upgrade: UpgradeView, ending: EndingView };

export default function MenuOverlay() {
  const phase = useStore(gameStore, (s) => s.phase);
  const View = VIEWS[phase];
  return View ? <View /> : null; // broadcast/boot 중엔 메뉴 없음
}
