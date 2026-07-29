import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { registerAnims, dirOf, DIRS } from '../src/game/anims.ts';

// 실제 아틀라스 JSON으로 등록 로직을 돌린다. 프레임 이름 파싱이 틀리면 애니메이션이
// 조용히 0개 만들어지고 게임은 첫 프레임에서 얼어붙은 채로 굴러간다 — 여기서 잡는다.

interface FakeAnim {
  key: string;
  frames: { key: string; frame: string }[];
  frameRate: number;
  repeat: number;
}

// registerAnims가 쓰는 Phaser 표면만 흉내낸다 (textures.get().getFrameNames · anims.exists/create)
function fakeScene(atlases: Record<string, string[]>) {
  const created: FakeAnim[] = [];
  const scene = {
    textures: { get: (k: string) => ({ getFrameNames: () => atlases[k] ?? [] }) },
    anims: {
      exists: (k: string) => created.some((a) => a.key === k),
      create: (cfg: FakeAnim) => created.push(cfg),
    },
  };
  return { scene: scene as never, created };
}

const frameNames = (char: string) =>
  Object.keys(JSON.parse(readFileSync(`public/assets/character/${char}.json`, 'utf8')).frames);

const RIAN = frameNames('rian');
const GRIM = frameNames('grimhardt');

// ── 캐릭터마다 프레임 수가 달라도 아틀라스에서 읽어 등록한다 ──
{
  const { scene, created } = fakeScene({ rian: RIAN, grimhardt: GRIM });
  registerAnims(scene, 'rian');
  registerAnims(scene, 'grimhardt');
  const byKey = new Map(created.map((a) => [a.key, a]));

  for (const dir of DIRS) {
    assert.strictEqual(byKey.get(`rian-walk-${dir}`)?.frames.length, 4, `rian-walk-${dir}는 4프레임`);
    assert.strictEqual(byKey.get(`grimhardt-walk-${dir}`)?.frames.length, 6, `grimhardt-walk-${dir}는 6프레임`);
  }
  assert.strictEqual(byKey.get('rian-idle-south')?.frames.length, 4);
  assert.strictEqual(byKey.get('grimhardt-idle-south')?.frames.length, 4);
  // 두 캐릭터 모두 대기 모션은 남쪽만 있다 — 없는 방향까지 만들어내면 안 된다
  assert.ok(!byKey.has('rian-idle-north'), '없는 방향은 등록하지 않는다');

  // 정지컷(rotations/south)은 번호가 없으니 애니메이션이 아니다
  assert.ok(!created.some((a) => a.key.includes('rotations')), 'rotations는 애니메이션으로 잡히면 안 된다');

  // 프레임은 번호 순서대로 (문자열 정렬이면 10이 2보다 앞에 온다)
  assert.deepStrictEqual(
    byKey.get('grimhardt-walk-south')?.frames.map((f) => f.frame),
    [0, 1, 2, 3, 4, 5].map((i) => `walk/south/${i}`),
  );
  assert.strictEqual(byKey.get('rian-walk-south')?.repeat, -1, '걷기는 무한 반복');
}

// ── 두 자리 프레임 번호도 숫자 순서를 지킨다 ──
{
  const { scene, created } = fakeScene({
    x: Array.from({ length: 12 }, (_, i) => `walk/south/${i}`),
  });
  registerAnims(scene, 'x');
  assert.deepStrictEqual(
    created[0].frames.map((f) => f.frame),
    Array.from({ length: 12 }, (_, i) => `walk/south/${i}`),
    '10, 11이 1과 2 사이로 끼어들면 안 된다',
  );
}

// ── 씬이 재생성돼도 중복 등록하지 않는다 ──
{
  const { scene, created } = fakeScene({ rian: RIAN });
  registerAnims(scene, 'rian');
  const n = created.length;
  registerAnims(scene, 'rian');
  assert.strictEqual(created.length, n, '두 번 불러도 늘지 않는다');
}

// ── 서쪽 = 동쪽 + flipX ──
{
  assert.deepStrictEqual(dirOf('west'), ['east', true]);
  assert.deepStrictEqual(dirOf('east'), ['east', false]);
  assert.deepStrictEqual(dirOf('north'), ['north', false]);
  assert.deepStrictEqual(dirOf('south'), ['south', false]);
}

console.log('anims OK');
