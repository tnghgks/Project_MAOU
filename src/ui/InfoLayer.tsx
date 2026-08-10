import { useState } from 'react';
import { useStore } from 'zustand';
import { gameStore } from '../game/store.ts';
import { useBusEvent } from './useBusEvent.ts';
import type { HudTick } from '../game/events.ts';
import { clamp } from '../formulas.ts';
import { FINAL_EP } from '../data/progression.ts';
import { ARENA, CANVAS } from '../game/layout.ts';

// Phaser HudScene가 그리던 상단 정보바(시청자수·위험도·골드·시점버튼)를 React로 옮긴 레이어
// (피드백 2026-07-31: "Phaser가 아닌 리액트 단으로"). 3레이어 구조의 2번째 레이어 —
// 1(Phaser 캔버스) 위, 3(리듬/콤보 등 효과, ui-layer) 아래.
// 매 프레임 바뀌는 값(D·critT·보스 HP 등)은 store에 없어 BattleScene이 hud:tick으로
// 스로틀 전송한다. viewers/gold는 이미 store가 갖고 있어(중복 전달 방지) 여기선 직접 구독한다.
const BAR_H_PCT = (ARENA.y / CANVAS.H) * 100; // 상단바 높이 = 아레나가 시작되는 y
const CRIT_TOP_PCT = (50 / CANVAS.H) * 100;
const CRIT_LEFT_PCT = (16 / CANVAS.W) * 100;
const REQ_TOP_PCT = (48 / CANVAS.H) * 100;
const VIGNETTE_H_PCT = (ARENA.h / CANVAS.H) * 100;

const ALERT_COLORS = { normal: '#ffffff', warn: '#ff9933', critical: '#ff4444' } as const;
const WAVE_URGENT_T = 5; // 이 아래로 남으면 시계를 경고색으로 — "곧 온다"를 숫자보다 색이 먼저 알린다

/** 남은 초를 00:00으로. 내림이 아니라 올림이라 0.4초가 남았어도 00:01이고, 진짜 0에서만 00:00이 된다. */
function clockText(t: number): string {
  const s = Math.ceil(Math.max(0, t));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const INIT_TICK: HudTick = {
  D: 0,
  tierLabel: '',
  tierColor: 0x556677,
  alert: 'normal',
  critical: false,
  critT: 0,
  boss: null,
  stageGold: 0,
  target: 0,
  skillCd: {},
  dashCd: 0,
  req: null,
  wave: null,
};

export default function InfoLayer() {
  const [tick, setTick] = useState<HudTick>(INIT_TICK);
  useBusEvent('hud:tick', setTick);

  const gold = useStore(gameStore, (s) => s.gold);
  const viewers = useStore(gameStore, (s) => s.viewers);
  const tierColor = `#${tick.tierColor.toString(16).padStart(6, '0')}`;

  // 웨이브 시계가 --:--로 멈춰 있을 때 왜 멈췄는지는 tick만 봐선 모른다(둘 다 wave === null이다) —
  // SummonPanel과 같은 규칙으로 store에서 갈라 읽는다.
  const bossUp = useStore(gameStore, (s) => s.bossUp);
  const isFinal = useStore(gameStore, (s) => s.episode) >= FINAL_EP;
  const wave = tick.wave;

  return (
    <div className="info-layer">
      <div className="info-bar" style={{ height: `${BAR_H_PCT}%` }}>
        <span className="info-viewers" style={{ color: ALERT_COLORS[tick.alert] }}>
          👁 {Math.floor(viewers).toLocaleString()}
        </span>
        <span className="info-gold">💰 {Math.floor(gold).toLocaleString()}G</span>
        <div className="info-hype">
          <span>🔥</span>
          <div className="info-hype-track">
            <div className="info-hype-fill" style={{ width: `${clamp(tick.D, 0, 1) * 100}%`, background: tierColor }} />
          </div>
          <span className="info-hype-label">{tick.tierLabel}</span>
        </div>
        {/* 보스 등장 전엔 스테이지 골드(처치+후원) 게이지, 등장 후엔 보스 HP */}
        <span className="info-target" style={{ color: tick.boss ? '#ff4444' : '#ffffff' }}>
          {tick.boss
            ? `☠ ${tick.boss.name} ${Math.ceil(tick.boss.hp).toLocaleString()} / ${tick.boss.maxHp.toLocaleString()}`
            : `🎯 ${Math.floor(tick.stageGold).toLocaleString()} / ${tick.target.toLocaleString()}G`}
        </span>

        {/* 웨이브 시계 — 상단바 한가운데에 걸린 간판. 방송 중 제일 자주 보는 숫자라 다른 정보와 같은
            줄에 섞지 않고, 좌(시청자·골드)와 우(목표)의 사이에 절대 위치로 못 박는다.
            남은 시간이 주인공이고 몇 번째 웨이브인지는 그 밑에 작게 — 그래서 시계가 크고 라벨이 작다. */}
        <div className={wave && wave.t <= WAVE_URGENT_T ? 'wave-clock urgent' : 'wave-clock'}>
          <span className="wave-clock-time">{wave ? clockText(wave.t) : '--:--'}</span>
          <span className="wave-clock-sub">
            {wave ? `WAVE ${wave.index + 1}` : isFinal ? 'FINAL' : bossUp ? 'BOSS' : 'READY'}
          </span>
        </div>
      </div>

      {tick.critical && (
        <div className="info-crit" style={{ top: `${CRIT_TOP_PCT}%`, left: `${CRIT_LEFT_PCT}%` }}>
          ⚠ 방송 폐지까지 {Math.max(0, tick.critT).toFixed(1)}초
        </div>
      )}

      {tick.req && (
        <div className="info-req" style={{ top: `${REQ_TOP_PCT}%`, color: tick.req.t <= 5 ? '#ff9933' : '#66ddff' }}>
          📢 {tick.req.label} &nbsp; {Math.round(tick.req.pct * 100)}% &nbsp; {tick.req.t.toFixed(1)}s
        </div>
      )}

      {/* 벼랑끝 비네팅(위험도 D 기준)과 시청자 경보 비네팅(warn/critical) — 둘 다 아레나 영역만 덮는다 */}
      <div
        className="info-vignette"
        style={{
          top: `${BAR_H_PCT}%`,
          height: `${VIGNETTE_H_PCT}%`,
          opacity: tick.D >= 0.75 ? (tick.D - 0.75) * 0.8 : 0,
        }}
      />
      <div
        className="info-alert-vignette"
        style={{
          top: `${BAR_H_PCT}%`,
          height: `${VIGNETTE_H_PCT}%`,
          background: tick.alert === 'critical' ? '#ff4444' : '#ff9933',
          opacity: tick.alert === 'critical' ? 0.25 : tick.alert === 'warn' ? 0.15 : 0,
        }}
      />
    </div>
  );
}
