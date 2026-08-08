import { useState } from 'react';
import { useStore } from 'zustand';
import { gameStore, gameState } from '../../game/store.ts';
import { playSfx } from '../../game/sfx.ts';

// 타이틀 옵션. 값의 주인은 전부 스토어고 여긴 화면만 그린다 — 저장(localStorage)은 각 액션이 직접 한다.
// 음량은 슬라이더 대신 눈금 칸으로 그린다. 부드러운 <input type="range">는 이 화면에서 혼자 현대적이라 튄다.
const STEPS = 5;

interface VolumeRowProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

function VolumeRow({ label, value, onChange }: VolumeRowProps) {
  const lit = Math.round(value * STEPS);
  return (
    <div className="px-row">
      <span className="px-row-label">{label}</span>
      <span className="px-bar" role="group" aria-label={label}>
        <button className="px-bar-mute" onClick={() => onChange(0)} aria-label={`${label} 끄기`}>
          ✕
        </button>
        {Array.from({ length: STEPS }, (_, i) => (
          <button
            key={i}
            className={i < lit ? 'px-cell on' : 'px-cell'}
            onClick={() => onChange((i + 1) / STEPS)}
            aria-label={`${label} ${i + 1}단계`}
            aria-pressed={i < lit}
          />
        ))}
      </span>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  hint?: string;
  on: boolean;
  onToggle: () => void;
}

function ToggleRow({ label, hint, on, onToggle }: ToggleRowProps) {
  return (
    <div className="px-row">
      <span className="px-row-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button className={on ? 'px-toggle on' : 'px-toggle'} onClick={onToggle} aria-pressed={on}>
        {on ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}

export default function OptionsPanel() {
  const bgmOn = useStore(gameStore, (s) => s.bgmOn);
  const bgmVol = useStore(gameStore, (s) => s.bgmVol);
  const sfxVol = useStore(gameStore, (s) => s.sfxVol);
  const screenShake = useStore(gameStore, (s) => s.screenShake);
  const [confirmClear, setConfirmClear] = useState(false);

  // 효과음은 지금 이 화면에서 안 울리므로 조절만으로는 결과를 알 수 없다 — 바꾼 값으로 바로 한 번 들려준다.
  // 후원 팡파레 대신 UI 확인음을 쓴다: 한 칸씩 눌러 볼 때마다 긴 소리가 겹쳐 울리면 값 비교가 안 된다.
  const changeSfx = (v: number) => {
    gameState().setSfxVol(v);
    if (v > 0) playSfx('uiSelect');
  };

  const clear = () => {
    gameState().clearSave();
    setConfirmClear(false);
  };

  return (
    <>
      <div className="px-section">
        <h3 className="px-section-title">소리</h3>
        <ToggleRow label="BGM" hint="방송 중 배경음악" on={bgmOn} onToggle={() => gameState().toggleBgm()} />
        <VolumeRow label="BGM 음량" value={bgmVol} onChange={(v) => gameState().setBgmVol(v)} />
        <VolumeRow label="효과음 음량" value={sfxVol} onChange={changeSfx} />
      </div>

      <div className="px-section">
        <h3 className="px-section-title">화면</h3>
        <ToggleRow
          label="화면 흔들림"
          hint="피격 · 보스 패턴 연출"
          on={screenShake}
          onToggle={() => gameState().toggleScreenShake()}
        />
      </div>

      <div className="px-section">
        <h3 className="px-section-title">데이터</h3>
        {confirmClear ? (
          <div className="px-row">
            <span className="px-row-label danger">해금 도감과 최고 기록이 전부 지워진다. 되돌릴 수 없다.</span>
            <span className="px-confirm">
              <button className="px-btn danger" onClick={clear}>
                지운다
              </button>
              <button className="px-btn" onClick={() => setConfirmClear(false)}>
                취소
              </button>
            </span>
          </div>
        ) : (
          <div className="px-row">
            <span className="px-row-label">
              저장 데이터 초기화
              <small>해금 · 최고 기록</small>
            </span>
            <button className="px-btn" onClick={() => setConfirmClear(true)}>
              초기화
            </button>
          </div>
        )}
      </div>
    </>
  );
}
