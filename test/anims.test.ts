import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { registerAnims, registerSheetAnims, dirOf, makeActor, playAnim, playOnce, DIRS } from '../src/game/anims.ts';
import { GOLEM_ROCK_WINDUP, GOLEM_STOMP_WINDUP } from '../src/game/battleSim.ts';
import { MONSTERS, type MonsterDef } from '../src/data/monsters.ts';

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
      // 시트는 프레임 이름이 번호뿐 — Phaser가 텍스처에서 전부 긁어오는 걸 흉내낸다
      generateFrameNumbers: (k: string) => (atlases[k] ?? []).map((frame) => ({ key: k, frame })),
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
    assert.strictEqual(byKey.get(`grimhardt-walk-${dir}`)?.frames.length, 9, `grimhardt-walk-${dir}는 9프레임`);
  }
  assert.strictEqual(byKey.get('rian-basic-idle-south')?.frames.length, 4);
  // 대기 모션은 있는 만큼만 — rian-basic은 남쪽뿐이고 grimhardt는 아예 없다.
  // 없는 방향·액션까지 만들어내면 그쪽에서만 엉뚱한 그림이 돈다.
  assert.ok(!byKey.has('rian-basic-idle-north'), '없는 방향은 등록하지 않는다');
  assert.ok(!byKey.has('grimhardt-idle-south'), '없는 액션은 등록하지 않는다');

  // 정지컷(rotations/south)은 번호가 없으니 애니메이션이 아니다
  assert.ok(!created.some((a) => a.key.includes('rotations')), 'rotations는 애니메이션으로 잡히면 안 된다');

  // 프레임은 번호 순서대로 (문자열 정렬이면 10이 2보다 앞에 온다)
  assert.deepStrictEqual(
    byKey.get('grimhardt-walk-south')?.frames.map((f) => f.frame),
    [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `walk/south/${i}`),
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

// ── idle 시트 한 장(일반 몬스터): 어느 액션·방향을 물어도 그 루프가 돈다 ──
// BattleScene은 이동할 때 walk-<방향>을 부른다. 그 조합이 하나라도 빠지면 그 방향에서만
// 몬스터가 정지 프레임으로 굳는다 — 조합을 다 세어 본다.
{
  const { scene, created } = fakeScene({ goblin: ['0', '1', '2', '3'] });
  registerSheetAnims(scene, 'goblin');
  const byKey = new Map(created.map((a) => [a.key, a]));
  for (const dir of DIRS)
    for (const action of ['walk', 'idle']) {
      const a = byKey.get(`goblin-${action}-${dir}`);
      assert.strictEqual(a?.frames.length, 4, `goblin-${action}-${dir}가 시트 4프레임을 다 쓴다`);
      assert.strictEqual(a?.repeat, -1, '시트 루프는 무한 반복');
    }
  registerSheetAnims(scene, 'goblin');
  assert.strictEqual(created.length, DIRS.length * 2, '두 번 불러도 늘지 않는다');
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
  // loaded = 아틀라스 키들, sheets = 시트 키들(프레임 이름이 번호뿐이라 walk/south/0이 없다)
  const spriteScene = (loaded: string[], sheets: string[] = []) => {
    const made: MadeSprite[] = [];
    const scene = {
      textures: {
        exists: (k: string) => loaded.includes(k) || sheets.includes(k),
        get: (k: string) => ({ has: (f: string) => loaded.includes(k) && f === 'walk/south/0' }),
      },
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
  // 시트 캐릭터 → 첫 프레임으로 시작. walk/south/0을 달라고 하면 시트 전체가 한 장으로 그려진다
  {
    const { scene, made } = spriteScene([], ['goblin']);
    const a = makeActor(scene, 5, 6, 'goblin', 20, 'box');
    assert.deepStrictEqual(made[0].args, [5, 6, 'goblin', undefined], '시트는 프레임 이름을 주지 않는다');
    assert.strictEqual(a.char, 'goblin');
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

// ── 사르가스(1탄 보스): 패턴마다 전용 모션이 있고, 그 모션이 곧 텔레그래프다 ──
// BattleScene은 패턴별로 다른 액션을 건다(rock→throwing · stomp→attack · charge→rush).
// 액션이 하나라도 없으면 그 패턴만 조용히 정지 프레임으로 굳는다 — 조합을 다 세어 본다.
{
  const SARGAS = frameNames('sargas');
  const { scene, created } = fakeScene({ sargas: SARGAS });
  registerAnims(scene, 'sargas');
  const byKey = new Map(created.map((a) => [a.key, a]));

  for (const dir of DIRS)
    for (const action of ['throwing', 'attack', 'rush', 'walk'])
      assert.strictEqual(byKey.get(`sargas-${action}-${dir}`)?.frames.length, 9, `sargas-${action}-${dir}는 9프레임`);

  // 돌진은 달리는 내내 도는 루프, 던지기·내려찍기는 한 번 터지고 끝나는 사건이다.
  assert.strictEqual(byKey.get('sargas-rush-south')?.repeat, -1, '질주는 무한 반복');
  assert.strictEqual(byKey.get('sargas-throwing-south')?.repeat, 0, '던지기는 반복하지 않는다');
  assert.strictEqual(byKey.get('sargas-attack-south')?.repeat, 0, '내려찍기는 반복하지 않는다');

  // 윈드업 = 모션이 "터지는 프레임"까지의 시간. 이게 어긋나면 돌을 아직 줍는 중인데 돌이 날아가고,
  // 공중에 뜬 채로 지면 충격 판정이 나온다. battleSim은 anims의 값을 그대로 읽으므로 여기서 프레임과 맞춰본다.
  const at = (key: string, frame: number) => frame / byKey.get(key)!.frameRate;
  const lands = (key: string, frame: number, windup: number, msg: string) =>
    assert.ok(Math.abs(at(key, frame) - windup) < 1e-9, `${msg} (${at(key, frame)}초 ≠ 윈드업 ${windup}초)`);
  lands('sargas-throwing-south', 8, GOLEM_ROCK_WINDUP, '투척은 돌을 머리 위로 든 마지막 프레임에서');
  lands('sargas-attack-south', 6, GOLEM_STOMP_WINDUP, '스톰핑은 착지 프레임에서');
  // 발동 뒤에도 남는 프레임이 있어야 던진 자세·흙먼지가 보인다 (윈드업이 모션보다 길면 그 전에 끊긴다)
  for (const [key, windup] of [
    ['sargas-throwing-south', GOLEM_ROCK_WINDUP],
    ['sargas-attack-south', GOLEM_STOMP_WINDUP],
  ] as const)
    assert.ok(9 / byKey.get(key)!.frameRate > windup, `${key} 모션이 윈드업보다 먼저 끝난다`);
}

// ── 아트가 붙은 몬스터는 세 방향 걷기가 다 있어야 한다 ──
// 생성 툴이 액션 폴더명을 프롬프트 그대로 뱉은 적이 있다(goblinshaman의 walk가
// small_hunched_goblin_shaman_in_...로 나왔다). 그러면 걷기 애니메이션이 조용히 0개가 되고
// 몬스터가 첫 프레임으로 굳은 채 미끄러진다 — char를 채운 줄 전부를 훑어 본다.
{
  for (const [id, def] of Object.entries(MONSTERS) as [string, MonsterDef][]) {
    if (!def.char || def.sheet) continue; // 시트형은 프레임 이름이 번호뿐이라 대상이 아니다
    const { scene, created } = fakeScene({ [def.char]: frameNames(def.char) });
    registerAnims(scene, def.char);
    const keys = new Set(created.map((a) => a.key));
    for (const dir of DIRS)
      assert.ok(keys.has(`${def.char}-walk-${dir}`), `${id}(${def.char})에 walk/${dir}이 없다 — 액션 폴더명을 확인해라`);
  }
}

// ── 참격 시트 격자 ──
// BootScene은 흰색을 `행 5 × 10열`로 집는다. 시트가 바뀌면 조용히 다른 색이 나가므로 여기서 잡는다.
{
  const png = readFileSync('public/assets/impact/skill/bash.png');
  const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  assert.strictEqual(w / 64, 10, 'bash.png는 64px 프레임 10열 — 열 수가 바뀌면 색상 행 계산이 틀어진다');
  assert.ok(h / 64 > 5, '흰색은 6번째 행(0-based 5)');
}

console.log('anims OK');
