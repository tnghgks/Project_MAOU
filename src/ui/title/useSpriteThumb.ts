import { useEffect, useState } from 'react';

// 해금 도감 썸네일: 게임에 실제로 쓰는 스프라이트를 그대로 잘라 보여준다.
// 몬스터 아트는 두 형태로 들어온다(monsters.ts 참고) —
//   sheet 있음: public/assets/character/<char>.png 가로 한 줄 시트, 첫 칸이 대표 프레임
//   sheet 없음: 같은 이름의 .json 아틀라스, 프레임 좌표를 읽어야 한 칸을 집을 수 있다
// 실패하면 null을 돌려주고 카드가 잠금 문양으로 떨어진다 — 도감 때문에 화면이 깨지면 안 된다.

export interface SpriteThumb {
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// 대표 프레임 우선순위. 아틀라스마다 갖고 있는 액션이 달라(idle이 없는 보스도 있다) 순서대로 찾는다.
const FRAME_ORDER = ['idle/south/0', 'idle/east/0', 'rotations/south', 'rotations/east', 'attack/east/0'];

interface AtlasFrame {
  frame?: { x?: number; y?: number; w?: number; h?: number };
}

// 도감을 여닫을 때마다 같은 json을 다시 받지 않게. 실패(null)도 캐시해 재시도 폭주를 막는다.
const cache = new Map<string, SpriteThumb | null>();

function parseAtlas(url: string, json: unknown): SpriteThumb | null {
  const frames = (json as { frames?: Record<string, AtlasFrame> } | null)?.frames;
  if (!frames) return null;
  const key = FRAME_ORDER.find((k) => frames[k]) ?? Object.keys(frames)[0];
  const f = key ? frames[key]?.frame : undefined;
  if (!f?.w || !f.h) return null;
  return { url, x: f.x ?? 0, y: f.y ?? 0, w: f.w, h: f.h };
}

export function useSpriteThumb(char: string | undefined, sheet: number | undefined): SpriteThumb | null {
  const [thumb, setThumb] = useState<SpriteThumb | null>(null);

  useEffect(() => {
    if (!char) {
      setThumb(null);
      return;
    }
    const base = import.meta.env.BASE_URL;
    const png = `${base}assets/character/${char}.png`;

    // 시트형은 첫 칸이 곧 대표 프레임이라 네트워크를 탈 이유가 없다
    if (sheet) {
      setThumb({ url: png, x: 0, y: 0, w: sheet, h: sheet });
      return;
    }

    const cached = cache.get(char);
    if (cached !== undefined) {
      setThumb(cached);
      return;
    }

    let alive = true;
    void fetch(`${base}assets/character/${char}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => parseAtlas(png, json))
      .catch(() => null) // 아트가 아직 없는 몬스터 — 도감은 잠금 문양으로 계속 돈다
      .then((t) => {
        cache.set(char, t);
        if (alive) setThumb(t);
      });
    return () => {
      alive = false;
    };
  }, [char, sheet]);

  return thumb;
}
