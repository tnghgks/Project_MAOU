import { useStore } from 'zustand';
import { gameStore, gameState } from '../game/store.ts';
import { UPGRADES, SKILL_COST, upgradeCost, type UpgradeKey } from '../data/upgrades.ts';
import { SKILLS, type SkillId } from '../data/skills.ts';
import { FINAL_EP } from '../data/progression.ts';

export default function UpgradeView() {
  const { gold, upgradeLevels, skills, episode } = useStore(gameStore, (s) => ({
    gold: s.gold, upgradeLevels: s.upgradeLevels, skills: s.skills, episode: s.episode,
  }));
  const locked = (Object.keys(SKILLS) as SkillId[]).filter((k) => !skills.includes(k));
  const nextEp = episode + 1;

  const buy = (key: UpgradeKey) => gameState().applyUpgrade(key);
  const learn = () => {
    const pick = locked[Math.floor(Math.random() * locked.length)];
    gameState().learnSkill(pick, SKILL_COST);
  };
  const next = () => { gameState().nextEpisode(); gameState().setPhase('broadcast'); };

  return (
    <div className="menu upgrade">
      <h2>용사 강화</h2>
      <p className="gold">보유 골드 {Math.floor(gold).toLocaleString()}G</p>
      <ul className="shop">
        {(Object.keys(UPGRADES) as UpgradeKey[]).map((key) => {
          const u = UPGRADES[key];
          const cost = upgradeCost(key, upgradeLevels[key]);
          const afford = gold >= cost;
          return (
            <li key={key}>
              <button disabled={!afford} onClick={() => buy(key)}>
                {u.name} <span className="lv">Lv.{upgradeLevels[key]}</span> +{u.delta} → {cost.toLocaleString()}G
              </button>
            </li>
          );
        })}
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
