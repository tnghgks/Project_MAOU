import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { bus } from '../game/events.ts';
import { gameStore, gameState, type Phase } from '../game/store.ts';
import type { DonationTier } from '../formulas.ts';
import { pickDonationMessage } from '../data/chat.ts';
import { SHOP_LAYOUT, type ShopLayout } from '../data/merchant.ts';
import { FINAL_EP, bossOf } from '../data/progression.ts';
import { MONSTERS } from '../data/monsters.ts';
import { SKILLS, type SkillId } from '../data/skills.ts';

// 개발 모드 전용 디버그 리모콘. 프로덕션 빌드에는 포함되지 않는다 (App.tsx에서 import.meta.env.DEV로 게이팅).
// 목적 하나: 방송을 처음부터 돌리지 않고도 바꾼 화면을 그 자리에서 확인한다.
//   페이즈 점프 · 화 이동 · 보스전 바로 시작 · 골드 지급 · 도네이션 트리거 · 상인 재고 리롤 · 상점 배치 슬라이더.
const PHASES: { label: string; phase: Phase }[] = [
  { label: '타이틀', phase: 'title' },
  { label: '방송', phase: 'broadcast' },
  { label: '정산', phase: 'result' },
  { label: '육성', phase: 'upgrade' },
  { label: '엔딩', phase: 'ending' },
];

const DEV_AMOUNT: Record<DonationTier, number> = { small: 300, middle: 3000, big: 50000 };
const GOLD_STEPS = [1000, 10000];

// 화별 보스. 목록을 따로 들지 않는다 — 화가 늘면 progression.EPISODES 한 줄로 여기 버튼도 따라온다.
const BOSS_EPS = Array.from({ length: FINAL_EP }, (_, i) => i + 1).map((ep) => ({ ep, boss: bossOf(ep) }));

// 모든 스킬 목록
const ALL_SKILL_IDS = Object.keys(SKILLS) as SkillId[];
const SKILL_ICONS: Record<SkillId, string> = {
  화염폭발: '🔥',
  낙뢰: '⚡',
  회복의성가: '💚',
  시간정지: '⏳',
};

// 상점 배치 슬라이더. min/max는 "여기서 벗어나면 화면 밖"인 범위로만 잡는다.
const SLIDERS: { key: keyof ShopLayout; label: string; min: number; max: number; step: number }[] = [
  { key: 'x', label: '가로', min: 0.05, max: 0.95, step: 0.01 },
  { key: 'foot', label: '발높이', min: 0.5, max: 1, step: 0.01 },
  { key: 'scale', label: '크기', min: 0.15, max: 1, step: 0.05 },
  { key: 'dim', label: '어둠', min: 0, max: 0.8, step: 0.05 },
];

export default function DevPanel() {
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<ShopLayout>(SHOP_LAYOUT);
  const [bossEp, setBossEp] = useState<number | null>(null); // 대기 중인 보스전 요청(아래 useEffect가 소비)
  // 골드·화는 버튼으로 바꾼 결과가 패널에 바로 보여야 한다 — 안 보이면 눌렀는지 알 수 없다
  const { gold, episode, phase } = useStore(gameStore, (s) => ({ gold: s.gold, episode: s.episode, phase: s.phase }));

  const goPhase = (phase: Phase) => {
    if (phase === 'broadcast' && gameState().phase !== 'broadcast') gameState().resetRun();
    gameState().setPhase(phase);
  };

  // 보스전 바로 시작. 그 화 방송을 "등장 게이지가 다 찬" 상태로 새로 열어서, 컷씬부터 패턴까지
  // 실제 흐름 그대로 보게 한다(BattleScene.create가 devBossJump를 읽어 게이지를 채운다).
  // 방송을 새로 여는 이유: 화마다 아레나·몬스터 풀·목표가 달라서, 돌던 씬에 보스만 얹으면 화가 섞인다.
  // 그래서 방송 중이면 타이틀로 한 번 나갔다 들어온다 — 페이즈가 그대로면 App이 씬을 다시 켜지 않아
  // create()가 안 돌고, 플래그도 소비되지 않는다.
  const startBoss = (ep: number) => {
    setBossEp(ep);
    gameState().setPhase('title');
  };
  useEffect(() => {
    if (bossEp === null || phase !== 'title') return;
    setBossEp(null);
    goPhase('broadcast'); // resetRun이 화를 1로 되돌리므로 화·플래그는 반드시 그 뒤에 세운다
    gameStore.setState({ episode: bossEp });
    gameState().setDevBossJump(true);
  }, [bossEp, phase]);

  // tier는 실제 게임에선 업그레이드 가격 대비로 계산되지만(formulas.donationTier),
  // 여기선 효과음 3종을 바로 들어보려고 금액과 함께 직접 지정한다.
  const donate = (tier: DonationTier, jackpot = false) => {
    if (gameState().phase !== 'broadcast') goPhase('broadcast');
    bus.emit('donation:arrive', {
      donor: '테스터',
      amount: DEV_AMOUNT[tier],
      jackpot,
      tier,
      message: pickDonationMessage(),
    });
  };

  // 슬라이더는 씬에 바로 쏜다 — 씬을 다시 켜면 배경·트윈이 새로 깔려 조정 흐름이 끊긴다.
  const moveShop = (key: keyof ShopLayout, value: number) => {
    const next = { ...layout, [key]: value };
    setLayout(next);
    bus.emit('dev:shop-layout', next);
  };

  // 스킬 발동 — 방송 중이 아니면 방송으로 전환하고, 해당 스킬을 임시로 추가한 뒤 발동
  const castSkill = (skillId: SkillId) => {
    if (gameState().phase !== 'broadcast') goPhase('broadcast');
    const state = gameState();
    const currentSkills = state.skills;
    // 스킬이 없으면 임시로 추가
    if (!currentSkills.includes(skillId)) {
      state.addSkill(skillId);
    }
    // 스킬 인덱스 찾아서 발동
    const idx = state.skills.indexOf(skillId);
    if (idx >= 0) {
      bus.emit('skill:request', { index: idx });
    }
  };

  return (
    <div className="dev-panel">
      <button className="dev-panel-toggle" onClick={() => setOpen((v) => !v)}>
        🛠 DEV
      </button>
      {open && (
        <div className="dev-panel-body">
          <p className="dev-panel-label">페이즈</p>
          <div className="dev-panel-row">
            {PHASES.map(({ label, phase }) => (
              <button key={phase} onClick={() => goPhase(phase)}>
                {label}
              </button>
            ))}
          </div>

          <p className="dev-panel-label">화 — 지금 {episode}화</p>
          <div className="dev-panel-row">
            {Array.from({ length: FINAL_EP }, (_, i) => i + 1).map((ep) => (
              <button key={ep} onClick={() => gameStore.setState({ episode: ep })}>
                {ep}화
              </button>
            ))}
          </div>

          <p className="dev-panel-label">보스전 — 그 화 방송을 보스 등장부터</p>
          <div className="dev-panel-row">
            {BOSS_EPS.map(({ ep, boss }) => (
              <button key={ep} onClick={() => startBoss(ep)}>
                ☠ {ep}화 {MONSTERS[boss].name}
              </button>
            ))}
          </div>

          <p className="dev-panel-label">골드 — {Math.floor(gold).toLocaleString()}G</p>
          <div className="dev-panel-row">
            {GOLD_STEPS.map((n) => (
              <button key={n} onClick={() => gameState().addGold(n)}>
                +{n.toLocaleString()}
              </button>
            ))}
            <button onClick={() => gameStore.setState({ gold: 0 })}>0</button>
          </div>

          <p className="dev-panel-label">도네이션</p>
          <div className="dev-panel-row">
            <button onClick={() => donate('small')}>소액</button>
            <button onClick={() => donate('middle')}>중간</button>
            <button onClick={() => donate('big')}>고액</button>
            <button onClick={() => donate('big', true)}>대박(리듬)</button>
          </div>

          <p className="dev-panel-label">보스</p>
          <div className="dev-panel-row">
            <button
              onClick={() => {
                if (gameState().phase !== 'broadcast') goPhase('broadcast');
                bus.emit('dev:spawn-boss', null);
              }}
            >
              보스 소환
            </button>
          </div>

          <p className="dev-panel-label">보스 패턴 (베르하르트)</p>
          <div className="dev-panel-row">
            <button
              onClick={() => {
                if (gameState().phase !== 'broadcast') goPhase('broadcast');
                bus.emit('dev:boss-pattern', { pattern: 'swordbeam' });
              }}
            >
              ⚔️ 검기 날리기
            </button>
            <button
              onClick={() => {
                if (gameState().phase !== 'broadcast') goPhase('broadcast');
                bus.emit('dev:boss-pattern', { pattern: 'knightCharge' });
              }}
            >
              🌀 칼날 회전 돌진
            </button>
            <button
              onClick={() => {
                if (gameState().phase !== 'broadcast') goPhase('broadcast');
                bus.emit('dev:boss-pattern', { pattern: 'spaceSlash' });
              }}
            >
              ⚡ 공간 가르기
            </button>
          </div>

          <p className="dev-panel-label">스킬 발동</p>
          <div className="dev-panel-row">
            {ALL_SKILL_IDS.map((skillId) => (
              <button key={skillId} onClick={() => castSkill(skillId)}>
                {SKILL_ICONS[skillId]} {SKILLS[skillId].name}
              </button>
            ))}
          </div>

          <p className="dev-panel-label">상점 배치</p>
          <div className="dev-panel-row">
            <button onClick={() => bus.emit('dev:reroll-stock', null)}>재고 리롤</button>
          </div>
          {SLIDERS.map(({ key, label, min, max, step }) => (
            <label key={key} className="dev-slider">
              <span>{label}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={layout[key]}
                onChange={(e) => moveShop(key, Number(e.target.value))}
              />
              <b>{layout[key].toFixed(2)}</b>
            </label>
          ))}
          {/* 맞춘 값을 data/merchant.ts의 SHOP_LAYOUT에 그대로 옮겨 적으면 고정된다 */}
          <code className="dev-copy">
            {`{ x: ${layout.x.toFixed(2)}, foot: ${layout.foot.toFixed(2)}, scale: ${layout.scale.toFixed(2)}, dim: ${layout.dim.toFixed(2)} }`}
          </code>
        </div>
      )}
    </div>
  );
}
