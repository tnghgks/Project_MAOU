import type { FC } from 'react';
import { useStore } from 'zustand';
import { gameStore, type Phase } from '../game/store.ts';
import TitleView from './TitleView.tsx';
import ResultView from './ResultView.tsx';
import UpgradeView from './UpgradeView.tsx';
import EndingView from './EndingView.tsx';

const VIEWS: Partial<Record<Phase, FC>> = {
  title: TitleView,
  result: ResultView,
  upgrade: UpgradeView,
  ending: EndingView,
};

export default function MenuOverlay() {
  const phase = useStore(gameStore, (s) => s.phase);
  const View = VIEWS[phase];
  return View ? <View /> : null; // broadcast/boot 중엔 메뉴 없음
}
