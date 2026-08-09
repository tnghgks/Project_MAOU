import { useState } from 'react';
import { useStore } from 'zustand';
import { gameStore, gameState } from '../game/store.ts';
import { playSfx } from '../game/sfx.ts';
import { MONSTERS, type MonsterId } from '../data/monsters.ts';
import { stageCut } from '../data/cutscenes.ts';
import {
  defaultLineup,
  emptyLineup,
  lineupBudget,
  lineupCost,
  summonableAt,
  validateLineup,
  waveCost,
  WAVE_ENTRY_MAX,
  WAVE_TYPES_MAX,
  WAVE_INTERVAL,
  type Lineup,
  type LineupError,
} from '../data/waves.ts';

// 방송 전 웨이브 편성 화면 (phase 'lineup'). 소환이 자동 웨이브가 된 뒤로 "이번 방송에 뭘 데려가나"가
// 유일한 사전 결정이라, 육성 화면(UpgradeView)과 분리된 전체화면 페이즈로 뒀다.
//
// 조작: 왼쪽에서 웨이브 칸을 고르고, 아래 몬스터를 클릭하면 그 칸에 한 마리씩 들어간다.
// 칸 안의 몬스터를 클릭하면 한 마리씩 빠진다 — 삭제 버튼을 따로 두지 않고 클릭 하나로 증감을 다 한다.

const MONSTER_ICON: Partial<Record<MonsterId, string>> = {
  slime: '🟢',
  archer: '🏹',
  golem: '🗿',
  bat: '🦇',
  knight: '⚔️',
  splitter: '🟠',
  turtle: '🐢',
  shaman: '🔮',
  sniper: '🎯',
};

// 한 줄 역할 설명 — 스탯 표를 그대로 보여주면 안 읽힌다. "왜 데려가는가"만 적는다.
const MONSTER_ROLE: Partial<Record<MonsterId, string>> = {
  slime: '싸고 물량. 화면을 채우는 기본',
  archer: '멀리서 견제. 용사를 못 쉬게 한다',
  golem: '단단한 몸통. 시간을 끈다',
  bat: '달려들어 자폭. 한 방이 아프다',
  knight: '느리지만 압도적. 후반 웨이브의 축',
  splitter: '죽으면 슬라임 2마리로 분열',
  turtle: '피해 감소. 약한 공격은 안 통한다',
  shaman: '주변 아군 강화. 먼저 끊어야 할 표적',
  sniper: '초장거리 저격. 무시하면 계속 맞는다',
};

const ERROR_TEXT: Record<LineupError, string> = {
  empty: '웨이브를 하나도 안 채웠습니다',
  overBudget: '편성 포인트를 초과했습니다',
  locked: '아직 못 쓰는 몬스터가 있습니다',
  tooManyTypes: `한 웨이브엔 ${WAVE_TYPES_MAX}종류까지만`,
  tooManyCount: `한 종류는 ${WAVE_ENTRY_MAX}마리까지만`,
};

// 몬스터 한 마리 추가 — 이미 있으면 수량만 올린다. 종류 상한에 걸리면 같은 배열을 그대로 돌려준다
// (호출부가 참조 비교로 "아무 일도 안 일어났다"를 안다).
function addTo(l: Lineup, wi: number, type: MonsterId): Lineup {
  return l.map((w, i) => {
    if (i !== wi) return w;
    if (w.some((e) => e.type === type)) {
      return w.map((e) => (e.type === type ? { ...e, count: Math.min(WAVE_ENTRY_MAX, e.count + 1) } : e));
    }
    return w.length >= WAVE_TYPES_MAX ? w : [...w, { type, count: 1 }];
  });
}

// 한 마리 빼기 — 0이 되면 칸에서 사라진다.
function removeFrom(l: Lineup, wi: number, type: MonsterId): Lineup {
  return l.map((w, i) =>
    i !== wi ? w : w.flatMap((e) => (e.type !== type ? [e] : e.count > 1 ? [{ ...e, count: e.count - 1 }] : [])),
  );
}

export default function LineupView() {
  const episode = useStore(gameStore, (s) => s.episode);
  // 편성은 이 화면 안에서만 흔들리다가 "방송 시작"에서 한 번에 커밋한다 — 중간 상태가 스토어로
  // 새면 되돌릴 방법이 없다. 지난 화 편성을 이월받되 이번 화 기준으로 무효면 자동 편성에서 시작.
  const [lineup, setLineup] = useState<Lineup>(() => {
    const carried = gameState().lineup;
    return validateLineup(carried, episode) ? defaultLineup(episode) : carried;
  });
  const [sel, setSel] = useState(0);

  const budget = lineupBudget(episode);
  const cost = lineupCost(lineup);
  const left = budget - cost;
  const pool = summonableAt(episode);
  const error = validateLineup(lineup, episode);

  // 예산을 넘기는 추가는 조용히 막는다 — 눌러도 안 되는 이유는 남은 포인트 표시가 이미 말해준다.
  const tryAdd = (type: MonsterId) => {
    const next = addTo(lineup, sel, type);
    if (next === lineup || lineupCost(next) > budget) return;
    playSfx('uiSelect');
    setLineup(next);
  };
  const tryRemove = (wi: number, type: MonsterId) => {
    playSfx('uiMove');
    setLineup(removeFrom(lineup, wi, type));
  };

  // 편성 확정 → 스테이지 진입 컷씬 → 방송. 컷씬을 편성 "뒤"에 두는 이유는 그게 곧 "이제 들어간다"는
  // 신호이기 때문 — 앞에 두면 컷씬으로 분위기를 잡아놓고 다시 표를 만지는 꼴이 된다.
  // 컷씬이 도는 동안 phase는 아직 'lineup'이라 이 화면은 마운트된 채 남지만,
  // .cutscene이 position:fixed·z-index 60으로 전체를 덮어 조작이 새지 않는다.
  const start = () => {
    if (error) return;
    playSfx('uiSelect');
    gameState().setLineup(lineup);
    gameState().playCuts(stageCut(episode), () => gameState().setPhase('broadcast'));
  };

  return (
    <div className="menu lineup">
      <header className="lineup-head">
        <h2 className="lineup-title">{episode}화 웨이브 편성</h2>
        <p className="lineup-hint">
          방송 중엔 이 순서대로 {WAVE_INTERVAL}초마다 자동 투입 · 다 쓰면 물량이 불어난 채 처음부터 반복 ·<b> SPACE</b>
          로 다음 웨이브를 앞당길 수 있습니다
        </p>
        <p className={left < 0 ? 'lineup-budget over' : 'lineup-budget'}>
          편성 포인트 <b>{cost}</b> / {budget}
          <span className="lineup-left">남은 {left}</span>
        </p>
      </header>

      <ol className="wave-list">
        {lineup.map((w, i) => (
          <li key={i}>
            <button
              type="button"
              className={i === sel ? 'wave-row selected' : 'wave-row'}
              onClick={() => setSel(i)}
              aria-pressed={i === sel}
            >
              <span className="wave-no">웨이브 {i + 1}</span>
              <span className="wave-slots">
                {w.length === 0 ? (
                  <span className="wave-empty">비어 있음 — 아래에서 몬스터를 고르세요</span>
                ) : (
                  w.map((e) => (
                    <span
                      key={e.type}
                      className="wave-chip"
                      role="button"
                      tabIndex={0}
                      title={`${MONSTERS[e.type].name} 한 마리 빼기`}
                      onClick={(ev) => {
                        ev.stopPropagation(); // 칸 선택으로 번지지 않게 — 칩은 "빼기" 전용이다
                        tryRemove(i, e.type);
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key !== 'Enter' && ev.key !== ' ') return;
                        ev.stopPropagation();
                        ev.preventDefault();
                        tryRemove(i, e.type);
                      }}
                    >
                      <span className="chip-icon">{MONSTER_ICON[e.type] ?? '❔'}</span>
                      <span className="chip-name">{MONSTERS[e.type].name}</span>
                      <span className="chip-count">×{e.count}</span>
                    </span>
                  ))
                )}
              </span>
              <span className="wave-cost">{waveCost(w)}p</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="lineup-pool">
        <p className="pool-label">웨이브 {sel + 1}에 추가</p>
        <ul className="pool-grid">
          {pool.map((id) => {
            const def = MONSTERS[id];
            const affordable = def.cost <= left;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={affordable ? 'pool-card' : 'pool-card poor'}
                  disabled={!affordable}
                  onClick={() => tryAdd(id)}
                >
                  <span className="pool-icon">{MONSTER_ICON[id] ?? '❔'}</span>
                  <span className="pool-name">{def.name}</span>
                  <span className="pool-role">{MONSTER_ROLE[id] ?? ''}</span>
                  <span className="pool-cost">{def.cost}p</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="lineup-actions">
        <button type="button" className="lineup-btn" onClick={() => setLineup(defaultLineup(episode))}>
          🎲 자동 편성
        </button>
        <button type="button" className="lineup-btn" onClick={() => setLineup(emptyLineup())}>
          🧹 비우기
        </button>
        <button className="cta" disabled={!!error} onClick={start}>
          ▶ 방송 시작
        </button>
      </div>
      {error && <p className="lineup-error">{ERROR_TEXT[error]}</p>}
    </div>
  );
}
