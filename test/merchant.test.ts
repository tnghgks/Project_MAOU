import assert from 'node:assert';
import { readFileSync } from 'node:fs';

// localStorage 스텁 (store가 import 시점에 만지진 않지만 buyCard→grantTrait 경로가 안전하도록)
const saved: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (k: string) => (k in saved ? saved[k] : null),
  setItem: (k: string, v: string) => {
    saved[k] = String(v);
  },
  removeItem: (k: string) => {
    delete saved[k];
  },
} as Storage;

const { CARD_PRICE, STOCK_SIZE, cardPrice, rollStock, SHOP_ASSETS, SHOP_BG_SIZE } =
  await import('../src/data/merchant.ts');
const { RARITY, statCard, traitCard } = await import('../src/data/cards.ts');
const { gameStore, gameState, BASE_HERO } = await import('../src/game/store.ts');

// ── 가격표: 모든 등급에 값이 있고, 등급이 오르면 값도 오른다 ──
const rarities = Object.keys(RARITY) as (keyof typeof RARITY)[];
for (const r of rarities) assert.ok(CARD_PRICE[r] > 0, `${r} 가격이 비었다`);
const byStars = [...rarities].sort((a, b) => RARITY[a].stars - RARITY[b].stars);
for (let i = 1; i < byStars.length; i++)
  assert.ok(CARD_PRICE[byStars[i]] > CARD_PRICE[byStars[i - 1]], `${byStars[i]} 가격이 하위 등급보다 싸다`);

// ── 재고: 정해진 수만큼, 노멀급은 안 깔린다 ──
const stock = rollStock([]);
assert.strictEqual(stock.length, STOCK_SIZE);
for (const c of stock) {
  assert.notStrictEqual(c.rarity, 'common', '상인 재고에 노멀급이 깔렸다');
  assert.strictEqual(cardPrice(c), CARD_PRICE[c.rarity]);
}

// 이미 보유한 특성은 재고에서 빠진다 (중복 구매 방지) — 특성만 있는 등급으로 확인
for (let i = 0; i < 200; i++)
  assert.ok(!rollStock(['berserk']).some((c) => c.trait === 'berserk'), '보유 특성이 재고에 다시 깔렸다');

// ── 상점 에셋: 파일이 실제로 있고, 배경 크기 상수가 PNG 헤더와 일치하는지.
// BootScene은 로드 실패를 경고만 하고 넘어가므로 여기서 안 잡으면 상점이 조용히 빈 화면이 된다.
// 크기 상수는 ShopScene이 cover 배율을 역산하는 데 쓴다 — 어긋나면 배경에 여백이 생긴다.
for (const [key, path] of Object.entries(SHOP_ASSETS)) {
  const png = readFileSync(`public/${path}`);
  assert.strictEqual(png.toString('ascii', 1, 4), 'PNG', `${key}: ${path}가 PNG가 아니다`);
  if (key !== 'shop-bg') continue;
  assert.strictEqual(png.readUInt32BE(16), SHOP_BG_SIZE.w, 'SHOP_BG_SIZE.w가 실제 배경 폭과 다르다');
  assert.strictEqual(png.readUInt32BE(20), SHOP_BG_SIZE.h, 'SHOP_BG_SIZE.h가 실제 배경 높이와 다르다');
}

// ── buyCard: 골드 부족이면 실패, 성공이면 골드 차감 + 스탯/특성 반영 ──
const statPick = statCard('sharpBlade'); // 날카로운 칼날: 기본 공격력 +10%
gameStore.setState({ gold: 0, hero: { ...BASE_HERO }, traits: [] });
assert.strictEqual(gameState().buyCard(statPick, 500), false);
assert.strictEqual(gameState().gold, 0, '실패했는데 골드가 빠졌다');
assert.strictEqual(gameState().hero.atk, BASE_HERO.atk, '실패했는데 스탯이 올랐다');

gameStore.setState({ gold: 800 });
assert.strictEqual(gameState().buyCard(statPick, 500), true);
assert.strictEqual(gameState().gold, 300);
assert.ok(gameState().hero.atk > BASE_HERO.atk, '스탯 카드를 샀는데 스탯이 그대로다');

// 특성 카드는 스탯이 아니라 traits로 들어간다
const traitPick = traitCard('berserk');
gameStore.setState({ gold: 3000, traits: [], hero: { ...BASE_HERO } });
assert.strictEqual(gameState().buyCard(traitPick, 2600), true);
assert.deepStrictEqual(gameState().traits, ['berserk']);
assert.strictEqual(gameState().gold, 400);
assert.strictEqual(gameState().hero.atk, BASE_HERO.atk, '특성 카드가 스탯까지 건드렸다');

console.log('merchant.test.ts ok');
