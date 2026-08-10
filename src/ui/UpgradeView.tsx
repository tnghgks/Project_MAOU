import { useState, type CSSProperties } from 'react';
import { useStore } from 'zustand';
import { gameStore, gameState } from '../game/store.ts';
import { playSfx } from '../game/sfx.ts';
import { FINAL_EP } from '../data/progression.ts';
import { stageCut } from '../data/cutscenes.ts';
import { RARITY, type Card } from '../data/cards.ts';
import { cardPrice, rollStock, STOCK_SIZE } from '../data/merchant.ts';
import { useBusEvent } from './useBusEvent.ts';

// 상인 본체(반전 스프라이트)와 던전 배경은 캔버스 담당 — scenes/ShopScene.ts가 화면 오른쪽에 세운다.
// 여기선 그 위에 얹히는 장사 UI만 그린다: 말풍선 + 3×2 좌판, 전부 왼쪽 정렬.

// 카드 이름은 `${아이콘} ${이름}` 한 덩어리로 온다(cards.ts statCard/traitCard).
// 정사각 칸에서는 아이콘을 크게 띄워야 해서 첫 토큰만 떼어낸다 — 데이터 구조를 건드리는 것보다 싸다.
const splitIcon = (name: string): [string, string] => {
  const i = name.indexOf(' ');
  return i < 0 ? ['', name] : [name.slice(0, i), name.slice(i + 1)];
};

export default function UpgradeView() {
  const { gold, skills, episode } = useStore(gameStore, (s) => ({
    gold: s.gold,
    skills: s.skills,
    episode: s.episode,
  }));
  // 재고는 화면에 들어올 때 한 번만 깐다 — 이 뷰는 upgrade 페이즈 동안만 마운트되므로
  // 화가 바뀌면 자연히 새 재고가 깔리고, 리렌더마다 물건이 바뀌는 일은 없다.
  const [stock, setStock] = useState<Card[]>(() => rollStock(gameState().traits));
  // 팔린 칸은 목록에서 빼지 않고 자리만 비운다 — 좌판은 늘 3×2라 한 칸이 사라지면 격자가 깨진다.
  // 인덱스로 잡는 이유: 같은 등급 풀이 얕으면 드물게 같은 카드가 두 칸에 깔릴 수 있다(id는 겹친다).
  const [sold, setSold] = useState<number[]>([]);
  // DEV 리모콘의 "재고 리롤" — 등급 조합을 보려고 육성 화면을 껐다 켜지 않아도 되게.
  // 프로덕션엔 emit하는 쪽(DevPanel)이 통째로 빠지므로 죽은 구독으로 남는다.
  useBusEvent('dev:reroll-stock', () => {
    setStock(rollStock(gameState().traits));
    setSold([]);
  });
  const nextEp = episode + 1;

  const buyCard = (card: Card, i: number) => {
    if (!gameState().buyCard(card, cardPrice(card))) return; // 골드가 모자라면 소리도 안 난다
    playSfx('buy');
    setSold([...sold, i]);
  };
  const next = () => {
    playSfx('uiSelect');
    gameState().nextEpisode();
    // 웨이브 편성 → 스테이지 진입 컷씬 → 방송. 컷씬은 여기서 안 튼다 — 편성을 마친 뒤
    // LineupView가 이어서 재생한다(컷씬이 곧 "이제 들어간다"는 신호라 편성보다 뒤여야 한다).
    // 최종화만 편성을 건너뛴다: 마왕전은 소환·웨이브·도네이션이 전부 막힌 순수 실력전이라
    // (BattleScene.isFinal) 편성할 게 없어서, 예전처럼 컷씬 → 방송으로 직행한다.
    if (nextEp >= FINAL_EP) {
      gameState().playCuts(stageCut(nextEp), () => gameState().setPhase('broadcast'));
      return;
    }
    gameState().setPhase('lineup');
  };

  return (
    <div className="menu upgrade">
      <p className="gold">보유 골드 {Math.floor(gold).toLocaleString()}G</p>

      <ul className="shop merchant-stock">
        {/* 칸 수는 늘 STOCK_SIZE — 재고가 모자라도 빈 칸을 깔아 격자를 유지한다 */}
        {Array.from({ length: STOCK_SIZE }, (_, i) => {
          const c = stock[i];
          if (!c) return <li key={i} className="slot-empty" />;
          const [icon, name] = splitIcon(c.name);
          const cost = cardPrice(c);
          const isSold = sold.includes(i);
          return (
            <li key={i}>
              <button
                className={isSold ? 'card sold' : 'card'}
                style={{ '--rar': RARITY[c.rarity].color } as CSSProperties}
                disabled={isSold || gold < cost}
                onClick={() => buyCard(c, i)}
                title={c.desc} /* 정사각 칸엔 설명이 안 들어간다 — 마우스를 올리면 나온다 */
              >
                <span className="card-icon">{icon}</span>
                <span className="card-name">{name}</span>
                <span className="card-rarity">{RARITY[c.rarity].label}</span>
                <span className="card-cost">{isSold ? '품절' : `${cost.toLocaleString()}G`}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="owned">보유 스킬: {skills.join(', ')}</p>
      <button className="cta" onClick={next}>
        {nextEp >= FINAL_EP ? '⚔ 최종화: 마왕 vs 용사' : `▶ ${nextEp}화 방송 시작`}
      </button>
    </div>
  );
}
