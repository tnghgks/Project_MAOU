import { useStore } from 'zustand';
import { gameStore, gameState, heroPower } from '../game/store.ts';
import { SKILL_COST, type UpgradeKey } from '../data/upgrades.ts';
import { SKILLS, type SkillId } from '../data/skills.ts';
import { FINAL_EP } from '../data/progression.ts';
import { stageCut } from '../data/cutscenes.ts';
import UpgradeShopList from './UpgradeShopList.tsx';

export default function UpgradeView() {
  const { gold, upgradeLevels, skills, episode, hero } = useStore(gameStore, (s) => ({
    gold: s.gold,
    upgradeLevels: s.upgradeLevels,
    skills: s.skills,
    episode: s.episode,
    hero: s.hero,
  }));
  const locked = (Object.keys(SKILLS) as SkillId[]).filter((k) => !skills.includes(k));
  const nextEp = episode + 1;

  const buy = (key: UpgradeKey) => gameState().applyUpgrade(key);
  const learn = () => {
    const pick = locked[Math.floor(Math.random() * locked.length)];
    gameState().learnSkill(pick, SKILL_COST);
  };
  const next = () => {
    gameState().nextEpisode();
    gameState().playCuts(stageCut(nextEp), () => gameState().setPhase('broadcast')); // 스테이지 진입 컷씬
  };

  return (
    <div className="menu upgrade">
      <h2>용사 강화</h2>
      <p className="gold">
        보유 골드 {Math.floor(gold).toLocaleString()}G · ⚔ 전투력 {heroPower(hero).toFixed(2)}
      </p>
      <p className="owned">전투력이 오를수록 시청자 요청의 목표치도 커진다</p>
      <ul className="shop">
        <UpgradeShopList gold={gold} upgradeLevels={upgradeLevels} onBuy={buy} />
        {locked.length > 0 && (
          <li>
            <button className="skill" disabled={gold < SKILL_COST} onClick={learn}>
              스킬 습득 ({locked.length}종 남음) → {SKILL_COST}G
            </button>
          </li>
        )}
      </ul>
      <p className="owned">보유 스킬: {skills.join(', ')}</p>
      <button className="cta" onClick={next}>
        {nextEp >= FINAL_EP ? '⚔ 최종화: 마왕 vs 용사' : `▶ ${nextEp}화 방송 시작`}
      </button>
    </div>
  );
}
