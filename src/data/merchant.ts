import { drawCards, type Card, type Rarity } from './cards.ts';
import type { TraitId } from './traits.ts';

// 스테이지를 마치면 노점을 펴는 고블린 상인 — 육성 화면(UpgradeView)의 주인이다.
// 도네이션 룰렛이 "운으로 받는" 카드라면, 상인은 같은 카드를 "골드로 골라 사는" 창구.
// 카드 정의·뽑기·적용은 전부 cards.ts / store.grantCard 경로를 그대로 쓴다 — 여기 있는 건
// 재고 규칙(등급 풀·가격)과 무대 배치뿐이다.

// 재고 등급 풀: 노멀급 제외(reactionCard와 같은 규칙). 값을 치르고 사는 물건이라
// 흔한 카드만 깔리면 강화 5종을 두고 여기 올 이유가 없다.
const STOCK_POOL: Rarity[] = ['uncommon', 'magic', 'epic', 'legend'];
export const STOCK_SIZE = 6; // 3×2 정사각 좌판 — 칸 수가 곧 레이아웃이라 UI와 함께 움직인다

// ponytail: 가격 knob — 강화 5종(180~300G)보다 비싸고 등급마다 두 배 이상 뛴다.
// common은 재고에 안 깔리지만(STOCK_POOL) 가격표에 구멍은 두지 않는다.
// prettier-ignore
export const CARD_PRICE: Record<Rarity, number> = {
  common: 250, uncommon: 550, magic: 1200, epic: 2600, legend: 5500,
};

export const cardPrice = (card: Card) => CARD_PRICE[card.rarity];

// 화마다 새로 까는 재고. 이미 보유한 특성은 drawCards가 알아서 뺀다(중복 구매 방지).
export const rollStock = (ownedTraits: TraitId[] = [], rnd: () => number = Math.random): Card[] =>
  drawCards(STOCK_SIZE, ownedTraits, rnd, STOCK_POOL);

// 상점 무대 텍스처. 캐릭터 아틀라스(assets/character/)가 아니라 낱장 그림이라 BootScene이
// 별도로 로드한다 — 상인은 방향도 액션도 없는 정면 한 장이고, 배경은 통짜 한 장이다.
// 애니메이션 아틀라스로 갈아끼울 땐 ShopScene의 idle 분기를 보라.
export const MERCHANT_TEXTURE = 'shop-merchant';
export const SHOP_BG_TEXTURE = 'shop-bg';
export const SHOP_ASSETS: Record<string, string> = {
  [MERCHANT_TEXTURE]: 'assets/shop/merchant.png',
  [SHOP_BG_TEXTURE]: 'assets/shop/shop-bg.png',
};
// 배경 원본 크기 — 캔버스를 덮을 배율을 여기서 역산한다 (ShopScene).
// 캔버스 기본(1280×720)과 비율이 거의 같아 기본 창에선 잘리는 데가 거의 없다.
export const SHOP_BG_SIZE = { w: 1376, h: 768 };

// 상점 무대 배치. 전부 캔버스 비율 기준이라 창 폭(1280~2560)이 달라져도 따라간다.
// 눈으로 맞춰야 하는 값이라 DEV 리모콘(ui/DevPanel.tsx)이 슬라이더로 실시간 덮어쓴다 —
// 마음에 드는 값이 나오면 패널에 뜨는 한 줄을 여기 그대로 옮겨 적으면 고정된다.
export interface ShopLayout {
  x: number; // 상인 가로 위치 (캔버스 폭 비율). 왼쪽 상품 그리드를 가리지 않게 오른쪽에 선다
  foot: number; // 발이 닿는 높이 (캔버스 높이 비율)
  scale: number; // 상인 배율. 원본 1024px 기준이라 0.5 = 512px
  dim: number; // 배경 위에 덮는 어둠 — 메뉴 글자가 밝은 배경에 묻히지 않게
}
// x는 뻗은 손끝이 화면 오른쪽 끝에서 ~50px 떨어지는 자리 (기본 창 1280 기준).
export const SHOP_LAYOUT: ShopLayout = { x: 0.88, foot: 0.94, scale: 0.35, dim: 0.25 };

// 상인 그림은 오른손을 뻗고 있다 — 좌우로 뒤집으면 왼쪽에 깔린 상품 그리드를 가리키는 모양이 된다.
export const MERCHANT_FLIP = true;
