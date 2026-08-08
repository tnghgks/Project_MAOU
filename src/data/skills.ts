import { arenaBounds } from '../game/layout.ts';
import type { SkillContext } from '../game/entities.ts';
import { clamp, type SkillRarity } from '../formulas.ts';

// GDD 4장 스킬 4종. 신규 스킬 = 여기에 { name, cd, rarity, effect } 한 항목 추가.
// effect(ctx, mult): SkillContext 표면(hit/fxCircle/heal/freeze 등)만으로 동작 — 씬 구체 타입 비의존.
// mult = 용사 모드 직접 시전(1~4키) 전용 배율(=1). 도네 리액션 경로는 더 이상 mult를 안 쓴다
// (GDD 3-4 개편: 리듬 결과는 스킬 데미지가 아니라 rarity로 신규 스킬을 지급한다 — resolveRhythmResult 참고).
export interface Skill {
  name: string;
  cd: number; // 용사 모드 재사용 대기시간(초). ponytail: 밸런스 knob
  maxUses: number; // 스테이지당 최대 사용 횟수 — 쿨다운과 별개로 무한 사용을 막는다
  rarity: SkillRarity; // 리듬 보상으로 획득할 때 표시되는 등급 (GDD 3-4)
  effect(ctx: SkillContext, mult: number): void;
  /** true면 castSkill이 화면 전체를 덮는 카메라 flash를 건너뛴다 — 자체 fxCircle 연출(화염폭발 등)이
   *  있는 스킬은 흰 화면 플래시가 그 위에 겹쳐 오히려 안 보이게 만든다. */
  noScreenFlash?: boolean;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const LIGHTNING_RADIUS = 60; // 낙뢰 강타 반경(px) — 연출(fxCircle)과 피해 판정이 반드시 같은 값을 써야 한다
const FIRE_BLAST_RADIUS = 180; // 화염폭발 반경(px) — 마찬가지로 연출·피해 판정이 같은 값을 공유

export const SKILLS = {
  // 2026-08-04: 이름을 '화염 참격'에서 바꿨다 — 실제 연출(용사 중심으로 사방에 퍼지는 충격파+불씨)이
  // 베는 모션이 아니라 폭발이라 '참격'이라는 이름과 안 맞았다.
  화염폭발: {
    name: '화염 폭발', // 용사 중심 광역
    cd: 6,
    maxUses: 4, // 스테이지당 4회
    rarity: 'common',
    noScreenFlash: true, // 흰 화면 플래시가 fxCircle의 화염 색을 덮어써서 오히려 안 보였다
    effect(ctx, mult) {
      ctx.fxCircle(ctx.hero.x, ctx.hero.y, FIRE_BLAST_RADIUS, 'fire'); // 예전엔 착탄 연출이 아예 없어 뭐가 터졌는지 안 보였다
      for (const m of ctx.monsters) if (dist(m, ctx.hero) <= FIRE_BLAST_RADIUS) ctx.hit(m, 40 * mult);
    },
  },
  낙뢰: {
    name: '낙뢰', // 5개 지점 강타. 시작 스킬.
    cd: 8,
    maxUses: 3, // 스테이지당 3회
    rarity: 'common',
    effect(ctx, mult) {
      // 예전엔 아레나 전역(최대 2560px 폭)에서 완전 무작위로 떨어져 대부분 빈 공간에 꽂혔다 —
      // 몬스터가 있으면 그 근처(±40px 지터)를 노려 실제로 맞는 게 보이게 한다. 없으면(전멸 직후 등)
      // 예전처럼 아레나 전역 무작위.
      const alive = ctx.monsters.filter((m) => !m.dead);
      for (let i = 0; i < 5; i++) {
        const anchor = alive.length ? alive[ctx.randBetween(0, alive.length - 1)] : null;
        const x = anchor
          ? clamp(anchor.x + ctx.randBetween(-40, 40), arenaBounds.minX, arenaBounds.maxX)
          : ctx.randBetween(arenaBounds.minX, arenaBounds.maxX);
        const y = anchor
          ? clamp(anchor.y + ctx.randBetween(-40, 40), arenaBounds.minY, arenaBounds.maxY)
          : ctx.randBetween(arenaBounds.minY, arenaBounds.maxY);
        // 22 → 60: 연출 반경이 실제 피해 반경보다 훨씬 작아 "맞았는데 안 맞은 것처럼" 보였다. 이제 일치.
        ctx.fxCircle(x, y, LIGHTNING_RADIUS);
        for (const m of ctx.monsters) if (Math.hypot(m.x - x, m.y - y) <= LIGHTNING_RADIUS) ctx.hit(m, 35 * mult);
      }
    },
  },
  회복의성가: {
    name: '회복의 성가',
    cd: 20, // 위험도(=시청자)를 직접 깎는 스킬이라 가장 길다
    maxUses: 1, // 스테이지당 1회 — 강력한 회복이라 제한적으로
    rarity: 'epic',
    effect(ctx) {
      ctx.heal(0.3); // ponytail: 위험도 급락 주의 (GDD 4장)
    },
  },
  시간정지: {
    name: '시간 정지',
    cd: 15,
    maxUses: 2, // 스테이지당 2회
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
