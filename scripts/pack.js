// assets/character/<캐릭터>/<등급>/**/*.png → public/assets/character/<등급>.png + .json (Phaser 3 JSON Hash)
//
// ponytail: 의존성 0. PNG는 node:zlib면 읽고 쓸 수 있고, 배치는 shelf packing 20줄이면 된다.
// 캐릭터 수가 늘어 회전/트림 같은 진짜 패킹이 필요해지면 그때 free-tex-packer-core로 갈아탄다.
// 회전은 하지 않는다 — flipX와 섞이면 방향 처리가 꼬인다. 트림도 하지 않는다 — 프레임마다
// origin이 달라져 걷는 동안 인물이 떤다.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { join, relative, dirname, sep } from 'node:path';

const SRC = 'assets/character';
const OUT = 'public/assets/character';
const PAD = 2; // 프레임 사이 여백 — 이웃 픽셀이 새어 들어오는 걸 막는다

// ── CRC32 (PNG 청크용) ──
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// ── PNG 디코드 (RGBA8 / RGB8, non-interlaced) ──
function decodePng(path) {
  const buf = readFileSync(path);
  let p = 8;
  let w = 0,
    h = 0,
    bitDepth = 0,
    colorType = 0,
    interlace = 0;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  // 입력은 도구가 뱉은 것이라 신뢰 경계다 — 조용히 깨지느니 여기서 멈춘다
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2) || interlace !== 0)
    throw new Error(
      `${path}: 지원 안 하는 PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}). RGB/RGBA 8bit non-interlaced만 처리한다.`,
    );

  const ch = colorType === 6 ? 4 : 3;
  const stride = w * ch;
  const raw = inflateSync(Buffer.concat(idat));
  const un = Buffer.alloc(h * stride); // 필터 해제된 원본 채널
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? un[y * stride + x - ch] : 0; // 왼쪽
      const b = y > 0 ? un[(y - 1) * stride + x] : 0; // 위
      const c = x >= ch && y > 0 ? un[(y - 1) * stride + x - ch] : 0; // 왼쪽 위
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c),
          pb = Math.abs(a - c),
          pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) throw new Error(`${path}: 알 수 없는 필터 ${f}`);
      un[y * stride + x] = v & 0xff;
    }
  }
  if (ch === 4) return { w, h, px: un };
  const px = Buffer.alloc(w * h * 4, 0xff); // RGB → RGBA (알파 불투명)
  for (let i = 0; i < w * h; i++) un.copy(px, i * 4, i * 3, i * 3 + 3);
  return { w, h, px };
}

// ── PNG 인코드 (RGBA8, 필터 없음) ──
function encodePng(w, h, px) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── shelf packing: 높이 내림차순으로 줄을 채운다. 폭 후보를 다 돌려보고 면적이 최소인 걸 고른다 ──
function pack(frames, maxW) {
  let x = 0,
    y = 0,
    rowH = 0,
    w = 0;
  for (const f of frames) {
    if (x > 0 && x + f.w > maxW) {
      x = 0;
      y += rowH + PAD;
      rowH = 0;
    }
    f.x = x;
    f.y = y;
    x += f.w + PAD;
    rowH = Math.max(rowH, f.h);
    w = Math.max(w, x - PAD);
  }
  return { w, h: y + rowH };
}

// 생성 툴이 뱉는 액션 폴더명이 캐릭터마다 다르다 (rian=Walking, Grimhardt=Walk).
// 게임 코드가 쓰는 이름으로 통일한다 — 표에 없으면 소문자로 그대로 간다.
const ACTION_ALIAS = { walking: 'walk', walk: 'walk', breathing_idle: 'idle' };

// 생성 툴이 같은 방향을 두 번 뽑으면 폴더에 해시 꼬리를 붙여 내보낸다 (south-48068658).
// 방향 이름으로 되돌린다 — 남는 중복은 아래 패킹 루프가 하나만 남기고 경고한다.
const stripTakeHash = (seg) => seg.replace(/-[0-9a-f]{6,}$/i, '');

// 프레임 이름 = `액션/방향/번호`. 런타임(game/anims.ts)이 이 형태를 파싱해 애니메이션을 자동 등록한다.
//   Rian-Basic/animations/Walking/south/frame_000.png → walk/south/0
//   Rian-Basic/rotations/south.png                    → rotations/south
// 등급·캐릭터 폴더 이름은 아틀라스 키로 이미 들어가 있으므로 프레임 이름에서는 뺀다.
function frameName(rel, ...dropSegs) {
  const drop = new Set(['animations', ...dropSegs.map((s) => s.toLowerCase())]);
  const segs = rel.split(sep);
  const file = segs.pop().replace(/\.png$/i, '');
  const keep = segs.filter((s) => !drop.has(s.toLowerCase())).map(stripTakeHash);
  if (keep.length) keep[0] = ACTION_ALIAS[keep[0].toLowerCase()] ?? keep[0].toLowerCase();
  const m = file.match(/^frame_0*(\d+)$/);
  return [...keep, m ? m[1] : file].join('/');
}

const walk = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : p.toLowerCase().endsWith('.png') ? [p] : [];
  });

const subDirs = (dir) => readdirSync(dir).filter((e) => statSync(join(dir, e)).isDirectory());

// 아틀라스 하나가 되는 폴더들. 캐릭터는 장비 등급마다 폴더를 하나씩 갖는다:
//   assets/character/rian/Rian-Basic  → 아틀라스 rian-basic
//   assets/character/rian/Rian-Wooden → 아틀라스 rian-wooden
// 나중에 철검을 붙일 땐 Rian-Iron 폴더를 넣기만 하면 rian-iron이 따라 나온다.
// 등급 폴더 = animations/rotations를 직접 품은 하위 폴더. 하나도 없으면 캐릭터 폴더 자체가
// 아틀라스 한 장이다 (등급 개념이 없던 옛 배치를 그대로 받는다).
function atlasRoots(charName) {
  const root = join(SRC, charName);
  const tiers = subDirs(root).filter((t) => ['animations', 'rotations'].some((d) => existsSync(join(root, t, d))));
  return tiers.length ? tiers.map((t) => ({ name: t, root: join(root, t) })) : [{ name: charName, root }];
}

// 원본 아트(assets/)는 .gitignore라 클론에는 없다. 결과물(public/assets/character/)이 커밋돼
// 있으므로, 원본이 없으면 조용히 건너뛰고 빌드를 계속한다 — CI/클론에서 빌드가 깨지면 안 된다.
if (!existsSync(SRC)) {
  console.log(`${SRC} 없음 — 커밋된 아틀라스를 그대로 쓴다.`);
  process.exit(0);
}

let total = 0;
const CHAR_DIRS = readdirSync(SRC).filter((e) => statSync(join(SRC, e)).isDirectory());
for (const { charName, atlasName, root } of CHAR_DIRS.flatMap((c) =>
  atlasRoots(c).map((a) => ({ charName: c, atlasName: a.name, root: a.root })),
)) {
  // 아틀라스 키 = 폴더명 소문자 (Rian-Basic / Grimhardt처럼 대소문자가 섞여 온다).
  // 리눅스 정적 호스팅은 경로가 대소문자를 가리므로 파일명도 소문자로 통일한다.
  const outName = atlasName.toLowerCase();

  // 이름이 겹치면 먼저 온 것만 남긴다. 같은 방향을 두 번 뽑은 테이크(south-48068658 ·
  // south-49dfbf87)가 해시를 떼면 서로 충돌하는데, 조용히 덮어쓰면 두 테이크가 섞인
  // 걷기가 나온다. 어느 쪽을 버렸는지 찍어 줘야 원본 폴더를 지울 수 있다.
  const taken = new Set();
  const dropped = new Set();
  const picked = [];
  for (const path of walk(root).sort()) {
    const name = frameName(relative(root, path), charName, atlasName);
    if (taken.has(name)) dropped.add(relative(root, dirname(path)).split(sep).join('/'));
    else {
      taken.add(name);
      picked.push({ path, name });
    }
  }
  for (const d of dropped) console.warn(`  ! ${atlasName}/${d}: 같은 방향이 이미 있어 통째로 버렸다 — 원본을 지워라`);

  const frames = picked
    .map(({ path, name }) => ({ name, ...decodePng(path) }))
    .sort((a, b) => b.h - a.h || a.name.localeCompare(b.name));
  if (!frames.length) continue;

  // 폭 후보를 훑어 가장 정사각형에 가까운 배치를 고른다 (프레임 수십 장 규모라 완전탐색이 더 싸다).
  // 면적 최소로 잡으면 프레임 사이 여백 때문에 항상 세로 한 줄 스트립이 이겨서 안 된다.
  let best = null;
  const widest = Math.max(...frames.map((f) => f.w));
  for (let mw = widest; mw <= widest * frames.length; mw += 8) {
    const { w, h } = pack(frames, mw);
    const side = Math.max(w, h);
    if (!best || side < best.side || (side === best.side && w * h < best.area)) best = { side, area: w * h, mw };
  }
  const { w: SW, h: SH } = pack(frames, best.mw); // 최적 폭으로 좌표 확정

  const sheet = Buffer.alloc(SW * SH * 4); // 0 = 완전 투명
  for (const f of frames)
    for (let y = 0; y < f.h; y++) f.px.copy(sheet, ((f.y + y) * SW + f.x) * 4, y * f.w * 4, (y + 1) * f.w * 4);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${outName}.png`), encodePng(SW, SH, sheet));
  writeFileSync(
    join(OUT, `${outName}.json`),
    JSON.stringify(
      {
        frames: Object.fromEntries(
          frames.map((f) => [
            f.name,
            {
              frame: { x: f.x, y: f.y, w: f.w, h: f.h },
              rotated: false,
              trimmed: false,
              spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
              sourceSize: { w: f.w, h: f.h },
            },
          ]),
        ),
        meta: { image: `${outName}.png`, format: 'RGBA8888', size: { w: SW, h: SH }, scale: '1' },
      },
      null,
      1,
    ) + '\n',
  );
  // 자체검증: 직접 만든 PNG 코덱이라 조용히 틀리면 게임에서 색이 어긋난 채로 굴러간다.
  // 방금 쓴 시트를 다시 읽어 모든 프레임 픽셀이 원본과 바이트 단위로 같은지 본다.
  const back = decodePng(join(OUT, `${outName}.png`));
  for (const f of frames)
    for (let y = 0; y < f.h; y++) {
      const got = back.px.subarray(((f.y + y) * SW + f.x) * 4, ((f.y + y) * SW + f.x + f.w) * 4);
      if (!got.equals(f.px.subarray(y * f.w * 4, (y + 1) * f.w * 4)))
        throw new Error(`라운드트립 실패: ${atlasName}/${f.name} y=${y}`);
    }

  console.log(`${atlasName}: ${frames.length}프레임 → ${SW}×${SH}  ${OUT}/${outName}.png (검증 OK)`);
  total += frames.length;
}
console.log(`총 ${total}프레임 패킹 완료.`);
