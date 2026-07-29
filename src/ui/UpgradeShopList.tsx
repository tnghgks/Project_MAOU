import { UPGRADES, upgradeCost, type UpgradeKey } from '../data/upgrades.ts';

// 강화 목록 행(<li>)만 공유 — 상점(ShopPanel)과 육성(UpgradeView)이 동일하게 쓴다.
// <ul className="shop">과 스킬 습득 버튼 등 나머지 chrome은 각 호출부가 소유한다.
interface UpgradeShopListProps {
  gold: number;
  upgradeLevels: Record<UpgradeKey, number>;
  onBuy: (key: UpgradeKey) => void;
}

export default function UpgradeShopList({ gold, upgradeLevels, onBuy }: UpgradeShopListProps) {
  return (
    <>
      {(Object.keys(UPGRADES) as UpgradeKey[]).map((key) => {
        const u = UPGRADES[key];
        const cost = upgradeCost(key, upgradeLevels[key]);
        return (
          <li key={key}>
            <button disabled={gold < cost} onClick={() => onBuy(key)}>
              {u.name} <span className="lv">Lv.{upgradeLevels[key]}</span> +{u.delta} → {cost.toLocaleString()}G
            </button>
          </li>
        );
      })}
    </>
  );
}
