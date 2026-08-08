# 서드파티 고지 (Third-Party Notices)

마왕 채널은 아래의 오픈소스 소프트웨어와 에셋을 사용합니다.
MIT · SIL OFL 등 대부분의 오픈소스 라이선스는 **배포물에 저작권 표시와 라이선스 사본을 포함**할 것을 조건으로 하므로,
이 문서는 빌드 결과물(`dist/`)에 그대로 함께 배포되며 게임 내 `제작자 · 라이선스` 화면에서 링크로 열 수 있습니다.

- 게임 내 요약 화면: 타이틀 → **제작자**
- 목록의 원본 데이터: `src/data/credits.ts` (화면과 이 문서는 항상 같은 내용이어야 합니다)

새 라이브러리나 에셋을 추가하면 `src/data/credits.ts`와 이 문서 **양쪽**에 항목을 추가하세요.

---

## 엔진 · 라이브러리

| 이름 | 저작자 | 라이선스 | 출처 |
| --- | --- | --- | --- |
| Phaser 3 | Phaser Studio Inc. | MIT | https://github.com/phaserjs/phaser |
| React / React DOM | Meta Platforms, Inc. and affiliates | MIT | https://github.com/facebook/react |
| Zustand | Poimandres | MIT | https://github.com/pmndrs/zustand |
| Vite | VoidZero Inc. and Vite contributors | MIT | https://github.com/vitejs/vite |

### MIT License 전문

위 MIT 라이선스 소프트웨어에 공통으로 적용되는 허가문입니다. 각 저작권자 표시는 위 표를 참조하십시오.

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 폰트

| 이름 | 저작자 | 라이선스 | 출처 |
| --- | --- | --- | --- |
| Galmuri (갈무리) | quiple | SIL Open Font License 1.1 | https://github.com/quiple/galmuri |

OFL 1.1은 폰트 재배포 시 라이선스 사본 동봉과 저작권 표시를 요구하며, 폰트 자체의 단독 판매를 금지합니다.
라이선스 전문: https://openfontlicense.org

---

## 아트 · 사운드

> **⚠ 배포 전 필수 확인** — 아래 항목은 아직 출처와 라이선스가 확정되지 않았습니다.
> 게임 내 `제작자` 화면에도 경고로 표시되며, 확정되면 이 표와 `src/data/credits.ts`의 `pending` 플래그를 함께 정리하세요.

| 대상 | 경로 | 저작자 | 상태 |
| --- | --- | --- | --- |
| 캐릭터 · 몬스터 스프라이트 | `public/assets/character/` | — | 출처 확인 필요 |
| 타일셋 · 배경 (성 · 사막 · 묘지) | `public/assets/castle/`, `desert/`, `graveyard/`, `*-tiles.png`, `bg.png` | — | 출처 확인 필요 |
| BGM | `public/assets/sounds/bgm/` | — | 출처 확인 필요 |
| Pixel Game Essentials SFX Pack | `public/assets/sounds/sfx/JDSherbert - Pixel Game Essentials SFX Pack - *.ogg` | JDSherbert | **라이선스 확인 필요** — 저작자·팩 이름은 확정, 배포처 약관 미기재 |
| 후원 효과음 (small · middle · big) | `public/assets/sounds/sfx/*_donation.mp3` | — | 출처 확인 필요 |

> 효과음 팩은 파일명에 팩 이름이 그대로 남아 있어 출처 추적이 됩니다(그래서 리네임하지 않았습니다).
> 남은 일은 **받은 배포 페이지의 라이선스 조항과 URL을 이 표에 옮겨 적는 것**입니다.
> 저작자 표시가 의무인 라이선스라면 `JDSherbert` 표기가 게임 내 `제작자` 화면에도 남아 있어야 하며,
> 지금은 `src/data/credits.ts`에 `author: 'JDSherbert'` 로 들어가 있어 그 화면에 노출됩니다.

정리 기준:

- **자체 제작**: 저작자를 표기하고(예: `아트 — 한호수`) `pending`을 제거합니다. 별도 라이선스 고지는 불필요합니다.
- **무료/유료 에셋 팩**: 팩 이름 · 제작자 · 라이선스(CC0, CC BY 4.0, 상용 라이선스 등) · 배포 페이지 URL을 그대로 옮겨 적습니다.
  CC BY 계열은 **저작자 표시가 의무**이므로 이 문서와 게임 내 화면 양쪽에 반드시 노출되어야 합니다.
- **AI 생성물**: 사용한 서비스와 그 서비스의 상용 이용 약관 조항을 함께 적습니다.

---

## 본 게임

© 2026 한호수, 정영준. All rights reserved.

기획 · 아트 — 한호수 / 기획 · 개발 — 정영준
