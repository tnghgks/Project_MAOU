import { STAFF, CREDIT_SECTIONS, NOTICES_PATH, pendingCount, type Credit } from '../../data/credits.ts';

// 제작진 + 서드파티 고지. MIT·OFL 계열은 배포물에 저작권 표시와 라이선스 사본을 요구하므로
// "게임 안에서 항상 볼 수 있는 화면"과 "배포물에 실린 전문(THIRD-PARTY-NOTICES.md)" 둘 다로 만족시킨다.
// 목록의 출처는 data/credits.ts 하나 — 여긴 그리기만 한다.

const NOTICES_URL = `${import.meta.env.BASE_URL}${NOTICES_PATH}`;

function CreditRow({ item }: { item: Credit }) {
  return (
    <li className={item.pending ? 'px-credit pending' : 'px-credit'}>
      <b>{item.name}</b>
      <small>
        {item.author ? `${item.author} · ` : ''}
        {item.license}
        {item.url && (
          <>
            {' · '}
            <a href={item.url} target="_blank" rel="noreferrer noopener">
              원문
            </a>
          </>
        )}
      </small>
    </li>
  );
}

export default function CreditsPanel() {
  const pending = pendingCount();

  return (
    <>
      <div className="px-section">
        <h3 className="px-section-title">제작진</h3>
        <ul className="px-list">
          {STAFF.map((s) => (
            <li key={s.name} className="px-staff">
              <span className="px-staff-role">{s.role}</span>
              <b>{s.name}</b>
            </li>
          ))}
        </ul>
      </div>

      {CREDIT_SECTIONS.map((section) => (
        <div className="px-section" key={section.title}>
          <h3 className="px-section-title">{section.title}</h3>
          <ul className="px-list">
            {section.items.map((item) => (
              <CreditRow key={item.name} item={item} />
            ))}
          </ul>
        </div>
      ))}

      {pending > 0 && (
        <p className="px-note warn">
          ⚠ 출처 미확인 {pending}건 — 배포 전에 data/credits.ts 와 {NOTICES_PATH} 를 채워야 한다.
        </p>
      )}

      <p className="px-note">
        전체 라이선스 전문은{' '}
        <a href={NOTICES_URL} target="_blank" rel="noreferrer noopener">
          {NOTICES_PATH}
        </a>{' '}
        에 함께 배포된다.
      </p>
      <p className="px-note">© 2026 한호수, 정영준</p>
    </>
  );
}
