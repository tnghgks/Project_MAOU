import Phaser from 'phaser';
import { judge, skillResult, type Judgement } from '../formulas.ts';
import { bus } from '../game/events.ts';

const LANE_Y = 640;
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

// 도네이션 시 하단 레인에 노트 생성 → QWER 판정 → 결과를 bus로 BattleScene에 전달.
export default class RhythmScene extends Phaser.Scene {
  notes!: Note[];
  noteResults!: Judgement[];
  judgeText!: Phaser.GameObjects.Text;

  constructor() { super('Rhythm'); }

  create() {
    this.notes = [];
    this.noteResults = [];

    const add = this.add;
    add.rectangle(640, (LANE_Y + 720) / 2, 1280, 720 - LANE_Y, 0x0d0d14).setDepth(5);
    add.circle(HIT_X, LANE_Y + 40, 24).setStrokeStyle(3, 0xffffff).setDepth(6);
    add.text(20, LANE_Y + 30, 'QWER▶', { fontSize: '16px', color: '#555566' }).setDepth(6);
    this.judgeText = add.text(HIT_X, LANE_Y + 8, '', { fontSize: '16px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(8);

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      if (KEYS.includes(k)) this.hitNote(k);
    });
  }

  // ponytail: seam — BGM 도입 시 AudioContext.currentTime 기준으로 교체 (rAF 드리프트 방지)
  audioClock() { return this.time.now / 1000; }

  spawnSeq() {
    if (this.notes.length > 0) return; // 진행 중이면 무시 (레인 겹침 방지)
    this.noteResults = [];
    const now = this.audioClock();
    for (let i = 0; i < 4; i++) {
      const key = Phaser.Utils.Array.GetRandom(KEYS);
      const hitTime = now + 1.8 + i * BEAT;
      const spr = this.add.circle(0, LANE_Y + 40, 18, KEY_COLORS[key]).setDepth(7);
      const txt = this.add.text(0, LANE_Y + 40, key, { fontSize: '18px', fontStyle: 'bold', color: '#000000' }).setOrigin(0.5).setDepth(8);
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
      bus.emit('rhythm:result', res); // BattleScene가 스킬 발동
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
