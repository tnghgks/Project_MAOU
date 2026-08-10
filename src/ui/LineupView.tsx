import { useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { gameStore, gameState } from '../game/store.ts';
import { playSfx } from '../game/sfx.ts';
import { MONSTERS, ROLE_LABEL, type MonsterId, type MonsterDef } from '../data/monsters.ts';
import { CUTSCENES, stageCut } from '../data/cutscenes.ts';
import { targetGold } from '../data/progression.ts';
import SpriteBox from './SpriteBox.tsx';
import HeroCard from './HeroCard.tsx';
import MonsterTip from './MonsterTip.tsx';
import {
  defaultLineup,
  emptyLineup,
  lineupBudget,
  lineupCost,
  summonableAt,
  validateLineup,
  waveCost,
  waveThreat,
  waveAt,
  WAVE_CYCLE_GROWTH,
  WAVE_CYCLE_MAX,
  WAVE_ENTRY_MAX,
  WAVE_TYPES_MAX,
  WAVE_INTERVAL,
  type Lineup,
  type LineupError,
} from '../data/waves.ts';
import './lineup.css';

// 방송 준비 화면 (phase 'lineup'). 소환이 자동 웨이브가 된 뒤로 "이번 방송에 뭘 내보내나"가
// 유일한 사전 결정이라, 육성 화면(UpgradeView)과 분리된 전체화면 페이즈로 뒀다.
//
// 컨셉: 파산한 마왕이 개국한 채널의 큐시트를 짜는 자리다(cutscenes.intro 참고). 그래서 화면 이름이
// "웨이브 편성"이 아니라 "방송 준비"이고, 몬스터는 출연진, 예산은 섭외 예산으로 부른다.
// 게임 용어(웨이브·포인트)를 그대로 노출하면 처음 하는 사람에게는 아무 그림도 안 그려진다.
//
// 조작: 웨이브 칸을 고르고 아래 몬스터를 클릭하면 그 칸에 한 마리씩 들어간다.
// 칸 안의 칩을 클릭하면 한 마리씩 빠진다 — 삭제 버튼을 따로 두면 칸이 좁아 다 안 들어간다.
// 초상화에 마우스를 올리면 스탯 쪽지(MonsterTip)가 뜬다.
//
// 아이콘은 이모지가 아니라 게임에 실제로 쓰는 스프라이트다(SpriteBox). tint까지 넘겨서
// 아틀라스를 재활용하는 몬스터(분열 슬라임·주술사·저격수)도 인게임과 같은 색으로 보인다.

// 화별 도입 문구. 뒤이어 재생될 스테이지 컷씬과 같은 사건을 가리켜야 흐름이 이어진다.
// 최종화는 편성 자체를 건너뛰므로(UpgradeView) 여기 없다.
const EP_FLAVOR: Record<number, string> = {
  1: '구독자 0명. 성문 앞에 도착한 용사 하나가 오늘의 유일한 볼거리다.',
  2: '클립이 터졌다. 시청자는 더 센 걸 원하고, 용사도 그새 강해졌다.',
};
const FLAVOR_FALLBACK = '오늘도 성문이 열린다. 무엇을 내보낼지는 마왕의 몫이다.';

// 한 줄 역할 설명 — 스탯 표를 그대로 보여주면 안 읽힌다. "왜 데려가는가"만 적는다.
// 자세한 수치는 초상화 호버(MonsterTip)로 넘긴다.
const MONSTER_ROLE: Partial<Record<MonsterId, string>> = {
  slime: '싸고 물량. 화면을 채우는 기본',
  archer: '멀리서 견제. 용사를 못 쉬게 한다',
  golem: '단단한 몸통. 시간을 끈다',
  bat: '달려들어 자폭. 한 방이 아프다',
  knight: '느리지만 압도적. 후반의 축',
  splitter: '죽으면 슬라임 2마리로 분열',
  turtle: '피해 감소. 약한 공격은 안 통한다',
  shaman: '주변 아군 강화. 먼저 끊어야 할 표적',
  sniper: '초장거리 저격. 무시하면 계속 맞는다',
};

const ERROR_TEXT: Record<LineupError, string> = {
  empty: '웨이브를 하나도 안 채웠습니다',
  overBudget: '섭외 예산을 초과했습니다',
  locked: '아직 섭외할 수 없는 몬스터가 있습니다',
  tooManyTypes: `한 웨이브엔 ${WAVE_TYPES_MAX}종류까지만`,
  tooManyCount: `한 종류는 ${WAVE_ENTRY_MAX}마리까지만`,
};

const CHIP_BOX = 34; // 타임라인 칸 안 썸네일 한 변(px)
const POOL_BOX = 44; // 팔레트 카드 썸네일
const PREVIEW_BOX = 30; // 미리보기 스트립 — 마릿수만큼 깔리므로 작게
const PREVIEW_MAX = 24; // 이 이상은 "+N"으로 접는다. 상한(12마리 × 3종)을 다 깔면 줄이 넘친다
const BUDGET_CELLS = 20; // 예산 게이지 칸 수. 예산이 화마다 달라도 칸 수는 고정이라 눈이 익는다
const CYCLE_TAIL = 3; // 타임라인 끝에 미리 보여줄 반복 웨이브 수

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

interface TipState {
  id: MonsterId;
  x: number;
  y: number;
}

// 몬스터 초상화 + 호버 감지. 반드시 모듈 스코프에 둔다 — LineupView 안에서 정의하면 렌더마다
// 새 컴포넌트 타입이 되어 초상화 전체가 언마운트/재마운트되고, 호버 한 번에 스프라이트 로딩까지
// 다시 시작해 쪽지가 갱신되지 않는다.
// MonsterDef로 좁혀 받는 건 MONSTERS가 satisfies라 줄마다 리터럴 타입이 유니온으로 남기 때문이다
// (선택적 필드를 안 가진 몬스터가 섞이면 유니온 접근이 막힌다).
interface PortraitProps {
  id: MonsterId;
  box: number;
  onShow: (id: MonsterId, el: HTMLElement) => void;
  onHide: () => void;
}
/** 스프라이트만. 고스트 칸·미리보기처럼 호버 쪽지가 필요 없는 자리에 쓴다. */
function MonsterArt({ id, box }: { id: MonsterId; box: number }) {
  const def: MonsterDef = MONSTERS[id];
  return (
    <SpriteBox
      char={def.char}
      sheet={def.sheet}
      tint={def.tint}
      scale={def.scale}
      box={box}
      glyph={def.name.slice(0, 1)}
    />
  );
}

function Portrait({ id, box, onShow, onHide }: PortraitProps) {
  return (
    <span className="art-hit" onMouseEnter={(e) => onShow(id, e.currentTarget)} onMouseLeave={onHide}>
      <MonsterArt id={id} box={box} />
    </span>
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
  const [poolSel, setPoolSel] = useState(0); // 키보드용 팔레트 커서. 마우스로 누를 땐 안 본다
  const [tip, setTip] = useState<TipState | null>(null);

  const budget = lineupBudget(episode);
  const cost = lineupCost(lineup);
  const left = budget - cost;
  const pool = summonableAt(episode);
  const error = validateLineup(lineup, episode);
  const filled = Math.round((Math.min(cost, budget) / budget) * BUDGET_CELLS);
  const epTitle = CUTSCENES[stageCut(episode)]?.title ?? `${episode}화`;

  // 투입 시각은 슬롯 번호가 아니라 "채워진 칸의 순번"으로 정해진다 — waveAt이 빈 칸을 건너뛰고
  // 압축하기 때문이다. 슬롯 인덱스로 계산하면 중간에 빈 칸이 있을 때 표시가 실제와 어긋난다.
  const airTime: (number | null)[] = [];
  let nth = 0;
  for (const w of lineup) airTime.push(w.length ? nth++ * WAVE_INTERVAL : null);
  const filledCount = nth;

  // 위협도 막대는 이 편성 안에서의 상대값이다. 절대 기준을 잡으려면 "적정 난이도"가 먼저
  // 정해져야 하는데 아직 밸런스가 굳지 않았다 — 지금은 웨이브끼리의 경중만 보여준다.
  const maxThreat = Math.max(1, ...lineup.map(waveThreat));

  // 편성을 다 쓴 뒤 이어질 반복 웨이브. 마릿수는 waveAt에서 그대로 가져온다.
  const cycleTail = filledCount
    ? Array.from({ length: CYCLE_TAIL }, (_, k) => {
        const index = filledCount + k;
        const cycle = Math.min(WAVE_CYCLE_MAX, Math.floor(index / filledCount));
        return {
          index,
          at: index * WAVE_INTERVAL,
          mult: (1 + cycle * WAVE_CYCLE_GROWTH).toFixed(1),
          entries: waveAt(lineup, index),
        };
      })
    : [];

  // 선택한 웨이브를 한 마리씩 펼친다 — "×6"보다 스프라이트 여섯 개가 밀도를 빨리 알려준다.
  const selCount = lineup[sel].reduce((s, e) => s + e.count, 0);
  const previewUnits = lineup[sel].flatMap((e) => Array.from({ length: e.count }, () => e.type)).slice(0, PREVIEW_MAX);

  // 키보드 조작. 타이틀 메뉴가 방향키 + 커서(▶)로 도니 편성도 마우스 없이 끝낼 수 있어야 한다.
  // 타임라인이 가로라 ←→가 웨이브, ↑↓가 팔레트다 — 화면에서 그 축이 실제로 그렇게 놓여 있다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 컷씬이 떠 있으면(방송 시작 직후) 그쪽이 입력을 갖는다 — 덮인 화면을 조작하면 안 된다.
      if (document.querySelector('.cutscene')) return;
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault();
        setSel((s) => (s + (k === 'ArrowRight' ? 1 : lineup.length - 1)) % lineup.length);
        playSfx('uiMove');
      } else if (k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        setPoolSel((p) => (p + (k === 'ArrowDown' ? 1 : pool.length - 1)) % pool.length);
        playSfx('uiMove');
      } else if (k === 'Enter') {
        e.preventDefault();
        // Ctrl+Enter는 방송 시작 — 그냥 Enter로 두면 출연진을 넣다가 실수로 방송이 나간다
        if (e.ctrlKey || e.metaKey) start();
        else tryAdd(pool[poolSel]);
      } else if (k === 'Backspace' || k === 'Delete') {
        e.preventDefault();
        // 선택한 웨이브에서 마지막으로 넣은 종류부터 뺀다 — 되돌리기에 가장 가까운 동작이다
        const w = lineup[sel];
        if (w.length) tryRemove(sel, w[w.length - 1].type);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // 초상화 기준으로 쪽지를 띄운다 — 마우스 좌표를 쓰면 손을 조금만 떨어도 쪽지가 흔들린다.
  const showTip = useCallback((id: MonsterId, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ id, x: r.left + r.width / 2, y: r.top });
  }, []);
  const hideTip = useCallback(() => setTip(null), []);

  // 예산을 넘기는 추가는 조용히 막는다 — 눌러도 안 되는 이유는 남은 예산 게이지가 이미 말해준다.
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
    <div className="lineup-screen">
      <div className="px-scanlines" />

      <header className="lineup-head">
        <h2 className="lineup-title">방송 준비</h2>
        <p className="lineup-ep">{epTitle}</p>
        <p className="lineup-flavor">{EP_FLAVOR[episode] ?? FLAVOR_FALLBACK}</p>
      </header>

      <div className="lineup-main">
        <aside className="lineup-side">
          <HeroCard />

          {/* 처음 하는 사람이 이 화면에서 알아야 할 전부. 규칙을 여기 한 번 적어두면
              힌트를 화면 곳곳에 흩뿌리지 않아도 된다. */}
          <section className="guide-card">
            <header className="px-window-bar">
              <span className="px-window-title">◆ 방송은 이렇게 굴러간다</span>
            </header>
            <ol className="guide-list">
              <li>
                <b>웨이브</b>는 한 번에 내보내는 몬스터 한 무리다. 방송이 시작되면 <b>{WAVE_INTERVAL}초</b>마다 다음
                웨이브가 나간다.
              </li>
              <li>
                아래 출연진을 골라 웨이브에 넣는다. <b>섭외 예산</b> 안에서만 가능하다.
              </li>
              <li>
                용사가 <b>아슬아슬할수록 시청자가 몰린다.</b> 다만 용사가 죽으면 방송은 거기서 끝난다.
              </li>
              <li>
                처치 골드와 후원을 합쳐 <b>{targetGold(episode).toLocaleString()}G</b>를 모으면 보스가 등장한다. 보스를
                잡으면 오늘 방송 성공.
              </li>
            </ol>
          </section>
        </aside>

        <section className="px-window wide">
          <header className="px-window-bar">
            <span className="px-window-title">◆ 큐시트 — 웨이브 {sel + 1} 편성 중</span>
            <span className={left < 0 ? 'budget-chip over' : 'budget-chip'}>
              섭외 예산 <b>{cost}</b>/{budget}
              <span className="budget-track" aria-hidden="true">
                {Array.from({ length: BUDGET_CELLS }, (_, i) => (
                  <span
                    key={i}
                    className={i < filled ? (left < 0 ? 'budget-cell over' : 'budget-cell on') : 'budget-cell'}
                  />
                ))}
              </span>
            </span>
          </header>
          <div className="px-window-body">
            <div className="px-section">
              {/* 시간이 왼쪽에서 오른쪽으로 흐르는 타임라인. 세로 목록이던 걸 눕힌 이유는
                  이 화면의 본질이 "무엇을 넣나"가 아니라 "언제 무엇이 나오나"이기 때문이다. */}
              <ol className="wave-track">
                {lineup.map((w, i) => {
                  const threat = waveThreat(w);
                  const at = airTime[i];
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        className={i === sel ? 'wave-card on' : 'wave-card'}
                        onClick={() => setSel(i)}
                        aria-pressed={i === sel}
                      >
                        <span className="wave-time">{at === null ? '건너뜀' : `${at}초`}</span>
                        <span className="wave-no">웨이브 {i + 1}</span>
                        <span className="wave-units">
                          {w.length === 0 ? (
                            <span className="wave-empty">비어 있음</span>
                          ) : (
                            w.map((e) => (
                              <span
                                key={e.type}
                                className="wave-unit"
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
                                {/* 이름은 뺐다 — 칸이 좁아 두 줄로 접힌다. 스프라이트로 알아보고
                                    자세한 건 호버 쪽지가 맡는다. */}
                                <Portrait id={e.type} box={CHIP_BOX} onShow={showTip} onHide={hideTip} />
                                <span className="unit-count">×{e.count}</span>
                                <span className="unit-minus">−</span>
                              </span>
                            ))
                          )}
                        </span>
                        {/* 위협도 — 코스트는 "얼마 썼나"라서 무게를 못 말해준다.
                            막대는 이 편성 안에서 가장 무거운 웨이브를 100%로 잡은 상대값이다. */}
                        <span className="wave-meter" aria-hidden="true">
                          <span
                            className="wave-meter-fill"
                            style={{ width: `${Math.round((threat / maxThreat) * 100)}%` }}
                          />
                        </span>
                        <span className="wave-foot">
                          <span>{waveCost(w)}p</span>
                          <span className="wave-threat">위협 {threat}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}

                {/* 반복 사이클 꼬리 — 편성이 5칸에서 끝나지 않는다는 걸 문장이 아니라 칸으로 보여준다.
                    실제 투입될 마릿수를 waveAt으로 그대로 뽑아 쓴다(추정이 아니라 사실). */}
                {cycleTail.map((t) => (
                  <li key={`ghost-${t.index}`}>
                    <div className="wave-card ghost">
                      <span className="wave-time">{t.at}초</span>
                      <span className="wave-no">↻ ×{t.mult}</span>
                      <span className="wave-units">
                        {t.entries.map((e) => (
                          <span key={e.type} className="wave-unit">
                            <MonsterArt id={e.type} box={CHIP_BOX} />
                            <span className="unit-count">×{e.count}</span>
                          </span>
                        ))}
                      </span>
                      <span className="wave-foot">
                        <span>반복</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* 선택한 웨이브가 실제로 화면에 얼마나 깔리는지 — 숫자 "×6"보다 스프라이트 여섯 개가 빠르다 */}
            <div className="px-section">
              <h3 className="px-section-title">
                웨이브 {sel + 1}에 나올 무리
                <span className="px-count">
                  {selCount}마리 · 위협 {waveThreat(lineup[sel])}
                </span>
              </h3>
              <div className="wave-preview">
                {selCount === 0 ? (
                  <span className="wave-empty">아직 아무도 없습니다</span>
                ) : (
                  previewUnits.map((id, k) => <MonsterArt key={k} id={id} box={PREVIEW_BOX} />)
                )}
                {selCount > PREVIEW_MAX && <span className="preview-more">+{selCount - PREVIEW_MAX}</span>}
              </div>
            </div>

            <div className="px-section">
              <h3 className="px-section-title">
                웨이브 {sel + 1}에 섭외
                <span className="px-count">초상화에 마우스를 올리면 상세 정보 · 남은 예산 {left}p</span>
              </h3>
              <ul className="pool-grid">
                {pool.map((id, i) => {
                  const def: MonsterDef = MONSTERS[id];
                  const affordable = def.cost <= left;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className={i === poolSel ? 'pool-card cursor' : 'pool-card'}
                        disabled={!affordable}
                        onClick={() => {
                          setPoolSel(i);
                          tryAdd(id);
                        }}
                      >
                        <Portrait id={id} box={POOL_BOX} onShow={showTip} onHide={hideTip} />
                        {/* 코스트는 이름의 자식이 아니라 형제다 — .pool-name이 한 줄 고정을 위해
                            overflow: hidden을 갖고 있어서, 안에 두면 절대배치 배지가 잘린다 */}
                        <span className="pool-name">{def.name}</span>
                        <span className="pool-cost">{def.cost}p</span>
                        {/* 배지는 이름 줄이 아니라 설명 줄에 둔다 — 이름 줄은 한 줄 고정이라
                            배지가 끼면 폭을 다투다가 긴 이름(고블린 주술사)이 잘린다. */}
                        <span className="pool-role">
                          {def.role && <span className="role-badge">{ROLE_LABEL[def.role]}</span>}
                          {MONSTER_ROLE[id] ?? ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <div className="lineup-actions">
        <button type="button" className="lineup-btn" onClick={() => setLineup(defaultLineup(episode))}>
          자동 편성
        </button>
        <button type="button" className="lineup-btn" onClick={() => setLineup(emptyLineup())}>
          비우기
        </button>
        <button className="lineup-go" disabled={!!error} onClick={start}>
          ▶ 방송 시작
        </button>
      </div>
      {error ? (
        <p className="lineup-error">! {ERROR_TEXT[error]}</p>
      ) : (
        <p className="lineup-keys">
          <span>
            <b>← →</b> 웨이브
          </span>
          <span>
            <b>↑ ↓</b> 출연진
          </span>
          <span>
            <b>Enter</b> 섭외
          </span>
          <span>
            <b>Backspace</b> 빼기
          </span>
          <span>
            <b>Ctrl+Enter</b> 방송 시작
          </span>
        </p>
      )}

      {tip && <MonsterTip id={tip.id} x={tip.x} y={tip.y} />}
    </div>
  );
}
