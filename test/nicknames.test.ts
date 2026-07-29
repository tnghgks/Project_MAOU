import assert from 'node:assert';
import { makeNickname, syncRoster, ROSTER_MAX } from '../src/data/nicknames.ts';

// 닉네임은 조합으로 만들어진다
{
  const n = makeNickname(() => 0);
  assert.ok(n.length > 0);
  const set = new Set(Array.from({ length: 300 }, () => makeNickname()));
  assert.ok(set.size > 50, `조합이 너무 단조롭다 (${set.size}종)`);
}

// 핵심: 명단 인원 = 시청자 수. 1명이면 딱 1명만 떠든다.
assert.strictEqual(syncRoster([], 1).length, 1);
assert.strictEqual(syncRoster([], 7).length, 7);
assert.strictEqual(syncRoster([], 0).length, 0);
assert.strictEqual(syncRoster([], 5.9).length, 5, '표시(내림) 기준으로 맞춘다');

// 상한: 시청자가 수만이어도 동시 채팅 인원은 ROSTER_MAX
assert.strictEqual(syncRoster([], 35000).length, ROSTER_MAX);

// 명단 안에서 중복 없음
{
  const r = syncRoster([], ROSTER_MAX);
  assert.strictEqual(new Set(r).size, r.length, '닉네임이 겹치면 같은 사람이 둘로 보인다');
}

// 시청자가 늘면 기존 사람은 남고 새 사람만 합류
{
  const before = syncRoster([], 5);
  const after = syncRoster(before, 9);
  assert.strictEqual(after.length, 9);
  assert.deepStrictEqual(after.slice(0, 5), before, '기존 시청자가 갈려나가면 안 된다');
}

// 시청자가 줄면 명단도 줄고, 남은 사람은 그대로
{
  const before = syncRoster([], 9);
  const after = syncRoster(before, 3);
  assert.deepStrictEqual(after, before.slice(0, 3));
}

// rnd가 항상 같은 값을 뱉어도(최악) 중복 없이 인원을 채운다
{
  const r = syncRoster([], 12, () => 0);
  assert.strictEqual(r.length, 12);
  assert.strictEqual(new Set(r).size, 12);
}

console.log('nicknames OK');
