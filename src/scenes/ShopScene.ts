import Phaser from 'phaser';
import { CANVAS } from '../game/layout.ts';
import { busBind } from '../game/events.ts';
import {
  MERCHANT_TEXTURE,
  MERCHANT_FLIP,
  SHOP_BG_TEXTURE,
  SHOP_BG_SIZE,
  SHOP_LAYOUT,
  type ShopLayout,
} from '../data/merchant.ts';

// 스테이지를 마치면 들어서는 던전 상점. 무대만 그리고 장사는 React가 한다 —
// 가격·재고·구매 버튼은 ui/UpgradeView.tsx가 이 캔버스 위에 얹는다(App이 upgrade 페이즈에 이 씬을 켠다).
// 상인은 화면 오른쪽에 서고 상품 그리드는 왼쪽에 깔린다 (styles.css .menu.upgrade).
// 배경은 전투 아레나(절차 타일맵)와 달리 그려진 그림 한 장이다 — 상점은 늘 같은 방이라 생성할 게 없다.
// 배치 수치는 data/merchant.ts의 SHOP_LAYOUT 한 곳에 있고, DEV 리모콘이 그걸 실시간으로 덮어쓴다.

const SHADOW = { w: 190, h: 40, alpha: 0.45 };
const BREATH = { grow: 1.02, ms: 1400 }; // 정지 그림이라 숨쉬기 트윈으로 덜 죽어 보이게

export default class ShopScene extends Phaser.Scene {
  private merchant?: Phaser.GameObjects.Image;
  private shadow?: Phaser.GameObjects.Ellipse;
  private dim?: Phaser.GameObjects.Rectangle;
  private breath?: Phaser.Tweens.Tween;

  constructor() {
    super('Shop');
  }

  create() {
    this.drawBackground();
    this.drawMerchant();
    this.applyLayout(SHOP_LAYOUT);
    // 리모콘으로 배치를 맞추는 동안 씬을 다시 켤 필요가 없게 — 프로덕션엔 emit하는 쪽이 아예 없다.
    if (import.meta.env.DEV) busBind(this, 'dev:shop-layout', (l) => this.applyLayout(l));
  }

  // 배경 한 장을 캔버스에 꽉 채운다. 늘려서 왜곡하느니 cover로 채우고 넘치는 쪽을 고르게 잘라낸다.
  // 배율은 실수 그대로 쓴다 — 원본이 1376×768이라 기본 창(1280×720)에선 거의 1:1이고,
  // 정수로 올리면 넓은 창에서 2배까지 튀어 세로가 절반 넘게 잘린다.
  private drawBackground() {
    if (!this.textures.exists(SHOP_BG_TEXTURE)) {
      console.warn(`[shop] 배경 텍스처(${SHOP_BG_TEXTURE})가 없어 건너뛴다 — 부트 에셋 로드를 확인`);
      return;
    }
    const scale = Math.max(CANVAS.W / SHOP_BG_SIZE.w, CANVAS.H / SHOP_BG_SIZE.h);
    this.add
      .image(CANVAS.W / 2, CANVAS.H / 2, SHOP_BG_TEXTURE)
      .setScale(scale)
      .setDepth(-10);
    // 메뉴 글자가 배경 밝은 부분에 묻히지 않게 한 겹 — 배경 위, 상인(기본 0) 아래.
    this.dim = this.add.rectangle(0, 0, CANVAS.W, CANVAS.H, 0x05050c).setOrigin(0).setDepth(-9);
  }

  private drawMerchant() {
    // 로드에 실패하면 상인 없이 배경만 — 없는 키로 그리면 초록 상자가 박힌다(BootScene과 같은 규칙).
    if (!this.textures.exists(MERCHANT_TEXTURE)) return;
    // 바닥 그림자 — 잘라낸 배경이라 발밑이 비면 허공에 뜬 것처럼 보인다
    this.shadow = this.add.ellipse(0, 0, SHADOW.w, SHADOW.h, 0x000000, SHADOW.alpha);
    this.merchant = this.add.image(0, 0, MERCHANT_TEXTURE).setOrigin(0.5, 1).setFlipX(MERCHANT_FLIP);
  }

  // 배치 반영. 초기 1회와 리모콘 조작이 같은 경로를 탄다 — 두 벌이면 슬라이더로 맞춘 그림과
  // 코드에 적어 넣은 값이 어긋난다.
  private applyLayout({ x, foot, scale, dim }: ShopLayout) {
    this.dim?.setFillStyle(0x05050c, dim);
    if (!this.merchant) return;
    const px = CANVAS.W * x;
    const py = CANVAS.H * foot;
    this.merchant.setPosition(px, py).setScale(scale);
    this.shadow?.setPosition(px, py);
    // 숨쉬기 트윈이 scaleY를 잡고 있어 그냥 두면 방금 준 배율을 곧바로 덮어쓴다 — 새 배율로 다시 건다.
    this.breath?.remove();
    this.breath = this.tweens.add({
      targets: this.merchant,
      scaleY: scale * BREATH.grow,
      duration: BREATH.ms,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
