import Phaser from 'phaser';
// GDD 4장 스킬 4종. 신규 스킬 = 여기에 { name, effect } 한 항목 추가.
// effect(scene, mult): scene 헬퍼(hitFx/hero/monsters/freezeUntil)로 동작. mult = 리듬 판정 배율.
const dist = (a, b) => Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);

export const SKILLS = {
  화염참격: {
    name: '화염 참격', // 전방 광역(반경 근사)
    effect(s, mult) {
      for (const m of s.monsters) if (dist(m, s.hero) <= 180) s.hitFx(m, 40 * mult);
    },
  },
  낙뢰: {
    name: '낙뢰', // 화면 내 랜덤 5개 지점 강타
    effect(s, mult) {
      for (let i = 0; i < 5; i++) {
        const x = Phaser.Math.Between(20, 920), y = Phaser.Math.Between(60, 540);
        s.add.circle(x, y, 22, 0xffffaa, 0.8).setDepth(3);
        for (const m of s.monsters) if (Phaser.Math.Distance.Between(m.x, m.y, x, y) <= 60) s.hitFx(m, 35 * mult);
      }
    },
  },
  회복의성가: {
    name: '회복의 성가',
    effect(s) {
      s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + s.hero.maxHp * 0.3); // ponytail: 위험도 급락 주의 (GDD 4장)
    },
  },
  시간정지: {
    name: '시간 정지',
    effect(s) {
      s.freezeUntil = s.time.now + 3000; // 3초간 몬스터 정지
    },
  },
};
