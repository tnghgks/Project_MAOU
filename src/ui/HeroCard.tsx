import { useStore } from 'zustand';
import { gameStore, heroPower } from '../game/store.ts';
import { UPGRADES, statOf, type UpgradeKey } from '../data/upgrades.ts';
import { HERO_CHAR } from '../scenes/BootScene.ts';
import SpriteBox from './SpriteBox.tsx';

// 방송 준비 화면의 "오늘의 출연자" 카드 — 용사 초상화 + 지금 스탯.
// 읽기 전용이다: 여기서 강화까지 팔면 던전 상점(UpgradeView)과 역할이 겹치고, 이 화면의 결정
// (몬스터를 뭘 데려가나)이 흐려진다. 여긴 "상대가 이만큼 세다"만 알려주는 자리다.

const STAT_ICON: Record<UpgradeKey, string> = {
  hp: '♥',
  atk: '⚔',
  atkSpd: '⚡',
  speed: '👟',
  range: '↔',
};
const STAT_ORDER = Object.keys(UPGRADES) as UpgradeKey[];

// 전투력은 시작값을 1.00으로 보는 배수(store.heroPower). 숫자만 던지면 그게 센 건지 약한 건지
// 처음 하는 사람은 모른다 — 한 마디로 번역해 준다.
function powerLabel(p: number): string {
  if (p < 1.3) return '아직은 풋내기';
  if (p < 2) return '제법 싸운다';
  if (p < 3.2) return '만만치 않다';
  return '이거 실화냐';
}

export default function HeroCard() {
  const hero = useStore(gameStore, (s) => s.hero);
  const levels = useStore(gameStore, (s) => s.upgradeLevels);
  const power = heroPower(hero);

  return (
    <section className="hero-card">
      <header className="px-window-bar">
        <span className="px-window-title">◆ 오늘의 출연자</span>
      </header>
      <div className="hero-card-body">
        <div className="hero-portrait">
          <SpriteBox char={HERO_CHAR} box={88} glyph="용" />
          <div className="hero-id">
            <b>용사</b>
            <small>성문 앞까지 찾아온 손님</small>
          </div>
        </div>

        <p className="hero-power">
          전투력 <b>{power.toFixed(2)}</b>
          <span className="hero-power-note">{powerLabel(power)}</span>
        </p>

        <dl className="hero-stats">
          {STAT_ORDER.map((k) => (
            <div key={k} className="hero-stat">
              <dt>
                <span className="hero-stat-icon">{STAT_ICON[k]}</span>
                {UPGRADES[k].name.replace(' 증가', '')}
              </dt>
              <dd>
                {statOf(k, hero)}
                {/* 강화를 몇 번 샀는지 — 0이면 아예 안 띄운다(0을 보여주면 눈만 시끄럽다) */}
                {levels[k] > 0 && <span className="hero-stat-lv">+{levels[k]}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
