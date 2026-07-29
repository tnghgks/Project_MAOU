import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { registerAnims, dirOf, makeActor, playAnim, playOnce, DIRS } from '../src/game/anims.ts';

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

const BASIC = frameNames('rian-basic');
const WOODEN = frameNames('rian-wooden');
const GRIM = frameNames('grimhardt');

// ── 캐릭터마다 프레임 수가 달라도 아틀라스에서 읽어 등록한다 ──
{
  const { scene, created } = fakeScene({ 'rian-basic': BASIC, grimhardt: GRIM });
  registerAnims(scene, 'rian-basic');
  registerAnims(scene, 'grimhardt');
  const byKey = new Map(created.map((a) => [a.key, a]));

  for (const dir of DIRS) {
    assert.strictEqual(byKey.get(`rian-basic-walk-${dir}`)?.frames.length, 4, `rian-basic-walk-${dir}는 4프레임`);
    assert.strictEqual(byKey.get(`grimhardt-walk-${dir}`)?.frames.length, 6, `grimhardt-walk-${dir}는 6프레임`);
  }
  assert.strictEqual(byKey.get('rian-basic-idle-south')?.frames.length, 4);
  assert.strictEqual(byKey.get('grimhardt-idle-south')?.frames.length, 4);
  // 두 캐릭터 모두 대기 모션은 남쪽만 있다 — 없는 방향까지 만들어내면 안 된다
  assert.ok(!byKey.has('rian-basic-idle-north'), '없는 방향은 등록하지 않는다');

  // 정지컷(rotations/south)은 번호가 없으니 애니메이션이 아니다
  assert.ok(!created.some((a) => a.key.includes('rotations')), 'rotations는 애니메이션으로 잡히면 안 된다');

  // 프레임은 번호 순서대로 (문자열 정렬이면 10이 2보다 앞에 온다)
  assert.deepStrictEqual(
    byKey.get('grimhardt-walk-south')?.frames.map((f) => f.frame),
    [0, 1, 2, 3, 4, 5].map((i) => `walk/south/${i}`),
  );
  assert.strictEqual(byKey.get('rian-basic-walk-south')?.repeat, -1, '걷기는 무한 반복');
}

// ── 장비 등급은 아틀라스만 다르고 프레임 이름은 같다 ──
// 등급 교체가 "아틀라스 키 한 줄"로 끝나려면 이게 유일한 전제다. 다음 등급(rian-iron)을
// 넣었을 때 액션·방향 조합이 어긋나면 그 방향만 조용히 멈추므로 여기서 잡는다.
{
  const moves = (names: string[]) =>
    new Set(
      names
        .filter((n) => n.startsWith('walk/') || n.startsWith('idle/'))
        .map((n) => n.split('/').slice(0, 2).join('/')), // 등급마다 프레임 수는 달라도 된다
    );
  for (const m of moves(BASIC))
    assert.ok(moves(WOODEN).has(m), `rian-wooden에 ${m}이 없다 — 등급을 바꾸면 그 방향이 멈춘다`);

  const { scene, created } = fakeScene({ 'rian-wooden': WOODEN });
  registerAnims(scene, 'rian-wooden');
  const byKey = new Map(created.map((a) => [a.key, a]));
  assert.strictEqual(byKey.get('rian-wooden-walk-north')?.frames.length, 9);
  assert.strictEqual(byKey.get('rian-wooden-idle-north')?.frames.length, 8);
  // 같은 방향을 두 번 뽑은 테이크(south-48068658 · south-49dfbf87)는 한쪽만 들어간다.
  // 섞이면 번호가 0..6에서 끊기거나 겹친다 — 프레임 목록을 통째로 본다.
  assert.deepStrictEqual(
    byKey.get('rian-wooden-walk-south')?.frames.map((f) => f.frame),
    [0, 1, 2, 3, 4, 5, 6].map((i) => `walk/south/${i}`),
    '중복 테이크가 섞이면 안 된다',
  );
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
  const { scene, created } = fakeScene({ 'rian-basic': BASIC });
  registerAnims(scene, 'rian-basic');
  const n = created.length;
  registerAnims(scene, 'rian-basic');
  assert.strictEqual(created.length, n, '두 번 불러도 늘지 않는다');
}

// ── 서쪽 = 동쪽 + flipX ──
{
  assert.deepStrictEqual(dirOf('west'), ['east', true]);
  assert.deepStrictEqual(dirOf('east'), ['east', false]);
  assert.deepStrictEqual(dirOf('north'), ['north', false]);
  assert.deepStrictEqual(dirOf('south'), ['south', false]);
}

// ── makeActor: 아틀라스가 있으면 스프라이트, 없으면 대체 상자 ──
// 아트가 아직 안 붙은 몬스터 때문에 게임이 깨지면 안 된다는 게 이 함수의 존재 이유다.
{
  interface MadeSprite {
    args: unknown[];
    displaySize?: [number, number];
  }
  const spriteScene = (loaded: string[]) => {
    const made: MadeSprite[] = [];
    const scene = {
      textures: { exists: (k: string) => loaded.includes(k) },
      add: {
        sprite: (...args: unknown[]) => {
          const s: MadeSprite = { args };
          made.push(s);
          return { setDisplaySize: (w: number, h: number) => ((s.displaySize = [w, h]), s) };
        },
      },
    };
    return { scene: scene as never, made };
  };

  // 아틀라스 로드됨 → 그 텍스처의 walk/south/0, 상자 크기 무시
  {
    const { scene, made } = spriteScene(['rian-basic']);
    const a = makeActor(scene, 10, 20, 'rian-basic', 40, 'box');
    assert.deepStrictEqual(made[0].args, [10, 20, 'rian-basic', 'walk/south/0']);
    assert.strictEqual(a.char, 'rian-basic', '아틀라스를 쓰면 char가 남는다');
    assert.strictEqual(made[0].displaySize, undefined, '원본 크기 그대로 (리샘플 없음)');
  }
  // char 미지정(아직 아트 없음) → 대체 상자
  {
    const { scene, made } = spriteScene(['rian-basic']);
    const a = makeActor(scene, 1, 2, undefined, 26, 'box');
    assert.deepStrictEqual(made[0].args, [1, 2, 'box']);
    assert.deepStrictEqual(made[0].displaySize, [26, 26], '상자는 def.size로 그린다');
    assert.strictEqual(a.char, undefined, '상자면 char가 없다 → playAnim이 no-op');
  }
  // char는 선언했지만 아틀라스 파일이 없다(패킹 전/로드 실패) → 초록 missing 텍스처가 아니라 상자
  {
    const { scene, made } = spriteScene([]);
    const a = makeActor(scene, 0, 0, 'slime', 16, 'box');
    assert.deepStrictEqual(made[0].args, [0, 0, 'box'], '선언만 있고 파일이 없으면 상자로 떨어진다');
    assert.strictEqual(a.char, undefined);
  }
}

// ── playAnim: char 없는 상자는 건드리지 않는다 (setFrame을 부르면 터진다) ──
{
  let touched = false;
  const spr = {
    scene: { anims: { exists: () => true } },
    play: () => (touched = true),
    stop: () => ({ setFrame: () => (touched = true) }),
  };
  playAnim(spr as never, undefined, 'walk', 'south');
  assert.strictEqual(touched, false, '상자 스프라이트에는 아무것도 하지 않는다');
}

// ── 공격은 한 번만 재생한다 ──
// 걷기와 같은 repeat -1로 등록되면 첫 공격에서 영원히 칼을 휘두르는 용사가 된다.
{
  const { scene, created } = fakeScene({ 'rian-wooden': WOODEN });
  registerAnims(scene, 'rian-wooden');
  const byKey = new Map(created.map((a) => [a.key, a]));

  for (const dir of DIRS) {
    const atk = byKey.get(`rian-wooden-attack-${dir}`);
    assert.strictEqual(atk?.frames.length, 9, `공격은 ${dir}까지 9프레임 다 있다`);
    assert.strictEqual(atk?.repeat, 0, '공격은 반복하지 않는다');
  }
  assert.strictEqual(byKey.get('rian-wooden-walk-south')?.repeat, -1, '걷기는 그대로 무한 반복');
  assert.strictEqual(byKey.get('rian-wooden-idle-south')?.repeat, -1, '대기도 그대로 무한 반복');

  // 9프레임을 공격 주기(atkSpd 1.0 = 1초) 안에 끝내야 다음 휘두르기와 겹치지 않는다
  const atkRate = byKey.get('rian-wooden-attack-south')!.frameRate;
  assert.ok(9 / atkRate <= 1, `공격 모션이 ${(9 / atkRate).toFixed(2)}초 — 기본 공격 주기를 넘는다`);
}

// ── 휘두르는 중엔 걷기·대기가 덮어쓰지 못한다 ──
// 이게 없으면 매 프레임 도는 playAnim이 공격을 1프레임 만에 지운다.
{
  const swinging = (isPlaying: boolean, repeat: number) => {
    const calls: string[] = [];
    return {
      calls,
      spr: {
        anims: { isPlaying, currentAnim: { repeat } },
        scene: { anims: { exists: () => true } },
        play: (k: string) => calls.push(k),
        stop: () => ({ setFrame: (f: string) => calls.push(`frame:${f}`) }),
      },
    };
  };

  const mid = swinging(true, 0); // 공격 재생 중
  playAnim(mid.spr as never, 'rian-wooden', 'walk', 'south');
  assert.deepStrictEqual(mid.calls, [], '공격 중 걷기는 무시된다');

  const done = swinging(false, 0); // 공격이 끝난 직후
  playAnim(done.spr as never, 'rian-wooden', 'walk', 'south');
  assert.deepStrictEqual(done.calls, ['rian-wooden-walk-south'], '끝나면 곧바로 걷기로 돌아온다');

  const walking = swinging(true, -1); // 걷기 재생 중 — 반복 모션은 잠그지 않는다
  playAnim(walking.spr as never, 'rian-wooden', 'idle', 'south');
  assert.deepStrictEqual(walking.calls, ['rian-wooden-idle-south'], '걷기는 대기로 바로 넘어간다');
}

// ── playOnce: 공격할 때마다 처음부터 다시 ──
{
  const calls: string[] = [];
  const has = new Set(['rian-wooden-attack-south']);
  const spr = {
    anims: { isPlaying: true, currentAnim: { repeat: 0 } },
    scene: { anims: { exists: (k: string) => has.has(k) } },
    play: (k: string, ignoreIfPlaying?: boolean) => calls.push(`${k}${ignoreIfPlaying ? '(유지)' : ''}`),
    stop: () => ({ setFrame: (f: string) => calls.push(`frame:${f}`) }),
  };

  playOnce(spr as never, 'rian-wooden', 'attack', 'south');
  playOnce(spr as never, 'rian-wooden', 'attack', 'south'); // 연타 — 두 번째도 보여야 한다
  assert.deepStrictEqual(
    calls,
    ['rian-wooden-attack-south', 'rian-wooden-attack-south'],
    '이어지는 공격이 앞 모션에 묻히면 안 된다 (재시작 플래그 없이 play)',
  );

  // 그 방향 공격 아트가 없으면 아무것도 하지 않는다 — 걷기를 끊어 세우면 그게 더 눈에 띈다
  calls.length = 0;
  playOnce(spr as never, 'rian-wooden', 'attack', 'north');
  playOnce(spr as never, undefined, 'attack', 'south'); // 대체 상자
  assert.deepStrictEqual(calls, [], '없는 모션은 조용히 넘어간다');
}

// ── 공격 아트가 없는 등급이어도 게임은 굴러간다 ──
// rian-basic엔 Attack 폴더가 없다. 등급을 되돌렸을 때 공격마다 스프라이트가 멈추면 안 된다.
{
  assert.ok(
    !BASIC.some((n) => n.startsWith('attack/')),
    'rian-basic엔 공격 아트가 없다 — 이 전제가 깨지면 아래 검사는 의미가 없다',
  );
  const { scene, created } = fakeScene({ 'rian-basic': BASIC });
  registerAnims(scene, 'rian-basic');
  assert.ok(!created.some((a) => a.key.includes('attack')), '없는 액션을 만들어내지 않는다');
}

console.log('anims OK');
