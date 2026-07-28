import { arenaBounds } from '../game/layout.ts';
import type { SkillContext } from '../game/entities.ts';
import type { SkillRarity } from '../formulas.ts';

// GDD 4장 스킬 4종. 신규 스킬 = 여기에 { name, cd, rarity, effect } 한 항목 추가.
// effect(ctx, mult): SkillContext 표면(hit/fxCircle/heal/freeze 등)만으로 동작 — 씬 구체 타입 비의존.
// mult = 용사 모드 직접 시전(1~4키) 전용 배율(=1). 도네 리액션 경로는 더 이상 mult를 안 쓴다
// (GDD 3-4 개편: 리듬 결과는 스킬 데미지가 아니라 rarity로 신규 스킬을 지급한다 — resolveRhythmResult 참고).
export interface Skill {
  name: string;
  cd: number; // 용사 모드 재사용 대기시간(초). ponytail: 밸런스 knob
  rarity: SkillRarity; // 리듬 보상으로 획득할 때 표시되는 등급 (GDD 3-4)
  effect(ctx: SkillContext, mult: number): void;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export const SKILLS = {
  화염참격: {
    name: '화염 참격', // 전방 광역(반경 근사)
    cd: 6,
    rarity: 'common',
    effect(ctx, mult) {
      for (const m of ctx.monsters) if (dist(m, ctx.hero) <= 180) ctx.hit(m, 40 * mult);
    },
  },
  낙뢰: {
    name: '낙뢰', // 아레나 내 랜덤 5개 지점 강타 (경계는 layout.arenaBounds — 전폭 커버). 시작 스킬.
    cd: 8,
    rarity: 'common',
    effect(ctx, mult) {
      for (let i = 0; i < 5; i++) {
        const x = ctx.randBetween(arenaBounds.minX, arenaBounds.maxX);
        const y = ctx.randBetween(arenaBounds.minY, arenaBounds.maxY);
        ctx.fxCircle(x, y, 22);
        for (const m of ctx.monsters) if (Math.hypot(m.x - x, m.y - y) <= 60) ctx.hit(m, 35 * mult);
      }
    },
  },
  회복의성가: {
    name: '회복의 성가',
    cd: 20, // 위험도(=시청자)를 직접 깎는 스킬이라 가장 길다
    rarity: 'epic',
    effect(ctx) {
      ctx.heal(0.3); // ponytail: 위험도 급락 주의 (GDD 4장)
    },
  },
  시간정지: {
    name: '시간 정지',
    cd: 15,
    rarity: 'uncommon',
    effect(ctx) {
      ctx.freeze(3000); // 3초간 몬스터 정지
    },
  },
} satisfies Record<string, Skill>;

export type SkillId = keyof typeof SKILLS;

// 리듬 보상: rarity와 같은 등급의 미보유 스킬을 랜덤으로 고른다. 그 등급이 이미 다 있으면
// 다른 미보유 스킬로 폴백하고, 전부 보유 중이면 null(=이번엔 스킬 없이 시청자%만 적용).
export function pickSkillReward(
  owned: readonly SkillId[],
  rarity: SkillRarity,
  rnd: () => number = Math.random,
): SkillId | null {
  const ids = Object.keys(SKILLS) as SkillId[];
  const unowned = ids.filter((id) => !owned.includes(id));
  if (!unowned.length) return null;
  const sameTier = unowned.filter((id) => SKILLS[id].rarity === rarity);
  const pool = sameTier.length ? sameTier : unowned;
  return pool[Math.floor(rnd() * pool.length)];
}
