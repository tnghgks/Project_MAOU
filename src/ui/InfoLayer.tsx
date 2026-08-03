import { useState } from 'react';
import { useStore } from 'zustand';
import { gameStore } from '../game/store.ts';
import { bus } from '../game/events.ts';
import { useBusEvent } from './useBusEvent.ts';
import type { HudTick } from '../game/events.ts';
import { clamp } from '../formulas.ts';
import { ARENA, CANVAS } from '../game/layout.ts';

// Phaser HudScene가 그리던 상단 정보바(시청자수·위험도·골드·시점버튼)를 React로 옮긴 레이어
// (피드백 2026-07-31: "Phaser가 아닌 리액트 단으로"). 3레이어 구조의 2번째 레이어 —
// 1(Phaser 캔버스) 위, 3(리듬/콤보 등 효과, ui-layer) 아래.
// 매 프레임 바뀌는 값(D·critT·modeCd·보스 HP 등)은 store에 없어 BattleScene이 hud:tick으로
// 스로틀 전송한다. viewers/gold/mode는 이미 store가 갖고 있어(중복 전달 방지) 여기선 직접 구독한다.
const BAR_H_PCT = (ARENA.y / CANVAS.H) * 100; // 상단바 높이 = 아레나가 시작되는 y
const CRIT_TOP_PCT = (50 / CANVAS.H) * 100;
const CRIT_LEFT_PCT = (16 / CANVAS.W) * 100;
const REQ_TOP_PCT = (48 / CANVAS.H) * 100;
const VIGNETTE_H_PCT = (ARENA.h / CANVAS.H) * 100;

const ALERT_COLORS = { normal: '#ffffff', warn: '#ff9933', critical: '#ff4444' } as const;

const INIT_TICK: HudTick = {
  D: 0,
  tierLabel: '',
  tierColor: 0x556677,
  alert: 'normal',
  critical: false,
  critT: 0,
  modeCd: 0,
  boss: null,
  stageGold: 0,
  target: 0,
  req: null,
};

export default function InfoLayer() {
  const [tick, setTick] = useState<HudTick>(INIT_TICK);
  useBusEvent('hud:tick', setTick);

  const gold = useStore(gameStore, (s) => s.gold);
  const viewers = useStore(gameStore, (s) => s.viewers);
  const mode = useStore(gameStore, (s) => s.mode);
  const hero = mode === 'hero';
  const tierColor = `#${tick.tierColor.toString(16).padStart(6, '0')}`;

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
            <div
              className="info-hype-fill"
              style={{ width: `${clamp(tick.D, 0, 1) * 100}%`, background: tierColor }}
            />
          </div>
          <span className="info-hype-label">{tick.tierLabel}</span>
        </div>
        {/* 시점 전환 — 실제 전환/쿨타임 거절 판정은 BattleScene.switchMode()가 한다. 여긴 요청만 쏜다. */}
        <button
          type="button"
          className="info-mode-btn"
          style={{ color: tick.modeCd > 0 ? '#6a6a80' : hero ? '#ffcc55' : '#8a8ab0' }}
          onClick={() => bus.emit('mode:toggle', null)}
        >
          {hero ? '⚔ 용사 시점 [C]' : '👑 마왕 시점 [C]'}
          {tick.modeCd > 0 ? ` ${tick.modeCd.toFixed(1)}s` : ''}
        </button>
        {/* 보스 등장 전엔 스테이지 골드(처치+후원) 게이지, 등장 후엔 보스 HP */}
        <span className="info-target" style={{ color: tick.boss ? '#ff4444' : '#ffffff' }}>
          {tick.boss
            ? `☠ ${tick.boss.name} ${Math.ceil(tick.boss.hp).toLocaleString()} / ${tick.boss.maxHp.toLocaleString()}`
            : `🎯 ${Math.floor(tick.stageGold).toLocaleString()} / ${tick.target.toLocaleString()}G`}
        </span>
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
