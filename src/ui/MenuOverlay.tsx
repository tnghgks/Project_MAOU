import type { FC } from 'react';
import { useStore } from 'zustand';
import { gameStore, type Phase } from '../game/store.ts';
import ResultView from './ResultView.tsx';
import UpgradeView from './UpgradeView.tsx';
import EndingView from './EndingView.tsx';

// title은 화면 전체를 덮으므로 App이 프레임 밖에서 직접 렌더한다
const VIEWS: Partial<Record<Phase, FC>> = {
  result: ResultView,
  upgrade: UpgradeView,
  ending: EndingView,
};

export default function MenuOverlay() {
  const phase = useStore(gameStore, (s) => s.phase);
  const View = VIEWS[phase];
  return View ? <View /> : null; // broadcast/boot/title 중엔 프레임 안 메뉴 없음
}
