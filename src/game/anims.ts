import type Phaser from 'phaser';
import type { Facing } from './battleSim.ts';

// 캐릭터 애니메이션 공용 계층. 아틀라스 프레임 이름은 scripts/pack.js가 `액션/방향/번호`로 통일해
// 뱉는다 (walk/south/0, idle/south/0 …). 여기서는 그 이름을 파싱해 애니메이션을 자동 등록한다 —
// 캐릭터·액션마다 프레임 수가 달라서(rian walk 4 · grimhardt walk 6) 표를 손으로 유지할 수 없다.

// 스프라이트는 3방향만 만든다. 서쪽은 동쪽의 좌우 반전.
export const DIRS = ['south', 'east', 'north'] as const;
export type Dir = (typeof DIRS)[number];

const FRAME_RATE: Record<string, number> = { walk: 10, idle: 6 }; // ponytail: 액션별 속도 knob
const DEFAULT_RATE = 8;

// 서쪽 = 동쪽 프레임 + flipX. `[방향, 반전여부]`.
export function dirOf(facing: Facing): [Dir, boolean] {
  return facing === 'west' ? ['east', true] : [facing, false];
}

// 아틀라스에 실제로 들어있는 프레임에서 액션·방향·길이를 읽어 애니메이션을 만든다.
// 애니메이션은 게임 전역이라 씬이 재생성돼도 한 번만 등록된다 (exists 가드).
export function registerAnims(scene: Phaser.Scene, key: string) {
  const groups = new Map<string, number[]>(); // `액션/방향` → 프레임 번호들
  for (const name of scene.textures.get(key).getFrameNames()) {
    const m = /^([^/]+)\/([^/]+)\/(\d+)$/.exec(name); // rotations/south 같은 정지컷은 안 걸린다
    if (m) groups.set(`${m[1]}/${m[2]}`, [...(groups.get(`${m[1]}/${m[2]}`) ?? []), Number(m[3])]);
  }
  for (const [group, idx] of groups) {
    const animKey = `${key}-${group.replace('/', '-')}`; // rian-walk-south
    if (scene.anims.exists(animKey)) continue;
    scene.anims.create({
      key: animKey,
      frames: idx.sort((a, b) => a - b).map((i) => ({ key, frame: `${group}/${i}` })),
      frameRate: FRAME_RATE[group.split('/')[0]] ?? DEFAULT_RATE,
      repeat: -1,
    });
  }
}

// 없는 방향은 south로 대체하지 않는다 — 북쪽으로 걷다 멈췄을 때 갑자기 정면을 보게 된다.
// 대신 그 방향 걷기 0번 프레임에서 멈춘다 (숨쉬기 트윈이 정지 상태를 덜 죽어 보이게 한다).
// char가 없는(=대체 상자) 스프라이트는 그냥 넘긴다 — 상자는 애니메이션이 없다.
export function playAnim(spr: Phaser.GameObjects.Sprite, key: string | undefined, action: string, dir: Dir) {
  if (!key) return;
  const want = `${key}-${action}-${dir}`;
  if (spr.scene.anims.exists(want))
    spr.play(want, true); // true = 같은 키면 재시작 안 함
  else spr.stop().setFrame(`walk/${dir}/0`);
}

// 캐릭터 스프라이트 하나. 아틀라스가 로드돼 있으면 원본 크기 그대로(리샘플 없음 = pixelArt에서
// 가장 깨끗하다), 없으면 boxSize 크기의 대체 상자. 반환된 `char`가 undefined면 상자다.
export function makeActor(
  scene: Phaser.Scene,
  x: number,
  y: number,
  char: string | undefined,
  boxSize: number,
  boxTexture: string,
): { spr: Phaser.GameObjects.Sprite; char?: string } {
  if (char && scene.textures.exists(char)) return { spr: scene.add.sprite(x, y, char, 'walk/south/0'), char };
  return { spr: scene.add.sprite(x, y, boxTexture).setDisplaySize(boxSize, boxSize) };
}
