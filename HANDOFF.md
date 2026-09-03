# 오터포스 고객센터 — 인수인계

> 2026-08-26 · 작성: jigu.kang
> 받는 분: tryotter.co.kr Cloudflare 계정 접근 권한이 있는 담당자

## 1. 이게 뭔가

**오터포스 가맹점용 고객센터를 자체 개발한 것**입니다. 기존 노션 고객센터를 대체합니다.

Cloudflare Workers 하나가 공개 사이트·어드민·API를 모두 담당하고, 문서는 D1(SQLite),
이미지는 R2에 저장합니다. 문서 27편이 작성돼 있습니다.

**왜 노션을 안 쓰나** — 기존 노션은 매뉴얼 30개 섹션이 한 페이지에 있어 개별 URL이 없었고
(SEO 색인 불가, CS가 딥링크 전달 불가), 본문 텍스트가 10,586자뿐이라 내용이 스크린샷 안에만
있었습니다. 자세한 진단은 `IA.md` 1장 참조.

## 2. 지금 상태

| 항목 | 값 |
|---|---|
| 문서 | **27편 / 본문 22,192자** (전부 `draft` 상태) |
| 임시 배포 | https://otter-helpcenter.riseupjig.workers.dev/help/ |
| 배포 계정 | riseupjig@gmail.com (**개인 계정 — 이관 대상**) |
| 검색엔진 | `NOINDEX=true` 로 차단 중 |
| 미리보기 모드 | `PREVIEW_MODE=true` — 초안도 보이고 "초안" 배지 표시 |

**임시 배포는 사내 검토용입니다.** 회사 계정으로 옮긴 뒤 삭제하면 됩니다.

## 3. 원본이 어디인지 — 가장 중요합니다

**문서의 원본은 D1입니다. `drafts/*.md` 는 D1을 내려받아 저장한 사본입니다.**

- 어드민에서 문서를 고치면 D1이 바뀝니다. `drafts/` 는 자동으로 안 바뀝니다.
- `app/scripts/import.mjs` 는 `drafts/` → D1 **한 방향**입니다.
  **이미 운영 중인 D1에 이걸 실행하면 최신 내용이 낡은 파일로 덮어써집니다.** 최초 1회만 쓰세요.
- 반대 방향(D1 → 파일)은 어드민의 **[전체 내보내기]** 또는 `GET /help/admin/api/export` 입니다.
- 저장소를 최신으로 맞추려면 내보내기 결과를 `drafts/` 에 덮어쓰고 커밋하세요.

실제로 이 함정을 한 번 겪었습니다. 8월 26일에 로컬 파일과 D1이 1,498자 갈라져 있었고,
D1 내용을 파일로 역동기화해서 맞췄습니다.

## 4. 회사 계정으로 배포하기

### 사전 준비
```bash
cd otter-helpcenter/app
npm install
npx wrangler login          # 회사 Cloudflare 계정으로 로그인
```

### ⚠️ 반드시 `--config` 를 붙이세요
리포 루트(`claude-code-folder/`)에 **다른 프로젝트의 `wrangler.jsonc` 가 있습니다.**
wrangler 가 그걸 우선 읽어서, 옵션 없이 배포하면 **엉뚱한 워커가 만들어집니다.**
(실제로 이 사고를 두 번 냈습니다. `otter-website` 폴더가 통째로 공개됐고 즉시 삭제했습니다.)

```bash
npx wrangler deploy --config ./wrangler.toml     # ✅
npx wrangler deploy                              # ❌ 절대 금지
```

### D1 · R2 생성
```bash
npx wrangler d1 create otter-helpcenter
#   → 출력된 database_id 를 wrangler.toml 의 [[d1_databases]] 에 기입

npx wrangler r2 bucket create otter-helpcenter-media
#   → "Please enable R2" 오류가 나면 대시보드에서 R2 를 먼저 활성화 (카드 등록 필요할 수 있음)
```

### 스키마 · 문서 넣기
```bash
npx wrangler d1 execute otter-helpcenter --remote --file=./schema.sql
node scripts/import.mjs                                        # drafts/ → .seed.sql
npx wrangler d1 execute otter-helpcenter --remote --file=./.seed.sql
```

### 시크릿 3개 — 직접 새로 만드세요
기존 값은 넘기지 않았습니다. 새로 생성해서 넣으세요.
```bash
npx wrangler secret put ADMIN_PASSWORD    # 어드민 로그인 비밀번호
npx wrangler secret put SESSION_SECRET    # 랜덤 32바이트 이상
npx wrangler secret put API_TOKEN         # Claude 등 외부 도구용
```
`app/.dev.vars` 는 **로컬 개발용**이며 git 에 포함되지 않습니다. 운영에 쓰지 마세요.

### 어드민 화면 빌드
```bash
cd ../admin-src && npm install && npm run build     # → app/public/admin/
cd ../app && npx wrangler deploy --config ./wrangler.toml
```

## 5. 도메인 연결

**서브도메인(help.tryotter.co.kr)이 아니라 서브디렉터리(`www.tryotter.co.kr/help/`)로 가는 것을 권합니다.**

이유:
- 서브디렉터리는 본도메인이 쌓은 검색 권위를 그대로 물려받습니다. 서브도메인은 새 사이트로 출발합니다.
- tryotter.co.kr 은 **Webflow + Cloudflare** 구성이라, Webflow 를 건드리지 않고
  Cloudflare Worker route 만으로 `/help/*` 를 가로챌 수 있습니다.
- 이미 `/blog`, `/blogs/*` 가 본도메인 서브디렉터리로 운영되고 있어 전례가 있습니다. `/help` 는 비어 있습니다(404).

`wrangler.toml` 에 아래 한 줄을 추가하고 재배포하면 됩니다.
```toml
routes = [{ pattern = "www.tryotter.co.kr/help/*", zone_name = "tryotter.co.kr" }]
```

**안전장치**: 워커는 `/help` 로 시작하지 않는 요청을 전부 404로 넘깁니다(`src/index.js` 상단).
본도메인 다른 경로에는 영향이 없습니다.

### 오픈 시 함께 할 일
```toml
NOINDEX = "false"        # sitemap 활성, robots 허용
PREVIEW_MODE = "false"   # 발행된 문서만 노출
```
1. 검토 끝난 문서를 어드민에서 **발행**으로 전환 (지금은 27편 전부 초안)
2. Search Console 에 `https://www.tryotter.co.kr/help/sitemap.xml` **직접 제출**
   — 본도메인 `robots.txt`·`sitemap.xml` 은 Webflow 소관이라 수정할 수 없습니다
3. 오터 웹사이트의 고객센터 링크를 신규 주소로 교체 (진입 경로가 1개뿐이라 이것만 바꾸면 전환 완료)
4. 기존 노션은 상단에 신규 주소 안내를 1~2주 두고 나서 "웹에서 공유" 해제

## 6. 폴더 구조

```
otter-helpcenter/
├─ HANDOFF.md            이 문서
├─ IA.md                 정보구조 — 카테고리·문서 목록·우선순위·자료 충돌
├─ EDITOR.md             어드민 에디터 확정 사양
├─ STATUS.md             집필 현황 — 완료/남은 작업
├─ BOT-COVERAGE.md       AI 상담봇 답변 가능 범위 진단 (실제 고객 질문 29문항 대조)
├─ IMAGE-MAP.md          스크린샷 ↔ 문서 매핑 (검증분/추정분 구분)
├─ LEGACY-NOTION-EXPORT  기존 노션 고객센터 전문 크롤링 원본
├─ drafts/               문서 27편 (D1 사본, 프론트매터 + 마크다운)
├─ app/                  ★ 실제 서비스 코드
│  ├─ wrangler.toml      바인딩·환경변수·route
│  ├─ schema.sql         articles / article_revisions / categories / assets
│  ├─ scripts/import.mjs drafts → D1 시드 (최초 1회용)
│  ├─ src/index.js       라우팅
│  ├─ src/md.js          마크다운 렌더러
│  ├─ src/views.js       페이지 템플릿 (3단 레이아웃)
│  ├─ src/admin.js       어드민 API·로그인
│  ├─ src/auth.js        비밀번호 + HMAC 서명 쿠키
│  ├─ admin-src/         어드민 화면 (Vite + Tiptap)
│  └─ public/            style.css · search.js · assets · images(53장)
└─ _archive/             프로토타입 — 실행하지 마세요 (README 참조)
```

## 7. 알아두면 좋은 설계 결정

**마크다운을 원본으로 보관합니다.** 어드민은 WYSIWYG 이지만 저장 시 마크다운으로 직렬화합니다.
이유: ① 렌더러가 이미지 규격·예외 안내 박스를 강제할 수 있음 ② Claude 가 읽고 쓰기 쉬움
③ 나중에 자체 AI 지식소스로 그대로 사용 ④ 언제든 파일로 내보내 락인 회피.

**굵게 뒤에 조사를 붙이지 않습니다.** CommonMark 에서 `**[매장관리]**를` 는 굵게로 인식되지
않습니다(닫는 `**` 앞이 문장부호 + 뒤가 글자). `**[매장관리]** 버튼을` 처럼 공백+명사를 넣습니다.
31건을 이 규칙으로 정리했고 `drafts/README.md` 에 명시했습니다.

**절차의 각 단계는 `###` 소제목으로 씁니다.** 굵은 글씨로 쓰면 우측 목차에 잡히지 않습니다.

**표는 머리행을 항상 유지합니다.** 마크다운 표 문법에 머리행이 필수여서, 머리행을 끄면
직렬화가 실패하고 본문에 `<table>` HTML 이 박힙니다. 어드민에서 머리행 토글을 제거했습니다.

**예외 조건은 본문에 섞지 않고 하단 `**예외 안내**` 블록에 모읍니다.** 렌더러가 자동으로
박스 처리합니다. 문서당 하나, 항상 맨 끝.

**API 토큰으로는 발행 상태를 바꿀 수 없습니다.** 외부 도구가 문서를 만들거나 고칠 수는 있어도
공개 전환은 사람만 할 수 있습니다(`src/admin.js`).

## 8. 남은 일 · 확인 필요

### 정보가 없어서 못 쓴 것
- **사용 가능한 프린터 모델** — 기존 노션 FAQ 에도 답이 비어 있음. 제품팀 확인 필요
- **프로그램 아이콘이 사라졌을 때 자가 복구** — 동일. CS팀 확인 필요

### 자료 충돌 (`IA.md` 9장)
- 무료체험 기간 — FAQ "가입 후 30일" vs 웹사이트 "첫 달 무료"
- 윈도우 전용 여부 표현 — 권장사양 FAQ 는 "윈도우만", 모바일 FAQ 는 웹·앱 지원
- 기존 FAQ 에 **다른 제품명(포스피드) 혼입** — 신규 문서에서는 수정했음

### 발행 전 필수
- 본문의 `<!-- 확인필요: ... -->` 주석 확인 후 제거
  ```bash
  grep -rn "확인필요" drafts/
  ```
  렌더러가 주석을 자동 제거하므로 고객에게 노출되지는 않지만, 미확인 내용이 그대로 발행됩니다.
- 아직 작성되지 않은 문서를 가리키는 내부 링크가 있습니다. 공개 화면에서 회색 텍스트로
  강등되며, 해당 문서를 쓰면 자동으로 링크가 살아납니다. 깨진 링크로 보이지 않습니다.

### 배달앱 연동 문서 4편
배달의민족·쿠팡이츠·요기요·배달대행사 연동은 **사장님이 직접 할 수 없고 고객센터를 통해서만**
진행됩니다. 따라서 "연동하는 방법"이 아니라 **"연동을 요청하는 방법 + 준비물 + 소요 시간"**
으로 써야 합니다. 앱별 특이사항이 없다면 4편을 1편으로 합치는 편이 낫습니다.
온보딩팀 확인이 필요합니다.

## 9. 다음 단계 후보 — AI 상담봇

`BOT-COVERAGE.md` 에 사전 진단이 있습니다. 실제 고객 질문 29문항 중 **27건(93%)** 을
현재 문서로 답할 수 있습니다.

설계 요점:
- 문서 100편이면 본문 전체가 6~8만 토큰이라 **벡터DB 없이 전체를 프롬프트에 넣는 게 더 정확**합니다
- `status='published'` 문서만 지식 소스로 사용
- `<!-- ... -->` 주석 제거를 파이프라인에 강제 (내부 메모 노출 방지)
- 답변에 참고 문서 링크 첨부, 근거 없으면 지어내지 말고 고객센터로 연결
- **정보가 "없는" 건 LLM 이 잘 처리하지만 "충돌하는" 건 하나를 골라 자신 있게 말합니다.**
  그래서 자료 충돌은 데이터에서 없애야 합니다
- 오터포스 프로그램 내 버튼은 제품팀 작업이므로, **헬프센터 웹에 먼저 붙여 검증**하는 것을 권합니다

## 10. 문의

작업 내용·설계 배경은 jigu.kang 에게 문의하세요.
