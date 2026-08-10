// GDD 3-5. 신규 몬스터 = 여기에 한 줄 추가. unlock = 등장 시작 화수.

/** 편성 화면에서 한눈에 훑기 위한 분류. 산문 설명은 읽는 데 시간이 걸려서, 아홉 장을 나란히
 *  비교할 땐 배지 하나가 훨씬 빠르다. 전투 로직은 이 값을 안 본다 — 순전히 표시용이다. */
export type MonsterRole = 'swarm' | 'ranged' | 'tank' | 'buffer' | 'bomber' | 'splitter';
export const ROLE_LABEL: Record<MonsterRole, string> = {
  swarm: '물량',
  ranged: '원거리',
  tank: '탱커',
  buffer: '버퍼',
  bomber: '자폭',
  splitter: '분열',
};

export interface MonsterDef {
  name: string;
  hp: number;
  dmg: number;
  atkCd: number;
  speed: number;
  range: number;
  gold: number;
  size: number; // 대체 상자 크기(px). 아틀라스가 붙으면 원본 크기 그대로 그린다
  scale?: number; // 표시 배율(기본 1). 아트 원본이 작거나 클 때 여기로 맞춘다 — 전투 판정은 range라 영향 없다
  /** 애니메이션 아틀라스 키 = assets/character/<이름>/ 폴더명(소문자).
   *  비어 있거나 아틀라스 로드에 실패하면 대체 상자가 뜬다 — 게임은 그대로 돌아간다.
   *  아트가 준비되면 여기 한 줄만 채우면 로드·애니메이션 등록이 전부 따라온다. */
  char?: string;
  /** idle 스프라이트 시트 한 장(가로 한 줄)으로 온 몬스터 — 값은 프레임 한 칸 크기(px).
   *  이게 있으면 char는 아틀라스가 아니라 public/assets/character/<char>.png 시트로 읽는다.
   *  방향·액션 구분이 없어 걷든 서든 같은 루프가 돈다 (일반 몬스터는 이 정도면 충분하다). */
  sheet?: number;
  unlock: number;
  /** 편성 화면 배지용 분류. 보스는 편성 대상이 아니라 없다. */
  role?: MonsterRole;
  /** 웨이브 편성 코스트(data/waves.ts). 방송 전 편성 포인트 예산을 이걸로 쓴다 —
   *  "한 마리를 몇 점에 살 것인가"가 곧 편성의 유일한 통화다. 보스는 편성 대상이 아니라 0. */
  cost: number;
  ranged?: boolean;
  suicide?: boolean;
  tint?: number; // 보스 식별용 (스프라이트 재활용) · 대체 상자 색으로도 쓰인다
  /** 용사 공격 적중 시 밀려나는 거리의 배율. 기본(생략) = 1. 0 = 완전 면역(보스급).
   *  가볍고 물량인 몬스터일수록 크게, 탱커·미니보스·보스일수록 작게/0으로. */
  kb?: number;

  // ── 역할 기믹 (2026-08-09 웨이브 편성 개편) ──
  // 소환이 자동 웨이브가 되면서 편성의 재미는 "몇 마리 세우나"가 아니라 "어떤 역할을 섞나"로 옮겨간다.
  // 셋 다 선택적이라 기존 몬스터 다섯 줄은 손대지 않았다.
  /** 죽을 때 다른 몬스터로 분열한다. 분열체가 또 분열하면 무한 증식이라 1세대까지만 —
   *  BattleScene.splitProc이 분열체를 스폰할 때 split을 지운 def로 넣는다.
   *
   *  into의 타입이 MonsterId가 아니라 string인 이유: MonsterId는 `keyof typeof MONSTERS`이고
   *  MONSTERS는 `satisfies Record<string, MonsterDef>`라, 여기서 MonsterId를 쓰면
   *  MonsterDef → MonsterId → MONSTERS → MonsterDef 순환이 생겨 타입이 통째로 any가 된다(TS2456).
   *  "신규 몬스터 = 한 줄 추가" 관용구를 지키려고 타입을 느슨하게 두는 대신, 오타는
   *  test/waves.test.ts가 모든 split.into가 실재하는 id인지 전수 검사해서 잡는다. */
  split?: { into: string; count: number };
  /** 주변 아군에게 거는 버프 오라. 값은 배율(1 = 효과 없음). 오라끼리 곱하지 않고 가장 센 것 하나만
   *  먹는다(battleSim.applyAuras) — 주술사를 여러 마리 겹쳐 세우는 무한 스택을 막는다. */
  aura?: { radius: number; atk: number; speed: number };
  /** 받는 피해 고정 감소량. 용사의 한 방이 이 값 이하면 최소 피해(battleSim.ARMOR_MIN_DMG)만 들어간다 —
   *  "약한 다타로는 못 뚫는 벽" 역할. %가 아니라 고정값인 건 용사가 강해지면 자연히 무의미해져야 해서다. */
  armor?: number;
}

// 한 몬스터 = 한 줄, 컬럼 정렬로 밸런스 비교가 쉽다.
// char가 빈 줄은 아직 아트가 없어 대체 상자로 뜬다 — 아틀라스가 나오면 char만 채우면 된다.
// prettier-ignore
export const MONSTERS = {
  slime:  { name: '슬라임',      hp: 20,  dmg: 3,  atkCd: 1.0, speed: 60,  range: 24,  gold: 5,  size: 16, unlock: 1, cost: 1, role: 'swarm',  char: 'slime', sheet: 32, kb: 1.6 },
  archer: { name: '고블린 궁수', hp: 15,  dmg: 4,  atkCd: 2.0, speed: 70,  range: 240, gold: 8,  size: 15, unlock: 1, cost: 2, role: 'ranged', ranged: true, char: 'goblinarcher', kb: 1 },
  golem:  { name: '사이클롭스',        hp: 120, dmg: 8,  atkCd: 1.5, speed: 35,  range: 30,  gold: 20, size: 26, unlock: 1, cost: 5, role: 'tank',   kb: 0.3, char: 'cyclops', scale: 1.5 },
  bat:    { name: '폭탄 박쥐',   hp: 10,  dmg: 20, atkCd: 0.1, speed: 120, range: 22,  gold: 12, size: 14, unlock: 2, cost: 3, role: 'bomber', suicide: true, char: 'bombbat', sheet: 64, kb: 1.2 },
  knight: { name: '정예 기사',   hp: 300, dmg: 15, atkCd: 1.2, speed: 45,  range: 34,  gold: 60, size: 28, unlock: 3, cost: 8, role: 'tank',   kb: 0.15, char: 'blackknight'},

  // ── 역할 몬스터 4종 (2026-08-09) — 편성에서 "물량 vs 역할"을 고르게 만드는 게 목적이다.
  // 전용 아트가 없는 줄은 기존 아틀라스를 tint로 재활용한다(BootScene이 char로 로드하므로
  // 새 파일 없이 바로 뜬다). 전용 스프라이트가 나오면 char/tint 두 칸만 갈아끼우면 된다 —
  // 2026-08-10 turtle·shaman이 그 경로로 전용 아트를 받았다(rockyturtle · goblinshaman).
  // splitter: 죽어야 진짜 물량이 나온다 — 콤보·처치수 요청의 축.
  splitter: { name: '분열 슬라임',   hp: 34, dmg: 4,  atkCd: 1.2, speed: 55, range: 24,  gold: 9,  size: 16, unlock: 1, cost: 3, role: 'splitter', char: 'slime', sheet: 32, scale: 1.5, tint: 0xffaa66, kb: 1.4, split: { into: 'slime', count: 2 } },
  // turtle: 느리고 안 죽는 벽. armor 5라 용사 초기 공격력(10)으론 절반밖에 안 박힌다 — 데미지 강화의 존재 이유.
  turtle:   { name: '바위 거북',     hp: 90, dmg: 6,  atkCd: 1.8, speed: 22, range: 26,  gold: 16, size: 24, unlock: 1, cost: 4, role: 'tank',   char: 'rockyturtle', kb: 0.2, armor: 5 },
  // shaman: 자체 전투력은 종잇장인데 주변을 강하게 만든다 — 용사가 "누구부터 자를지" 판단하게 만드는 역할.
  // scale 0.8: 아트 원본 84px인데 같은 고블린인 궁수(64px)보다 커 보이면 안 된다.
  shaman:   { name: '고블린 주술사', hp: 40, dmg: 5,  atkCd: 2.2, speed: 55, range: 180, gold: 22, size: 16, unlock: 2, cost: 5, role: 'buffer', ranged: true, char: 'goblinshaman', scale: 0.8, kb: 1, aura: { radius: 160, atk: 1.35, speed: 1.25 } },
  // sniper: 화면 반대편에서 아프게 때린다. 무시하면 계속 맞고, 끊으러 가면 다른 몹에게 등을 내준다.
  sniper:   { name: '저격 고블린',   hp: 18, dmg: 16, atkCd: 4.0, speed: 45, range: 520, gold: 18, size: 15, unlock: 2, cost: 4, role: 'ranged', ranged: true, char: 'goblinarcher', tint: 0x66ddaa, scale: 1.1, kb: 1.1 },

  // ── 아트가 먼저 온 2종 (2026-08-10) — 위 넷과 반대로 스프라이트가 있어서 자리를 만든 줄이다.
  // 둘 다 근접 물량이지만 축이 반대다: 임프는 빠르고 잘 죽고, 좀비는 느리고 안 죽는다.
  // imp: 슬라임보다 비싸지만 훨씬 빠르다 — 용사가 뒤로 빠져도 따라붙는 게 값어치다.
  imp:      { name: '임프',          hp: 22, dmg: 5,  atkCd: 0.9, speed: 100, range: 26, gold: 10, size: 14, unlock: 1, cost: 2, role: 'swarm',  char: 'imp', kb: 1.5 },
  // zombie: 거북(armor)과 달리 순수 체력 덩어리 — 다타로도 뚫리지만 그동안 시간이 간다.
  // scale 0.8: 아트 원본 96px, 용사(92px)보다 커 보이면 잡몹으로 안 읽힌다.
  zombie:   { name: '좀비',          hp: 60, dmg: 7,  atkCd: 1.6, speed: 28,  range: 28, gold: 14, size: 20, unlock: 2, cost: 3, role: 'swarm',  char: 'zombie', scale: 0.8, kb: 0.5 },

  // 보스 — unlock 99라 소환 버튼에 안 뜬다. 목표 골드 달성 시 BattleScene이 직접 소환한다. kb: 0 = 넉백 면역.
  // 2026-08-07: 3패턴 보스전 도입(battleSim.stepBossGolem)에 맞춰 hp 상향 + 덩치 키움(scale 1→1.35).
  // 보스전 중엔 도네이션·소환·미션이 전부 막혀 순수 실력전이라 hp 하나로 난이도를 올려도 된다 —
  // 개별 패턴 피해량은 그대로(사거리/속도 완화는 유지, GOLEM_* 참고).
  // 2026-08-07 밸런스 하향: hp 감소 (1000→750, 1400→1000, 2600→1800) - 너무 어려워서 조정
  boss_golem:  { name: '사르가스', hp: 750, dmg: 12, atkCd: 1.6, speed: 30, range: 40, gold: 300,  size: 124, unlock: 99, cost: 0, char: 'sargas', scale: 1.35, kb: 0 },
  boss_knight: { name: '베르하르트',   hp: 1000, dmg: 18, atkCd: 1.5, speed: 34, range: 44, gold: 800,  size: 64, unlock: 99, cost: 0, char: 'verhart', scale: 1, kb: 0 },
  boss_maou:   { name: '그림하르트',         hp: 1800, dmg: 24, atkCd: 1.4, speed: 38, range: 46, gold: 2000, size: 64, unlock: 99, cost: 0, char: 'grimhardt', scale: 1.2, kb: 0 },
} satisfies Record<string, MonsterDef>;

export type MonsterId = keyof typeof MONSTERS;
