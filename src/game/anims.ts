import type Phaser from 'phaser';
import type { Facing } from './battleSim.ts';

// 캐릭터 애니메이션 공용 계층. 아틀라스 프레임 이름은 scripts/pack.js가 `액션/방향/번호`로 통일해
// 뱉는다 (walk/south/0, idle/south/0 …). 여기서는 그 이름을 파싱해 애니메이션을 자동 등록한다 —
// 캐릭터·액션마다 프레임 수가 달라서(rian walk 4 · grimhardt walk 6) 표를 손으로 유지할 수 없다.

// 스프라이트는 3방향만 만든다. 서쪽은 동쪽의 좌우 반전.
export const DIRS = ['south', 'east', 'north'] as const;
export type Dir = (typeof DIRS)[number];

const FRAME_RATE: Record<string, number> = { walk: 10, idle: 6, attack: 18, rush: 12 }; // ponytail: 액션별 속도 knob
const DEFAULT_RATE = 8;

// 활시위를 놓는 순간 = attack 시트 7번 프레임 (고블린 궁수 기준 6번이 최대 당김, 7번에서 화살이
// 사라지고 시위가 튕겨 나간다). 화살을 만드는 건 시뮬(battleSim)이지만 그 타이밍은 아트가 정하므로
// 프레임 속도와 같은 자리에 둔다 — attack 속도를 바꾸면 발사 시각도 따라온다.
const ATTACK_RELEASE_FRAME = 7;
export const ATTACK_RELEASE_SEC = ATTACK_RELEASE_FRAME / FRAME_RATE.attack;

// 한 번 재생하고 끝나는 액션. 걷기·대기와 달리 "지금 벌어지는 사건"이라 반복하면 안 된다.
// 공격 9프레임 @18fps = 0.5초 — 기본 공격 주기(atkSpd 1.0 = 1초)의 절반이라 다음 휘두르기와
// 겹치지 않는다. 속공을 끝까지 올리면 겹치지만 그땐 재생이 처음부터 다시 시작될 뿐이다.
// rush(전력 질주)는 여기 없다 — 돌진하는 내내 도는 이동 루프라 걷기와 같은 성격이다.
const ONCE = new Set(['attack', 'fireball', 'throwing']);

// 1탄 보스 사르가스는 패턴마다 전용 모션이 있고, 그 모션의 특정 프레임이 곧 공격 판정 시각이다 —
// 돌을 머리 위로 들어 올린 마지막 프레임에서 투척이, 뛰어올라 착지하는 프레임에서 스톰핑이 터진다.
// 그래서 재생 속도를 액션 공용 표에서 가져오지 않고 "터지는 프레임까지 몇 초"에서 역산한다.
// 아트가 타이밍의 주인이라는 점은 ATTACK_RELEASE_SEC과 같은 원칙 — battleSim의 GOLEM_ROCK_WINDUP·
// GOLEM_STOMP_WINDUP이 아래 두 값을 그대로 읽어 쓴다. 그래야 텔레그래프 길이 = 모션 길이가 된다.
export const SARGAS_THROW_RELEASE_SEC = 0.9; // ponytail: 던지기 예고 시간 knob
export const SARGAS_STOMP_LAND_SEC = 0.7; // ponytail: 스톰핑 예고 시간 knob
const SARGAS_THROW_HOLD_FRAME = 8; // 돌을 머리 위로 든 자세 (throwing 마지막 프레임)
const SARGAS_STOMP_LAND_FRAME = 6; // 착지 = 지면 충격 (attack 9프레임 중 6번, 뒤 둘은 흙먼지)

// `아틀라스키-액션` → 재생 속도. 액션 공용 FRAME_RATE보다 우선한다.
const RATE_OVERRIDE: Record<string, number> = {
  'sargas-throwing': SARGAS_THROW_HOLD_FRAME / SARGAS_THROW_RELEASE_SEC,
  'sargas-attack': SARGAS_STOMP_LAND_FRAME / SARGAS_STOMP_LAND_SEC,
};

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
    const action = group.split('/')[0];
    scene.anims.create({
      key: animKey,
      frames: idx.sort((a, b) => a - b).map((i) => ({ key, frame: `${group}/${i}` })),
      frameRate: RATE_OVERRIDE[`${key}-${action}`] ?? FRAME_RATE[action] ?? DEFAULT_RATE,
      repeat: ONCE.has(action) ? 0 : -1,
    });
  }
}

// 1회성 모션이 아직 도는 중인가. Phaser는 repeat 0짜리가 끝나면 isPlaying을 내리므로
// 별도 타이머를 들고 다닐 필요가 없다 — 애니메이션 길이가 곧 잠금 시간이다.
function busy(spr: Phaser.GameObjects.Sprite): boolean {
  return !!spr.anims?.isPlaying && spr.anims.currentAnim?.repeat === 0;
}

// 없는 방향은 south로 대체하지 않는다 — 북쪽으로 걷다 멈췄을 때 갑자기 정면을 보게 된다.
// 대신 그 방향 걷기 0번 프레임에서 멈춘다 (숨쉬기 트윈이 정지 상태를 덜 죽어 보이게 한다).
// char가 없는(=대체 상자) 스프라이트는 그냥 넘긴다 — 상자는 애니메이션이 없다.
export function playAnim(spr: Phaser.GameObjects.Sprite, key: string | undefined, action: string, dir: Dir) {
  if (!key || busy(spr)) return; // 휘두르는 중엔 걷기·대기가 덮어쓰지 못한다
  const want = `${key}-${action}-${dir}`;
  if (spr.scene.anims.exists(want))
    spr.play(want, true); // true = 같은 키면 재시작 안 함
  else spr.stop().setFrame(`walk/${dir}/0`);
}

// 공격처럼 한 번 재생하고 끝나는 모션. playAnim과 달리 매번 처음부터 다시 시작한다 —
// 연타 중에도 휘두를 때마다 눈에 보여야 하기 때문이다(재시작 안 하면 두 번째 공격이 묻힌다).
// 그 액션·방향 아트가 없으면 아무것도 하지 않는다: 등급마다 모션 구성이 다르고
// (rian-basic엔 공격 아트가 없다) 없다고 걷기를 끊어 세우면 그게 더 눈에 띈다.
export function playOnce(spr: Phaser.GameObjects.Sprite, key: string | undefined, action: string, dir: Dir) {
  if (!key) return;
  const want = `${key}-${action}-${dir}`;
  if (spr.scene.anims.exists(want)) spr.play(want);
}

// idle 시트 한 장으로 온 캐릭터(일반 몬스터). 아트에 방향도 액션도 없으니 런타임이 무엇을
// 물어도 같은 프레임을 돌려준다 — 조합을 전부 등록해 두면 playAnim·BattleScene은 아틀라스
// 캐릭터와 똑같이 굴러간다. 프레임 순서 = 시트의 가로 순서.
export function registerSheetAnims(scene: Phaser.Scene, key: string) {
  const frames = scene.anims.generateFrameNumbers(key, {});
  for (const action of ['walk', 'idle'])
    for (const dir of DIRS) {
      const animKey = `${key}-${action}-${dir}`;
      if (!scene.anims.exists(animKey))
        scene.anims.create({ key: animKey, frames, frameRate: FRAME_RATE.idle, repeat: -1 });
    }
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
  // 시트 캐릭터는 프레임 이름이 번호뿐이다 — walk/south/0을 달라고 하면 Phaser가 시트 전체를
  // 한 장으로 그린다. 그 이름이 없으면 첫 프레임으로 시작한다.
  if (char && scene.textures.exists(char)) {
    const first = scene.textures.get(char).has('walk/south/0') ? 'walk/south/0' : undefined;
    return { spr: scene.add.sprite(x, y, char, first), char };
  }
  return { spr: scene.add.sprite(x, y, boxTexture).setDisplaySize(boxSize, boxSize) };
}
