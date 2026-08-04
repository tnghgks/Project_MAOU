import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { bus, type Donation } from '../game/events.ts';
import { useBusEvent } from './useBusEvent.ts';
import { drawCards, reactionCard, RARITY, type Card } from '../data/cards.ts';
import { gameState } from '../game/store.ts';
import { playDonationSfx } from '../game/sfx.ts';
import RhythmLane from './RhythmLane.tsx';

// 도네이션 1회의 진행 주체.
// alert(트위치풍 후원 알림) → [jackpot이면 reaction→rhythm 전체화면 미니게임] → roulette(카드 룰렛 스핀) → reveal
// alert·roulette·reveal은 채팅창(.chat) 왼쪽에 뜨는 같은 작은 위젯(.donation-widget) 안에서 이어지고,
// 전투는 계속 진행된다 — 화면을 덮고 전투를 멈추는 건 실제 조작이 필요한 reaction/rhythm 미니게임뿐이다
// (BattleScene.fireDonation이 대박일 때만 scene.pause()를 건다).
type Stage = 'idle' | 'alert' | 'reaction' | 'rhythm' | 'roulette' | 'reveal';

// ponytail: 연출 길이 knob — 합이 길수록 전투 정지 시간이 늘어난다
const ALERT_MS = 2400; // 캐릭터 + 후원 메시지 알림 노출 — styles.css alert-pop 애니메이션 길이와 일치
const REACTION_MS = 1400; // 춤 연출 → 노트 시작
const REVEAL_MS = 1600; // 당첨 카드 노출

// 세로 룰렛 릴 지오메트리 — ITEM_H는 styles.css .roulette-vitem height와 반드시 같아야 한다.
const ITEM_H = 44;
const FILLER = 18; // 당첨 칸 앞을 스쳐 지나가는 더미 카드 수
const SPIN_MS = 1700; // 릴 이동 트랜지션 시간 — styles.css .roulette-vtrack transition과 일치
const LANDING_PX = FILLER * ITEM_H;

const heroSrc = `${import.meta.env.BASE_URL}assets/hero.png`;

export default function DonationEvent() {
  const [stage, setStage] = useState<Stage>('idle');
  const [don, setDon] = useState<Donation | null>(null);
  const [reel, setReel] = useState<Card[]>([]);
  const [spun, setSpun] = useState(false);
  const [won, setWon] = useState<Card | null>(null);
  const timers = useRef<number[]>([]);

  const after = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
  // 방송이 끝나 언마운트되어도 타이머가 살아남지 않게
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // 카드 한 장을 릴 끝에 심어 놓고 스핀 → 도착 시 reveal로 넘어간다.
  const spinTo = (card: Card) => {
    const filler = drawCards(FILLER, gameState().traits);
    while (filler.length < FILLER) filler.push(card); // 특성을 거의 다 보유해 필러가 모자라도 릴이 끊기지 않게
    setReel([...filler, card]);
    setSpun(false);
    setStage('roulette');
    // 다음 페인트 이후에 스핀을 걸어야 translateY(0) 상태가 먼저 그려지고 트랜지션이 실제로 걸린다.
    requestAnimationFrame(() => requestAnimationFrame(() => setSpun(true)));
    after(SPIN_MS + 260, () => {
      setWon(card);
      setStage('reveal');
      after(REVEAL_MS, () => {
        setStage('idle');
        bus.emit('donation:end', { card });
      });
    });
  };

  useBusEvent('donation:arrive', (d) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setDon(d);
    playDonationSfx(d.tier);
    setStage('alert');
    after(ALERT_MS, () => {
      if (d.jackpot) {
        // 대박 → 리액션: 춤 연출 후 리듬 시퀀스, 보상 카드는 rhythm:result에서 결정
        setStage('reaction');
        after(REACTION_MS, () => {
          setStage('rhythm');
          bus.emit('rhythm:start', null);
        });
        return;
      }
      // 일반 → 카드 1장을 뽑아 룰렛으로 공개
      // drawCards는 보유 특성을 받아 그만큼 특성 풀에서 뺀다(중복 획득 방지) — 스탯 카드는 영향 없음
      spinTo(drawCards(1, gameState().traits)[0]);
    });
  });

  useBusEvent('rhythm:result', (res) => spinTo(reactionCard(!!res.highTier, gameState().traits)));

  if (stage === 'idle' || !don) return null;

  // 리듬 미니게임만 실제 조작이 필요해 화면 전체를 덮는다 (기존 그대로).
  if (stage === 'reaction' || stage === 'rhythm') {
    return (
      <div className="don-event jackpot">
        <div className="don-reaction">
          <p className="don-head">
            🎁 {don.donor} · {don.amount.toLocaleString()}G <b>대박 후원!!</b>
          </p>
          {/* rhythm-stage: 용사가 flex로 가로 중앙에 서고, RhythmLane은 그 위에 절대위치로 겹쳐
              그려진다 — 판정 지점(50%)이 곧 용사 몸통 위치. 노트 유무와 무관하게 크기가 고정돼
              있어 노트가 스폰될 때 팝업 레이아웃이 밀리지 않는다. */}
          <div className="rhythm-stage">
            {/* ponytail: 영상 자리 — 용사 스프라이트 CSS 춤. 리액션 영상 에셋 생기면 <video>로 교체 */}
            <img className="hero-dance" src={heroSrc} alt="" />
            {/* reaction 단계부터 미리 마운트 — rhythm:start emit 전에 리스너가 붙어있어야 한다 */}
            <RhythmLane />
          </div>
          <p className="don-tip">
            {stage === 'reaction' ? '용사가 신나서 춤춘다!' : '⌨ 노트가 용사 몸에 닿으면 QWER을 눌러라!'}
          </p>
        </div>
      </div>
    );
  }

  // alert·roulette·reveal — 채팅창(.chat) 왼쪽, 채팅과는 별도의 작은 위젯 하나로 이어진다.
  // alert: 박스/배경 없이 춤추는 용사 이미지(위) + 텍스트 2줄(1줄 후원자·금액 / 2줄 메시지) — 뒤로 게임 화면이 그대로 비친다.
  if (stage === 'alert') {
    return (
      <div className="donation-widget stage-alert">
        <img className="alert-hero" src={heroSrc} alt="" />
        <div className="alert-line">
          <b>{don.donor}</b>님이 <b className="amt">{don.amount.toLocaleString()}G</b>를 후원해 주셨어요!
          {don.jackpot && <b className="alert-jackpot"> 대박 후원!!</b>}
        </div>
        <div className="alert-line alert-msg-line">{don.message}</div>
      </div>
    );
  }

  return (
    <div className={don.jackpot ? 'donation-widget stage-draw jackpot' : 'donation-widget stage-draw'}>
      <div className="donation-widget-head">
        <img className="donation-widget-hero" src={heroSrc} alt="" />
        <p className="roulette-head">
          🎰 {don.donor}님의 {don.amount.toLocaleString()}G 카드 룰렛!
        </p>
      </div>

      {stage === 'roulette' && (
        // 세로 슬롯 릴 — 마스크 높이(styles.css .roulette-vmask)가 한 칸(ITEM_H)만 보여줘서
        // 이름이 위로 스쳐 지나가다 마지막 칸(당첨 카드)에서 멈춘 것처럼 보인다.
        <div className="roulette-vmask">
          <div className="roulette-vtrack" style={{ transform: `translateY(-${spun ? LANDING_PX : 0}px)` }}>
            {reel.map((c, i) => (
              <div key={i} className="roulette-vitem">
                {c.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {stage === 'reveal' && won && (
        <div className="roulette-result">
          <span className="roulette-stars">
            {'★'.repeat(RARITY[won.rarity].stars)}
            {'☆'.repeat(5 - RARITY[won.rarity].stars)}
          </span>
          <div className="roulette-vmask reveal" style={{ '--rar': RARITY[won.rarity].color } as CSSProperties}>
            <div className="roulette-vitem">{won.name}</div>
          </div>
          <span className="reveal-desc">{won.desc}</span>
        </div>
      )}
    </div>
  );
}
