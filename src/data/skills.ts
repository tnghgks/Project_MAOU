import { arenaBounds } from '../game/layout.ts';
import type { SkillContext } from '../game/entities.ts';

// GDD 4장 스킬 4종. 신규 스킬 = 여기에 { name, cd, effect } 한 항목 추가.
// effect(ctx, mult): SkillContext 표면(hit/fxCircle/heal/freeze 등)만으로 동작 — 씬 구체 타입 비의존.
// mult = 리듬 판정 배율. 용사 모드 직접 시전(1~4키)은 mult=1 + cd 쿨타임, 도네 경로는 cd 무시.
export interface Skill {
  name: string;
  cd: number; // 용사 모드 재사용 대기시간(초). ponytail: 밸런스 knob
  effect(ctx: SkillContext, mult: number): void;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export const SKILLS = {
  화염참격: {
    name: '화염 참격', // 전방 광역(반경 근사)
    cd: 6,
    effect(ctx, mult) {
      for (const m of ctx.monsters) if (dist(m, ctx.hero) <= 180) ctx.hit(m, 40 * mult);
    },
  },
  낙뢰: {
    name: '낙뢰', // 아레나 내 랜덤 5개 지점 강타 (경계는 layout.arenaBounds — 전폭 커버)
    cd: 8,
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
    effect(ctx) {
      ctx.heal(0.3); // ponytail: 위험도 급락 주의 (GDD 4장)
    },
  },
  시간정지: {
    name: '시간 정지',
    cd: 15,
    effect(ctx) {
      ctx.freeze(3000); // 3초간 몬스터 정지
    },
  },
} satisfies Record<string, Skill>;

export type SkillId = keyof typeof SKILLS;
