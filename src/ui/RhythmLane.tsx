import { Fragment, useEffect, useRef, useState } from 'react';
import { bus } from '../game/events.ts';
import { judge, skillResult, type Judgement } from '../formulas.ts';
import { useBusEvent } from './useBusEvent.ts';

// RhythmScene(Phaser)을 DOM으로 옮긴 버전 — 도네이션 dim 팝업의 "춤추는 영역" 안,
// .rhythm-stage(DonationEvent.tsx) 위에 절대위치로 겹쳐 그려진다. 판정 지점은 항상
// 스테이지 가로 중앙(50%) — hero-dance가 그 자리에 flex로 센터되므로 곧 용사 몸통이다.
// 판정 수학(judge/skillResult)은 그대로, 이동은 rAF 폴링 대신 CSS 애니메이션 + setTimeout으로.
const NOTE_SPEED = 400; // px/s — Phaser 버전과 동일한 체감 속도
const SPAWN_LEAD = 1.8; // 스폰 후 첫 노트가 판정 지점에 도달하기까지(초)
const BEAT = 60 / 128; // 128 BPM
const MISS_WINDOW = 0.14; // 판정 지점을 이만큼(초) 지나면 자동 미스
const KEYS = ['Q', 'W', 'E', 'R'];
const KEY_COLORS: Record<string, string> = { Q: '#ff5555', W: '#55ff88', E: '#5599ff', R: '#ffcc44' };

interface Note {
  id: number;
  key: string;
  hitTime: number; // performance.now()/1000 기준
  dur: number; // 스폰 시점 ~ hitTime까지 걸리는 시간(초) = CSS 애니메이션 길이
}

const now = () => performance.now() / 1000;

export default function RhythmLane() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [flash, setFlash] = useState<Judgement | null>(null);
  const notesRef = useRef<Note[]>([]);
  const resultsRef = useRef<Judgement[]>([]);
  const timers = useRef<number[]>([]);
  const flashTimer = useRef<number>();
  const nextId = useRef(0);

  const after = (sec: number, fn: () => void) => timers.current.push(window.setTimeout(fn, sec * 1000));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const setBoth = (list: Note[]) => {
    notesRef.current = list;
    setNotes(list);
  };

  useBusEvent('rhythm:start', () => {
    if (notesRef.current.length > 0) return; // 진행 중이면 무시 (레인 겹침 방지)
    resultsRef.current = [];
    const t0 = now();
    const seq: Note[] = [];
    for (let i = 0; i < 4; i++) {
      const key = KEYS[Math.floor(Math.random() * KEYS.length)];
      const dur = SPAWN_LEAD + i * BEAT;
      const id = nextId.current++;
      seq.push({ id, key, hitTime: t0 + dur, dur });
      after(dur + MISS_WINDOW, () => resolveNote(id, 'miss'));
    }
    setBoth(seq);
  });

  const resolveNote = (id: number, forcedResult?: Judgement) => {
    const note = notesRef.current.find((n) => n.id === id);
    if (!note) return; // 이미 판정됨 (키 입력 vs 자동 미스 타이머 경합)
    const result = forcedResult ?? judge((now() - note.hitTime) * 1000);
    resultsRef.current.push(result);

    setFlash(result);
    clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 400);

    setBoth(notesRef.current.filter((n) => n.id !== id));

    if (resultsRef.current.length === 4) {
      const res = skillResult(resultsRef.current);
      after(0.5, () => setBoth([])); // 마지막 판정 글자를 보여주고 닫는다
      bus.emit('rhythm:result', res); // React가 카드 등급 결정, Battle이 스킬 예약
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      if (!KEYS.includes(k)) return;
      const n = notesRef.current.find((note) => note.key === k && Math.abs(now() - note.hitTime) <= 0.2);
      if (n) resolveNote(n.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (notes.length === 0 && !flash) return null;

  return (
    <Fragment>
      {/* 노트만 가로로 클리핑 — 화면 밖에서 날아오는 연출용 */}
      <div className="rhythm-lane">
        <div className="rhythm-track-bg" />
        <div className="rhythm-target" />
        {notes.map((n) => (
          <span
            key={n.id}
            className="rhythm-note"
            style={
              {
                '--color': KEY_COLORS[n.key],
                '--dur': `${n.dur}s`,
                '--dist': `${n.dur * NOTE_SPEED}px`,
                left: '50%',
              } as React.CSSProperties
            }
          >
            {n.key}
          </span>
        ))}
      </div>
      {/* rhythm-lane 밖(형제)에 둔다 — 안에 있으면 위로 뜨는 판정 글자가 가로 클리핑에 같이 잘린다 */}
      {flash && <span className={`rhythm-flash ${flash}`}>{flash.toUpperCase()}</span>}
    </Fragment>
  );
}
