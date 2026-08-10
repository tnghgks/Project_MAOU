import { useSpriteThumb, type SpriteThumb } from './useSpriteThumb.ts';
import { MONSTERS, type MonsterId, type MonsterDef } from '../data/monsters.ts';

// 게임에 실제로 쓰는 스프라이트를 상자 하나에 담아 보여주는 공용 조각.
// 원래 UnlockPanel 안에 파일 로컬로 있었는데 웨이브 편성 화면이 같은 그림을 써야 해서 꺼냈다 —
// 편성에서 이모지(🟢🏹)를 쓰면 방송에 나오는 몬스터와 아무 관계가 없어 편성 판단이 겉돈다.

export const THUMB_BOX = 72; // 썸네일 한 변(px). 원본 프레임(32~220px)을 이 상자에 맞춰 축소한다

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

interface SpriteBoxProps {
  /** monsters.ts의 char (아틀라스/시트 이름). 없으면 glyph로 떨어진다 */
  char?: string;
  /** 가로 한 줄 시트인 경우 프레임 한 칸 크기(px) */
  sheet?: number;
  /** monsters.ts의 tint. 인게임 Phaser setTint와 같은 곱연산으로 재현한다 */
  tint?: number;
  /** 표시 배율(monsters.ts의 scale). 사이클롭스처럼 원본이 작은 아트를 인게임 비율로 보이게 한다 */
  scale?: number;
  /** 스프라이트를 못 구했을 때 대신 띄울 글자 */
  glyph?: string;
  /** 상자 한 변(px). 좁은 칩에서는 작게 쓴다 */
  box?: number;
  className?: string;
}

/** 스프라이트를 이미 손에 쥔 경우용 — 훅을 호출부에서 부르는 화면(도감)이 쓴다. */
export function SpriteFrame({
  thumb,
  tint,
  scale = 1,
  glyph,
  box = THUMB_BOX,
  className,
}: Omit<SpriteBoxProps, 'char' | 'sheet'> & { thumb: SpriteThumb | null }) {
  const style = { width: box, height: box };
  if (!thumb) {
    return (
      <span className={className ? `px-thumb ${className}` : 'px-thumb'} style={style}>
        <span className="px-thumb-glyph" style={{ fontSize: box * 0.36, lineHeight: `${box}px` }}>
          {glyph ?? '?'}
        </span>
      </span>
    );
  }
  // 원본 프레임을 상자 안에 통째로 넣는 배율. 시트 좌표를 그대로 쓰려면 background-size를 못 건드리므로
  // (원본 이미지 전체 크기를 모른다) 안쪽 요소를 1:1로 깔고 transform으로 줄인다.
  // monsters.ts의 scale을 곱해 인게임 상대 크기(사이클롭스가 슬라임보다 크다)를 살리되, 1.6에서
  // 물려 큰 놈이 상자를 뚫고 나가지 않게 한다.
  const fit = (box / Math.max(thumb.w, thumb.h)) * Math.min(1.6, scale);
  const k = Math.round(fit * 100) / 100;
  const layer = {
    width: thumb.w,
    height: thumb.h,
    transform: `translate(-50%, -50%) scale(${k})`,
  };

  return (
    <span className={className ? `px-thumb ${className}` : 'px-thumb'} style={style}>
      <span
        className="px-thumb-in"
        style={{
          ...layer,
          backgroundImage: `url(${thumb.url})`,
          backgroundPosition: `${-thumb.x}px ${-thumb.y}px`,
        }}
      />
      {/* 틴트는 스프라이트 알파를 마스크로 쓴 색 레이어다(pixel.css .px-thumb-tint가 multiply를 건다).
          같은 아틀라스를 tint로 재활용하는 몬스터(분열 슬라임·주술사·저격수)가 편성 화면에서
          원본과 똑같아 보이면 안 되기 때문이다. */}
      {tint !== undefined && (
        <span
          className="px-thumb-tint"
          style={{
            ...layer,
            backgroundColor: hex(tint),
            WebkitMaskImage: `url(${thumb.url})`,
            maskImage: `url(${thumb.url})`,
            WebkitMaskPosition: `${-thumb.x}px ${-thumb.y}px`,
            maskPosition: `${-thumb.x}px ${-thumb.y}px`,
          }}
        />
      )}
    </span>
  );
}

/** char/sheet만 넘기면 알아서 받아 그린다. 대부분의 호출부는 이쪽을 쓴다. */
export default function SpriteBox({ char, sheet, ...rest }: SpriteBoxProps) {
  const thumb = useSpriteThumb(char, sheet);
  return <SpriteFrame thumb={thumb} {...rest} />;
}

/** 몬스터 id 하나로 인게임과 같은 그림을 그린다(tint·scale 포함).
 *  편성 화면(LineupView)에 파일 로컬로 있었는데, 방송 중 다음 웨이브 예고(SummonPanel)가 같은 그림을
 *  써야 해서 꺼냈다 — 편성에서 본 그림과 방송에서 보는 그림이 다르면 예고가 예고 구실을 못 한다.
 *  MonsterDef로 좁혀 받는 건 MONSTERS가 satisfies라 줄마다 리터럴 타입이 유니온으로 남기 때문이다
 *  (선택적 필드를 안 가진 몬스터가 섞이면 유니온 접근이 막힌다). */
export function MonsterArt({ id, box }: { id: MonsterId; box: number }) {
  const def: MonsterDef = MONSTERS[id];
  return (
    <SpriteBox
      char={def.char}
      sheet={def.sheet}
      tint={def.tint}
      scale={def.scale}
      box={box}
      glyph={def.name.slice(0, 1)}
    />
  );
}
