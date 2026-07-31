import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { bus, type Donation } from '../game/events.ts';
import { useBusEvent } from './useBusEvent.ts';
import { drawCards, reactionCard, RARITY, type Card } from '../data/cards.ts';
import { gameState } from '../game/store.ts';
import RhythmLane from './RhythmLane.tsx';

// 도네이션 1회의 진행 주체. 이 팝업이 떠 있는 동안 Battle/Hud는 멈춰 있고,
// 카드가 확정되면 'donation:end'로 강화 적용 + 재개를 요청한다 (events.ts 사이클 주석 참고).
type Stage = 'idle' | 'reaction' | 'rhythm' | 'draw' | 'reveal';

// ponytail: 연출 길이 knob — 합이 길수록 전투 정지 시간이 늘어난다
const REACTION_MS = 1400; // 춤 연출 → 노트 시작
const SPIN_MS = 110; // 카드 커서 한 칸
const SPIN_TICKS = 13;
const REVEAL_MS = 1500; // 당첨 카드 노출

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
    // drawCards는 보유 특성을 받아 그만큼 특성 풀에서 뺀다(중복 획득 방지) — 스탯 카드는 영향 없음
    const three = drawCards(3, gameState().traits);
    const win = Math.floor(Math.random() * 3);
    setCards(three);
    setCursor(0);
    setStage('draw');
    for (let i = 1; i <= SPIN_TICKS; i++) after(i * SPIN_MS, () => setCursor(i % 3));
    after((SPIN_TICKS + 1) * SPIN_MS, () => reveal(three, win));
  });

  useBusEvent('rhythm:result', (res) => reveal([reactionCard(!!res.highTier, gameState().traits)], 0));

  if (stage === 'idle' || !don) return null;
  const dancing = stage === 'reaction' || stage === 'rhythm';

  return (
    <div className={don.jackpot ? 'don-event jackpot' : 'don-event'}>
      <p className="don-head">
        🎁 {don.donor} · {don.amount.toLocaleString()}G {don.jackpot && <b>대박 후원!!</b>}
      </p>
      {dancing ? (
        <div className="don-reaction">
          {/* rhythm-stage: 용사가 flex로 가로 중앙에 서고, RhythmLane은 그 위에 절대위치로 겹쳐
              그려진다 — 판정 지점(50%)이 곧 용사 몸통 위치. 노트 유무와 무관하게 크기가 고정돼
              있어 노트가 스폰될 때 팝업 레이아웃이 밀리지 않는다. */}
          <div className="rhythm-stage">
            {/* ponytail: 영상 자리 — 용사 스프라이트 CSS 춤. 리액션 영상 에셋 생기면 <video>로 교체 */}
            <img className="hero-dance" src={`${import.meta.env.BASE_URL}assets/hero.png`} alt="" />
            {/* reaction 단계부터 미리 마운트 — rhythm:start emit 전에 리스너가 붙어있어야 한다 */}
            <RhythmLane />
          </div>
          <p className="don-tip">
            {stage === 'reaction' ? '용사가 신나서 춤춘다!' : '⌨ 노트가 용사 몸에 닿으면 QWER을 눌러라!'}
          </p>
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
              <span className="cdelta">{c.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
