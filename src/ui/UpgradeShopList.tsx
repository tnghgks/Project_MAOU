import { UPGRADES, upgradeCost, statOf, type UpgradeKey } from '../data/upgrades.ts';
import type { HeroStats } from '../game/store.ts';

// 강화 목록 행(<li>)만 공유 — 상점(ShopPanel)과 육성(UpgradeView)이 동일하게 쓴다.
// <ul className="shop">과 스킬 습득 버튼 등 나머지 chrome은 각 호출부가 소유한다.
interface UpgradeShopListProps {
  gold: number;
  upgradeLevels: Record<UpgradeKey, number>;
  hero: HeroStats; // 현재 값 표시용 — 도네 카드 상승분은 Lv에 안 잡힌다
  onBuy: (key: UpgradeKey) => void;
}

export default function UpgradeShopList({ gold, upgradeLevels, hero, onBuy }: UpgradeShopListProps) {
  return (
    <>
      {(Object.keys(UPGRADES) as UpgradeKey[]).map((key) => {
        const u = UPGRADES[key];
        const cost = upgradeCost(key, upgradeLevels[key]);
        return (
          <li key={key}>
            <button disabled={gold < cost} onClick={() => onBuy(key)}>
              {u.name} <span className="lv">Lv.{upgradeLevels[key]}</span>{' '}
              <span className="cur">{statOf(key, hero)}</span> +{u.delta} → {cost.toLocaleString()}G
            </button>
          </li>
        );
      })}
    </>
  );
}
