import { useState } from 'react';
import { useStore } from 'zustand';
import { gameStore, gameState } from '../game/store.ts';
import { UPGRADES, type UpgradeKey } from '../data/upgrades.ts';
import { bus } from '../game/events.ts';
import { useDrag } from './useDrag.ts';
import UpgradeShopList from './UpgradeShopList.tsx';

// 전투 중 실시간 강화 상점. 구매 = store 액션 → bus로 BattleScene에 통지 (씬 로컬 hero 동기화 + 임팩트).
export default function ShopPanel() {
  const [open, setOpen] = useState(false);
  const { gold, upgradeLevels } = useStore(gameStore, (s) => ({ gold: s.gold, upgradeLevels: s.upgradeLevels }));
  const drag = useDrag();

  const buy = (key: UpgradeKey) => {
    if (gameState().applyUpgrade(key)) bus.emit('hero:upgraded', { key, delta: UPGRADES[key].delta });
  };

  return (
    <>
      <button className="shop-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? '✕ 닫기' : '🛒 상점'}
      </button>
      {open && (
        <div className="shop-popup" style={drag.style}>
          <p className="gold drag-bar" {...drag.handle}>
            <span className="grip">⠿</span>💰 {Math.floor(gold).toLocaleString()}G
          </p>
          <ul className="shop">
            <UpgradeShopList gold={gold} upgradeLevels={upgradeLevels} onBuy={buy} />
          </ul>
        </div>
      )}
    </>
  );
}
