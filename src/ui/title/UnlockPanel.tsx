import { useStore } from 'zustand';
import { gameStore } from '../../game/store.ts';
import { MONSTERS, type MonsterId } from '../../data/monsters.ts';
import { SKILLS, type SkillId } from '../../data/skills.ts';
import { EPISODES, FINAL_EP } from '../../data/progression.ts';
import { useSpriteThumb, type SpriteThumb } from './useSpriteThumb.ts';

// 해금 도감. 해금 여부는 "지금 런"이 아니라 세이브에 남는 기록(records)만 본다 —
// 런이 끝나 스킬이 초기화돼도 한 번 본 건 계속 보여야 도감이다.
//   몬스터: records.bestEpisode (도달한 최고 화 = 소환할 수 있게 된 시점)
//   보스:   records.seenBosses (실제로 등장을 본 보스 — 화수로 풀면 1화 보스가 처음부터 까발려진다)
//   스킬:   records.learnedSkills (한 번이라도 배운 스킬)

const THUMB_BOX = 72; // 카드 썸네일 한 변(px). 원본 프레임(32~220px)을 이 상자에 맞춰 축소한다

// 보스 카드의 해금 조건 문구용 — 몇 화 보스인지는 진행 표(EPISODES)만 안다.
const bossEpisode = new Map<MonsterId, number>(
  Object.entries(EPISODES).map(([ep, def]) => [def.boss, Number(ep)] as const),
);

interface Entry {
  key: string;
  name: string;
  /** 해금 조건 — 잠긴 카드엔 이것만 뜬다 */
  need: string;
  unlocked: boolean;
  char?: string;
  sheet?: number;
  /** 스프라이트가 없는 항목(스킬)의 대체 문양 */
  glyph?: string;
}

function monsterEntries(bestEpisode: number): Entry[] {
  return (Object.keys(MONSTERS) as MonsterId[])
    .filter((id) => MONSTERS[id].unlock < 99)
    .map((id) => {
      const def = MONSTERS[id];
      return {
        key: id,
        name: def.name,
        need: `${def.unlock}화 도달`,
        unlocked: bestEpisode >= def.unlock,
        char: def.char,
        sheet: 'sheet' in def ? def.sheet : undefined,
      };
    });
}

function bossEntries(seen: readonly MonsterId[]): Entry[] {
  return (Object.keys(MONSTERS) as MonsterId[])
    .filter((id) => MONSTERS[id].unlock >= 99)
    .map((id) => {
      const def = MONSTERS[id];
      const ep = bossEpisode.get(id) ?? FINAL_EP;
      return {
        key: id,
        name: def.name,
        need: `${ep}화 보스 격돌`,
        unlocked: seen.includes(id),
        char: def.char,
        sheet: 'sheet' in def ? def.sheet : undefined,
      };
    });
}

function skillEntries(learned: readonly SkillId[]): Entry[] {
  return (Object.keys(SKILLS) as SkillId[]).map((id) => ({
    key: id,
    name: SKILLS[id].name,
    need: '던전 상점에서 습득',
    unlocked: learned.includes(id),
    glyph: SKILLS[id].name.slice(0, 1),
  }));
}

// 원본 프레임을 상자 안에 통째로 넣는 배율. 시트 좌표를 그대로 쓰려면 background-size를 못 건드리므로
// (원본 이미지 전체 크기를 모른다) 안쪽 요소를 1:1로 깔고 transform으로 줄인다.
function SpriteBox({ thumb, glyph }: { thumb: SpriteThumb | null; glyph?: string }) {
  if (!thumb) {
    return (
      <span className="px-thumb">
        <span className="px-thumb-glyph">{glyph ?? '?'}</span>
      </span>
    );
  }
  const scale = Math.round((THUMB_BOX / Math.max(thumb.w, thumb.h)) * 100) / 100;
  return (
    <span className="px-thumb">
      <span
        className="px-thumb-in"
        style={{
          width: thumb.w,
          height: thumb.h,
          backgroundImage: `url(${thumb.url})`,
          backgroundPosition: `${-thumb.x}px ${-thumb.y}px`,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      />
    </span>
  );
}

function EntryCard({ entry }: { entry: Entry }) {
  // 잠긴 항목은 이미지를 아예 안 받는다 — 스포일러 방지도 되고 네트워크도 아낀다
  const thumb = useSpriteThumb(entry.unlocked ? entry.char : undefined, entry.sheet);
  if (!entry.unlocked) {
    return (
      <div className="px-card locked">
        <span className="px-thumb">
          <span className="px-thumb-glyph">?</span>
        </span>
        <b>? ? ?</b>
        <small>{entry.need}</small>
      </div>
    );
  }
  return (
    <div className="px-card">
      <SpriteBox thumb={thumb} glyph={entry.glyph} />
      <b>{entry.name}</b>
      <small>{entry.need}</small>
    </div>
  );
}

function Section({ title, entries }: { title: string; entries: Entry[] }) {
  const got = entries.filter((e) => e.unlocked).length;
  return (
    <div className="px-section">
      <h3 className="px-section-title">
        {title}
        <span className="px-count">
          {got} / {entries.length}
        </span>
      </h3>
      <div className="px-grid">
        {entries.map((e) => (
          <EntryCard key={e.key} entry={e} />
        ))}
      </div>
    </div>
  );
}

export default function UnlockPanel() {
  const records = useStore(gameStore, (s) => s.records);
  const monsters = monsterEntries(records.bestEpisode);
  const bosses = bossEntries(records.seenBosses);
  const skills = skillEntries(records.learnedSkills);
  const all = [...monsters, ...bosses, ...skills];
  const got = all.filter((e) => e.unlocked).length;

  return (
    <>
      <p className="px-lead">
        방송을 진행하면 도감이 채워진다. 현재 <b>{got}</b> / {all.length} 해금 · 최고 도달{' '}
        <b>{records.bestEpisode}화</b>
      </p>
      <Section title="몬스터" entries={monsters} />
      <Section title="보스" entries={bosses} />
      <Section title="스킬" entries={skills} />
    </>
  );
}
