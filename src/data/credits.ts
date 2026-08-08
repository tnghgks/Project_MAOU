// 제작진 + 서드파티 고지의 단일 출처. 타이틀 화면 "제작자" 패널이 이 파일만 읽고,
// public/THIRD-PARTY-NOTICES.md 는 같은 목록의 전문(라이선스 원문 링크 포함)이다.
//
// MIT·OFL 같은 라이선스는 "배포물에 저작권 표시와 라이선스 사본을 포함"하는 걸 조건으로 건다.
// 웹 게임에서 그 의무를 지키는 확실한 방법이 두 가지라 둘 다 한다:
//   1) 게임 안에서 언제든 볼 수 있는 고지 화면 (이 파일 → CreditsPanel)
//   2) 배포물에 같이 실려 URL로 열리는 전문 (public/THIRD-PARTY-NOTICES.md)
// 새 에셋/라이브러리를 들이면 여기에 한 줄 추가하고 그 md에도 같은 항목을 적는다.

export interface StaffMember {
  role: string;
  name: string;
}

export const STAFF: readonly StaffMember[] = [
  { role: '기획 · 아트', name: '한호수' },
  { role: '기획 · 개발', name: '정영준' },
];

export interface Credit {
  /** 화면에 뜨는 이름 (라이브러리명·폰트명·에셋 팩 이름) */
  name: string;
  /** 저작자/저작권자 — MIT·OFL이 요구하는 "저작권 표시"가 이 값이다 */
  author?: string;
  /** 라이선스 이름. 전문은 url 또는 THIRD-PARTY-NOTICES.md 에 */
  license: string;
  url?: string;
  /** 출처·라이선스가 아직 확정되지 않은 항목. 화면에 경고색으로 떠서 배포 전에 반드시 눈에 걸린다. */
  pending?: boolean;
}

export interface CreditSection {
  title: string;
  items: readonly Credit[];
}

export const CREDIT_SECTIONS: readonly CreditSection[] = [
  {
    title: '엔진 · 라이브러리',
    items: [
      { name: 'Phaser 3', author: 'Phaser Studio Inc.', license: 'MIT', url: 'https://github.com/phaserjs/phaser' },
      { name: 'React', author: 'Meta Platforms, Inc.', license: 'MIT', url: 'https://github.com/facebook/react' },
      { name: 'Zustand', author: 'Poimandres', license: 'MIT', url: 'https://github.com/pmndrs/zustand' },
      {
        name: 'Vite',
        author: 'VoidZero Inc. & Vite contributors',
        license: 'MIT',
        url: 'https://github.com/vitejs/vite',
      },
    ],
  },
  {
    title: '폰트',
    items: [
      {
        name: 'Galmuri (갈무리)',
        author: 'quiple',
        license: 'SIL Open Font License 1.1',
        url: 'https://github.com/quiple/galmuri',
      },
    ],
  },
  {
    // ponytail: 아트/사운드 출처 knob — 자체 제작이면 저작자를 적고 pending을 지운다.
    // 외부 팩(무료·유료 불문)을 썼다면 팩 이름·저작자·라이선스를 그대로 옮겨 적어야 한다.
    title: '아트 · 사운드',
    items: [
      { name: '캐릭터 · 몬스터 스프라이트', license: '출처 확인 필요', pending: true },
      { name: '타일셋 · 배경 (성 · 사막 · 묘지)', license: '출처 확인 필요', pending: true },
      { name: 'BGM', license: '출처 확인 필요', pending: true },
      // 효과음 팩은 출처(제작자·팩 이름)가 확실하지만 배포처 약관을 아직 옮겨 적지 않았다 —
      // 저작자 표시가 의무인 라이선스일 수 있어 확인 전까지는 pending을 유지한다.
      {
        name: 'Pixel Game Essentials SFX Pack',
        author: 'JDSherbert',
        license: '라이선스 확인 필요 (배포처 약관)',
        pending: true,
      },
      { name: '후원 효과음 (small · middle · big)', license: '출처 확인 필요', pending: true },
    ],
  },
];

/** 배포물에 같이 실리는 고지 전문. public/ 에 있어 빌드 결과의 루트에서 그대로 열린다. */
export const NOTICES_PATH = 'THIRD-PARTY-NOTICES.md';

/** 아직 출처를 못 채운 항목 수 — 크레딧 화면 상단 경고 배지에 쓴다. */
export const pendingCount = (): number =>
  CREDIT_SECTIONS.reduce((n, s) => n + s.items.filter((i) => i.pending).length, 0);
