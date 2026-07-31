import assert from 'node:assert/strict';
import { EPISODES, FINAL_EP, targetGold, bossOf, START_VIEWERS, stageViewerFloor } from '../src/data/progression.ts';
import { MONSTERS } from '../src/data/monsters.ts';

// 스테이지 테이블: 1~FINAL_EP 연속, 목표 골드 증가, 보스는 실존 + 소환 버튼에 안 뜬다
const eps = Object.keys(EPISODES).map(Number).sort();
assert.deepEqual(eps, [1, 2, 3]);
assert.equal(FINAL_EP, 3);
assert.deepEqual(eps.map(targetGold), [1000, 3000, 5000]);

for (const ep of eps) {
  const boss = MONSTERS[bossOf(ep)];
  assert.ok(boss, `${ep}화 보스 정의 없음`);
  assert.ok(boss.unlock > FINAL_EP, `${ep}화 보스가 소환 버튼에 노출됨`);
}

// 범위 밖 화수는 최종화로 폴백
assert.equal(targetGold(99), targetGold(FINAL_EP));

// 스테이지 인계 시청자 하한: 1화는 시작값 그대로, 목표 골드가 클수록 하한도 같이 커진다
assert.equal(stageViewerFloor(1), START_VIEWERS);
assert.equal(stageViewerFloor(2), Math.round(START_VIEWERS * (3000 / 1000))); // 36명
assert.equal(stageViewerFloor(FINAL_EP), Math.round(START_VIEWERS * (5000 / 1000))); // 60명

console.log('progression ok');
