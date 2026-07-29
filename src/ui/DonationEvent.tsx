import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { bus, type Donation } from '../game/events.ts';
import { useBusEvent } from './useBusEvent.ts';
import { drawCards, reactionCard, RARITY, type Card } from '../data/cards.ts';
import { missingTraits } from '../data/traits.ts';
import { gameState } from '../game/store.ts';
import { CANVAS, SUMMON_Y } from '../game/layout.ts';

// 도네이션 1회의 진행 주체. 이 팝업이 떠 있는 동안 Battle/Hud는 멈춰 있고,
// 카드가 확정되면 'donation:end'로 강화 적용 + 재개를 요청한다 (events.ts 사이클 주석 참고).
type Stage = 'idle' | 'reaction' | 'rhythm' | 'draw' | 'reveal';

// ponytail: 연출 길이 knob — 합이 길수록 전투 정지 시간이 늘어난다
const REACTION_MS = 1400; // 춤 연출 → 노트 시작
const SPIN_MS = 110; // 카드 커서 한 칸
const SPIN_TICKS = 13;
const REVEAL_MS = 1500; // 당첨 카드 노출

// 리듬 단계에서만 비워둘 하단 높이 = 캔버스 리듬 레인(SUMMON_Y~H) 비율. 나머지 단계는 전체를 덮는다.
// ponytail: 캔버스 세로 레터박스는 무시 — layout.fitWidth가 창 비율에 맞춰 폭을 잡아 보통 0이다.
// MAX_W(2560)에 걸리는 초광폭 창에서만 몇 px 어긋난다. 정확히 맞추려면 canvas rect를 읽어야 한다.
const LANE_PCT = ((CANVAS.H - SUMMON_Y) / CANVAS.H) * 100;

export default function DonationEvent() {
  const [stage, setStage] = useState<Stage>('idle');
  const [don, setDon] = useState<Donation | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState(0);
  const timers = useRef<number[]>([]);

  const after = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
  // 방송이 끝나 언마운트되어도 타이머가 살아남지 않게
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const reveal = (list: Card[], win: number) => {
    setCards(list);
    setPicked(win);
    setStage('reveal');
    after(REVEAL_MS, () => {
      setStage('idle');
      bus.emit('donation:end', { card: list[win] });
    });
  };

  useBusEvent('donation:arrive', (d) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setDon(d);
    if (d.jackpot) {
      // 대박 → 리액션: 춤 연출 후 리듬 시퀀스, 보상 카드는 rhythm:result에서 결정
      setStage('reaction');
      after(REACTION_MS, () => {
        setStage('rhythm');
        bus.emit('rhythm:start', null);
      });
      return;
    }
    // 일반 → 카드 3장 노출, 커서가 돌다가 랜덤 1장 당첨
    // 아직 없는 특성만 풀에 섞는다 — 전부 모았으면 기존 강화 카드만 나온다
    const three = drawCards(3, missingTraits(gameState().traits));
    const win = Math.floor(Math.random() * 3);
    setCards(three);
    setCursor(0);
    setStage('draw');
    for (let i = 1; i <= SPIN_TICKS; i++) after(i * SPIN_MS, () => setCursor(i % 3));
    after((SPIN_TICKS + 1) * SPIN_MS, () => reveal(three, win));
  });

  useBusEvent('rhythm:result', (res) => reveal([reactionCard(!!res.highTier)], 0));

  if (stage === 'idle' || !don) return null;
  const dancing = stage === 'reaction' || stage === 'rhythm';

  return (
    <div
      className={don.jackpot ? 'don-event jackpot' : 'don-event'}
      style={stage === 'rhythm' ? { bottom: `${LANE_PCT}%` } : undefined}
    >
      <p className="don-head">
        🎁 {don.donor} · {don.amount.toLocaleString()}G {don.jackpot && <b>대박 후원!!</b>}
      </p>
      {dancing ? (
        <div className="don-reaction">
          {/* ponytail: 영상 자리 — 용사 스프라이트 CSS 춤. 리액션 영상 에셋 생기면 <video>로 교체 */}
          <img className="hero-dance" src={`${import.meta.env.BASE_URL}assets/hero.png`} alt="" />
          <p className="don-tip">{stage === 'reaction' ? '용사가 신나서 춤춘다!' : '⌨ QWER 노트를 맞춰라!'}</p>
        </div>
      ) : (
        <div className="don-cards">
          {cards.map((c, i) => (
            <div
              key={i}
              className={
                'don-card' +
                (c.trait ? ' trait' : '') +
                (stage === 'draw' && i === cursor ? ' on' : '') +
                (stage === 'reveal' ? (i === picked ? ' win' : ' lose') : '')
              }
              style={{ '--rar': RARITY[c.rarity].color } as CSSProperties}
            >
              <span className="rar">{c.trait ? '특성' : RARITY[c.rarity].label}</span>
              <span className="cname">{c.name}</span>
              <span className="cdelta">{c.trait ? c.desc : `+${c.delta}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
