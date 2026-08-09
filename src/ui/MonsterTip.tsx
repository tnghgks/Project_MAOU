import { MONSTERS, type MonsterId, type MonsterDef } from '../data/monsters.ts';

// 몬스터 초상화에 마우스를 올리면 뜨는 스탯 쪽지.
// 카드에 스탯을 전부 박아 넣으면 팔레트가 표가 돼서 훑어보기가 안 된다 — 평소엔 역할 한 줄만 두고,
// 궁금할 때만 여기서 숫자를 편다. 특성(분열·오라·방어)은 숫자보다 이게 편성을 가르므로 따로 묶는다.

const TIP_W = 244; // lineup.css .monster-tip width와 같아야 화면 가장자리 물림이 맞는다
const FLIP_Y = 250; // 이 위쪽에서 잡히면 쪽지를 아래로 편다 (위로 펴면 화면 밖으로 나간다)

interface MonsterTipProps {
  id: MonsterId;
  /** 초상화의 화면 좌표 */
  x: number;
  y: number;
}

interface Row {
  k: string;
  v: string;
}

function statRows(def: MonsterDef): Row[] {
  return [
    { k: '체력', v: `${def.hp}` },
    { k: '공격력', v: `${def.dmg}` },
    { k: '공격 주기', v: `${def.atkCd}초` },
    { k: '이동 속도', v: `${def.speed}` },
    { k: '사거리', v: `${def.range}${def.ranged ? ' (원거리)' : ''}` },
    { k: '처치 보상', v: `${def.gold}G` },
  ];
}

// 특성 문구는 "무엇을 하는가"로 적는다. 필드명(aura/armor)을 그대로 노출하면 아무 도움이 안 된다.
function traitLines(def: MonsterDef): string[] {
  const out: string[] = [];
  if (def.split) {
    const child = MONSTERS[def.split.into as MonsterId];
    out.push(`분열 — 죽으면 ${child ? child.name : '다른 몬스터'} ${def.split.count}마리가 나온다`);
  }
  if (def.armor) out.push(`방어 ${def.armor} — 한 방이 약하면 거의 안 박힌다`);
  if (def.aura) {
    const atk = Math.round((def.aura.atk - 1) * 100);
    const spd = Math.round((def.aura.speed - 1) * 100);
    out.push(`오라 — 주변 아군 공격력 +${atk}%, 이동 +${spd}%`);
  }
  if (def.suicide) out.push('자폭 — 용사에게 닿는 순간 터진다');
  if (def.ranged && !def.aura) out.push('원거리 — 거리를 두고 쏜다');
  if (def.kb !== undefined && def.kb <= 0.3) out.push('무겁다 — 맞아도 잘 안 밀린다');
  return out;
}

export default function MonsterTip({ id, x, y }: MonsterTipProps) {
  const def: MonsterDef = MONSTERS[id];
  const traits = traitLines(def);

  // 화면 밖으로 새지 않게 가로는 물리고, 위쪽에서 잡히면 아래로 편다.
  const half = TIP_W / 2 + 8;
  const left = Math.min(Math.max(x, half), window.innerWidth - half);
  const below = y < FLIP_Y;

  return (
    <div
      className="monster-tip"
      role="tooltip"
      style={{
        left,
        top: below ? y + 26 : y - 12,
        transform: below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
    >
      <p className="tip-name">
        {def.name}
        <span className="tip-cost">{def.cost}p</span>
      </p>
      <dl className="tip-stats">
        {statRows(def).map((r) => (
          <div key={r.k}>
            <dt>{r.k}</dt>
            <dd>{r.v}</dd>
          </div>
        ))}
      </dl>
      {traits.length > 0 && (
        <ul className="tip-traits">
          {traits.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
