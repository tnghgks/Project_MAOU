import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { gameStore } from '../game/store.ts';
import { bus, type HudTick } from '../game/events.ts';
import { useBusEvent } from './useBusEvent.ts';
import { MONSTERS } from '../data/monsters.ts';
import { MonsterArt } from './SpriteBox.tsx';
import { UPGRADES, statOf, type UpgradeKey } from '../data/upgrades.ts';
import { SKILLS, type SkillId } from '../data/skills.ts';
import { TRAITS } from '../data/traits.ts';
import { FINAL_EP } from '../data/progression.ts';
import { SUMMON_Y, CANVAS } from '../game/layout.ts';

const PANEL_TOP_PCT = (SUMMON_Y / CANVAS.H) * 100;
const SKILL_KEYS = ['1', '2', '3', '4']; // 2026-08-10: QWER → 숫자키 (WASD 이동과 겹치지 않게)
const ALL_SKILL_IDS = Object.keys(SKILLS) as SkillId[];
const UPGRADE_KEYS = Object.keys(UPGRADES) as UpgradeKey[];
// 진짜 진행도 개념(경험치 등)이 없어 순수 장식 — 레벨 10에서 꽉 찬다는 감만 준다.
const UPGRADE_BAR_MAX_LV = 10;

// 하단 패널 — 예전엔 Phaser 소환 카드 바 + 별도 HeroPanelScene(HP/대시/특성/스킬)이 같은 자리를
// 모드에 따라 갈아끼웠다. 시점 통합(2026-08-05)으로 React로 이관 — InfoLayer(상단바)와 같은 패턴.
// 2026-08-09 웨이브 편성 개편: 몬스터 소환 타일(숫자키 1~4)이 통째로 빠지고 그 자리에 웨이브 현황이
// 들어왔다. 방송 중 소환 관련 조작은 "다음 웨이브 즉시 호출"(SPACE) 하나뿐이고, 몬스터 구성은
// 방송 전 편성 화면(LineupView)에서 이미 끝났다 — 방송 중엔 용사 조작에 집중하라는 구조다.
// 용사 HP는 아레나 안 heroHpBar로 이미 보이니 여기선 안 그린다 — 육성 정보만 남긴다.
// 특성(traits)은 스탯과 달리 전투 규칙 자체를 바꾸는 별도 개념이라(GDD 3-10), 같은 줄에 섞지 않고
// 버튼으로 열리는 팝업에 따로 모아 보여준다.
// 다음 웨이브 예고 썸네일 한 변(px). 편성 화면 칩(34)보다 큰 건 방송 중엔 이걸 곁눈질로 봐야 해서다 —
// 44 + 이름 한 줄이 옆 스킬 타일과 같은 높이로 떨어져 패널 줄도 맞는다.
const NEXT_ART_BOX = 44;
const SKILL_ICON: Record<SkillId, string> = {
  화염폭발: '🔥',
  낙뢰: '⚡',
  회복의성가: '💚',
  시간정지: '⏳',
};
const UPGRADE_ICON: Record<UpgradeKey, string> = {
  hp: '♥',
  atk: '⚔️',
  atkSpd: '⚡',
  speed: '👟',
  range: '📏',
};

export default function SummonPanel() {
  const episode = useStore(gameStore, (s) => s.episode);
  const upgradeLevels = useStore(gameStore, (s) => s.upgradeLevels);
  const hero = useStore(gameStore, (s) => s.hero);
  const skills = useStore(gameStore, (s) => s.skills);
  const skillUses = useStore(gameStore, (s) => s.skillUses); // 스킬 사용 횟수
  const traits = useStore(gameStore, (s) => s.traits);
  const bossUp = useStore(gameStore, (s) => s.bossUp); // 보스전 중엔 웨이브도 멈춘다(BattleScene.bossActive와 같은 규칙)
  const isFinal = episode >= FINAL_EP; // 최종화: 도네이션 금지와 같은 규칙(GDD 7장) — 웨이브도 안 돈다
  const waveBlocked = isFinal || bossUp;

  // 스킬/대시 쿨타임은 BattleScene 전용 실시간 값이라 store엔 없다 — hud:tick으로만 받는다.
  // tick.skillCd는 BattleScene의 같은 객체를 매번 그대로 넘겨준다 — 그대로 setState하면 참조가
  // 안 바뀌어서 React가 "값이 그대로"라고 오판해 리렌더를 건너뛴다(dashCd가 변할 때만 얹혀서 갱신되다가,
  // 대시가 멈추면 같이 멈춰 보이던 버그의 원인). 매번 새 객체로 복사해 넘겨야 확실히 리렌더된다.
  const [skillCd, setSkillCd] = useState<Partial<Record<SkillId, number>>>({});
  const [dashCd, setDashCd] = useState(0);
  // 대시는 wave:call/skill:request 같은 discrete 이벤트가 없다 — Shift는 매 프레임 폴링돼서
  // "누른 순간"이 따로 없다. 대신 dashCd는 쿨 중엔 줄기만 하다가 발동하는 프레임에만 갑자기
  // DASH_CD로 튀어오른다 — 그 "감소가 아니라 증가"를 대시가 막 발동한 신호로 써서 팝을 건다.
  const prevDashCd = useRef(0);
  const [dashPop, setDashPop] = useState(0);
  useBusEvent('hud:tick', (tick) => {
    setSkillCd({ ...tick.skillCd });
    if (tick.dashCd > prevDashCd.current + 0.01) setDashPop((p) => p + 1);
    prevDashCd.current = tick.dashCd;
    setDashCd(tick.dashCd);
    // 남은 시간(t)은 이제 상단바 시계가 그린다 — 여기서 필요한 건 "몇 번째 웨이브의 구성인가"뿐이라
    // index가 그대로면 이전 객체를 그대로 돌려준다. 매 tick(0.1초)마다 새 객체를 넣으면 스프라이트
    // 예고가 초당 열 번 재조정된다.
    setWave((prev) => (prev?.index === tick.wave?.index ? prev : tick.wave && { ...tick.wave }));
  });

  // 웨이브 현황도 씬 전용 실시간 값이라 store엔 없다 — 다만 이 패널이 쓰는 건 구성(next)뿐이라
  // skillCd처럼 매 tick 복사하지 않고 index가 바뀔 때만 새 객체로 갈아끼운다(위 hud:tick 참고).
  //
  // wavePop은 클릭 피드백용 — 호출이 들어올 때마다 값을 올려서 key로 써먹는다. key가 바뀌면 React가
  // 그 타일을 새로 그리면서 CSS "등장" 애니메이션(tile-pop)이 다시 걸린다 — 타이머로 클래스를 붙였다
  // 떼는 것보다 훨씬 단순하다. 버튼이 wave:call을 emit하면서 동시에 구독도 하는 이유는 SPACE 키
  // 입력(BattleScene)도 같은 이벤트를 타므로, 버튼 클릭과 키 입력 둘 다 여기서 한 번에 잡히기 때문이다.
  const [wave, setWave] = useState<HudTick['wave']>(null);
  const [wavePop, setWavePop] = useState(0);
  useBusEvent('wave:call', () => setWavePop((p) => p + 1)); // SPACE·버튼 양쪽 다 여기서 잡힌다

  const [skillPop, setSkillPop] = useState<Partial<Record<SkillId, number>>>({});
  useBusEvent('skill:request', ({ index }) => {
    const id = skills[index];
    if (id) setSkillPop((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 }));
  });

  const [showTraits, setShowTraits] = useState(false);

  return (
    <div className="summon-panel" style={{ top: `${PANEL_TOP_PCT}%`, height: `${100 - PANEL_TOP_PCT}%` }}>
      {/* 웨이브 칸. wave === null인 경우가 두 가지라 문구를 store의 waveBlocked로 갈라야 한다:
          (1) 보스전·최종화 — 웨이브가 아예 안 도는 구간
          (2) 방송 시작 직후 — 첫 hud:tick이 아직 안 온 순간.
          예전엔 둘을 안 나눠서 방송이 막 시작됐는데 "보스전" 문구가 떴다. */}
      <div className="tile-row">
        <button
          key={`wave-${wavePop}`}
          type="button"
          className="tile wave-tile"
          disabled={waveBlocked}
          onClick={() => bus.emit('wave:call', null)}
          title="다음 웨이브를 지금 부른다 — 위험하지만 판이 커진다"
        >
          <span className="tile-key">Space</span>
          <span className="tile-icon">🌊</span>
          <span className="tile-name">웨이브 호출</span>
        </button>
        {/* 다음에 나올 얼굴들. 이름을 나열한 한 줄 텍스트였는데, 화면에 실제로 나오는 그림과 아무 관계가
            없어서 읽어야만 알 수 있었다 — 편성 화면과 같은 스프라이트(MonsterArt)를 같은 크기로 세워
            "저 그림이 곧 온다"가 한눈에 잡히게 했다. 남은 시간·웨이브 번호는 상단바 시계가 맡는다. */}
        <div className="wave-next">
          <span className="wave-next-label">
            {wave
              ? '다음 출연진'
              : isFinal
                ? '최종화 — 웨이브 없음'
                : bossUp
                  ? '보스전 — 웨이브 중단'
                  : '웨이브 준비 중…'}
          </span>
          {wave && (
            <div className="wave-next-list">
              {wave.next.length === 0 ? (
                <span className="wave-next-empty">편성 없음</span>
              ) : (
                wave.next.map((e) => (
                  <span key={e.type} className="wave-mob" title={`${MONSTERS[e.type].name} ×${e.count}`}>
                    <span className="wave-mob-art">
                      <MonsterArt id={e.type} box={NEXT_ART_BOX} />
                      <span className="wave-mob-count">×{e.count}</span>
                    </span>
                    <span className="wave-mob-name">{MONSTERS[e.type].name}</span>
                  </span>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="tile-row">
        <div key={`dash-${dashPop}`} className="tile skill-tile">
          <span className="tile-key">Shift</span>
          <span className="tile-icon" style={{ opacity: dashCd > 0 ? 0.4 : 1 }}>
            💨
          </span>
          <span className="tile-name">대시{dashCd > 0 ? ` ${dashCd.toFixed(1)}s` : ''}</span>
        </div>
        {/* 아직 안 얻은 스킬도 자리는 잡아둔다(점선 비활성, 클릭 불가) — 몇 종류가 더 있는지 미리 보여야 목표가 생긴다. */}
        {ALL_SKILL_IDS.map((id) => {
          const idx = skills.indexOf(id);
          const owned = idx >= 0;
          const left = owned ? (skillCd[id] ?? 0) : 0;
          const uses = owned ? (skillUses[id] ?? 0) : 0;
          const maxUses = SKILLS[id].maxUses;
          const remaining = maxUses - uses;
          const depleted = owned && remaining <= 0; // 사용 횟수 소진
          const inner = (
            <>
              <span className="tile-key">{owned ? (SKILL_KEYS[idx] ?? '') : ''}</span>
              <span className="tile-icon" style={{ opacity: !owned ? 0.35 : depleted || left > 0 ? 0.4 : 1 }}>
                {SKILL_ICON[id]}
              </span>
              <span className="tile-name">
                {SKILLS[id].name}
                {owned && left > 0 ? ` ${left.toFixed(1)}s` : ''}
                {owned && !depleted ? ` (${remaining}/${maxUses})` : ''}
                {depleted ? ' (소진)' : ''}
              </span>
            </>
          );
          return owned ? (
            <button
              key={`${id}-${skillPop[id] ?? 0}`}
              type="button"
              className="tile skill-tile"
              onClick={() => bus.emit('skill:request', { index: idx })}
            >
              {inner}
            </button>
          ) : (
            <div key={id} className="tile skill-tile locked">
              {inner}
            </div>
          );
        })}
      </div>

      <div className="upgrade-info">
        {UPGRADE_KEYS.map((k) => (
          <div key={k} className="upgrade-row">
            <span className="upgrade-icon">{UPGRADE_ICON[k]}</span>
            <span className="upgrade-name">{UPGRADES[k].name}</span>
            <span className="upgrade-lv">L{upgradeLevels[k]}</span>
            <span className="upgrade-bar">
              <span
                className="upgrade-bar-fill"
                style={{ width: `${Math.min(100, (upgradeLevels[k] / UPGRADE_BAR_MAX_LV) * 100)}%` }}
              />
            </span>
            <span className="upgrade-value">{statOf(k, hero)}</span>
          </div>
        ))}
      </div>

      {/* 업그레이드 목록 밑에 한 줄 더 쌓지 않고, 패널의 다른 구획들처럼 옆에 나란히 놓는다. */}
      <div className="traits-wrap">
        <button type="button" className="traits-toggle" onClick={() => setShowTraits((v) => !v)}>
          🎭 특성 {traits.length}
        </button>
        {showTraits && (
          <div className="traits-popup">
            {traits.length === 0 ? (
              <p className="traits-empty">아직 얻은 특성이 없습니다</p>
            ) : (
              traits.map((id) => (
                <div key={id} className="trait-card">
                  <span className="trait-card-icon">{TRAITS[id].icon}</span>
                  <span className="trait-card-name">{TRAITS[id].name}</span>
                  <span className="trait-card-desc">{TRAITS[id].desc}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
