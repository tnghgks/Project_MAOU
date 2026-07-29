import Phaser from 'phaser';
import { judge, skillResult, type Judgement } from '../formulas.ts';
import { bus, busBind } from '../game/events.ts';
import { CANVAS, CX, SUMMON_Y } from '../game/layout.ts';

const LANE_Y = SUMMON_Y; // 레인은 소환 바를 통째로 덮는다 — 리액션 중엔 전투가 멈춰 카드를 못 쓴다
const NOTE_Y = (LANE_Y + CANVAS.H) / 2; // 레인 세로 중앙
const HIT_X = 140;
const NOTE_SPEED = 400; // px/s
const BEAT = 60 / 128; // 128 BPM
const KEYS = ['Q', 'W', 'E', 'R'];
const KEY_COLORS: Record<string, number> = { Q: 0xff5555, W: 0x55ff88, E: 0x5599ff, R: 0xffcc44 };

interface Note {
  key: string;
  hitTime: number;
  spr: Phaser.GameObjects.Arc;
  txt: Phaser.GameObjects.Text;
  done: boolean;
}

// 리액션 이벤트(대박 후원) 때만 하단 레인이 열린다 → QWER 판정 → 결과를 bus로 전달.
// 시퀀스 요청은 React(DonationEvent)가 'rhythm:start'로 보낸다.
export default class RhythmScene extends Phaser.Scene {
  notes!: Note[];
  noteResults!: Judgement[];
  judgeText!: Phaser.GameObjects.Text;
  lane!: Phaser.GameObjects.Container;

  constructor() {
    super('Rhythm');
  }

  create() {
    this.notes = [];
    this.noteResults = [];

    const add = this.add;
    this.judgeText = add
      .text(HIT_X, LANE_Y + 8, '', { fontSize: '16px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    this.lane = add
      .container(0, 0, [
        add.rectangle(CX, NOTE_Y, CANVAS.W, CANVAS.H - LANE_Y, 0x0d0d14),
        add.circle(HIT_X, NOTE_Y, 24).setStrokeStyle(3, 0xffffff),
        add.text(20, NOTE_Y - 10, 'QWER▶', { fontSize: '16px', color: '#555566' }),
        this.judgeText,
      ])
      .setDepth(5)
      .setVisible(false);

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      if (KEYS.includes(k)) this.hitNote(k);
    });

    busBind(this, 'rhythm:start', () => this.spawnSeq());
  }

  // ponytail: seam — BGM 도입 시 AudioContext.currentTime 기준으로 교체 (rAF 드리프트 방지)
  audioClock() {
    return this.time.now / 1000;
  }

  spawnSeq() {
    if (this.notes.length > 0) return; // 진행 중이면 무시 (레인 겹침 방지)
    this.noteResults = [];
    this.lane.setVisible(true);
    const now = this.audioClock();
    for (let i = 0; i < 4; i++) {
      const key = Phaser.Utils.Array.GetRandom(KEYS);
      const hitTime = now + 1.8 + i * BEAT;
      const spr = this.add.circle(0, NOTE_Y, 18, KEY_COLORS[key]).setDepth(7);
      const txt = this.add
        .text(0, NOTE_Y, key, { fontSize: '18px', fontStyle: 'bold', color: '#000000' })
        .setOrigin(0.5)
        .setDepth(8);
      this.notes.push({ key, hitTime, spr, txt, done: false });
    }
  }

  hitNote(key: string) {
    const now = this.audioClock();
    const note = this.notes.find((n) => !n.done && Math.abs(now - n.hitTime) <= 0.2);
    if (!note) return;
    const result = note.key === key ? judge((now - note.hitTime) * 1000) : 'miss';
    this.resolveNote(note, result);
  }

  resolveNote(note: Note, result: Judgement) {
    note.done = true;
    note.spr.destroy();
    note.txt.destroy();
    this.noteResults.push(result);
    const colors: Record<Judgement, string> = { perfect: '#ffee44', good: '#66ff88', miss: '#ff5555' };
    this.judgeText.setText(result.toUpperCase()).setColor(colors[result]);
    this.time.delayedCall(400, () => this.judgeText.setText(''));
    if (this.noteResults.length === 4) {
      const res = skillResult(this.noteResults);
      this.notes = [];
      this.time.delayedCall(500, () => this.lane.setVisible(false)); // 마지막 판정 글자를 보여주고 닫는다
      bus.emit('rhythm:result', res); // React가 카드 등급 결정, Battle이 스킬 예약
    }
  }

  update() {
    const now = this.audioClock();
    for (const n of this.notes) {
      if (n.done) continue;
      const x = HIT_X + (n.hitTime - now) * NOTE_SPEED;
      n.spr.setX(x);
      n.txt.setX(x);
      if (now - n.hitTime > 0.14) this.resolveNote(n, 'miss');
    }
  }
}
