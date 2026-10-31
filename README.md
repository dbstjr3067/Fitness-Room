# 체단실

다기능 올인원 운동 추적 앱. 웨이트 트레이닝을 기록하고, 운동 현황(진행도·중량 변화)을 한눈에 확인하며,
원하는 기능만 **익스텐션**으로 골라 붙여 쓰는 것을 목표로 합니다.

- 모바일 우선 웹앱 (React + Vite), 흑백 위주의 아이콘 중심 디자인, 기본 다크 테마
- 서버: Node.js + Express, 데이터는 SQLite(`node:sqlite`, Node 22 내장)에 저장

## 현재 구현 범위

| 영역 | 내용 |
|---|---|
| 앱 틀 | 상단 앱 이름 + 설정(톱니바퀴), 하단 탭 5개(현황·검색·추가·알림·내 계정). 탭마다 화면 기록을 따로 보관하고, 열린 탭을 다시 누르면 첫 화면으로 돌아감 |
| 내 계정 | Google·네이버·카카오·GitHub 소셜 로그인, 아이디/비밀번호 회원가입·로그인, 로그아웃, 체험 계정 |
| 현황 | 월간 진행도(주 평균 운동일·루틴 이행률 링) → 진행도 상세(주간·월간 달력·오늘), 종목 별 중량 변화(4개 + 더보기) → 종목 상세 그래프(7일/3주/3개월/1년), 새로 하게 된/하지 않게 된 운동 |
| 추천 기본 익스텐션 | 몸무게 현황, 운동 연속 기록(Streak), 오늘/내일 할 운동(루틴) |
| 설정 | 다크/라이트 테마, kg/lbs, 주간 목표 운동일, 익스텐션 켜기/끄기 |

검색·추가·알림 탭은 아직 자리만 있습니다.

### 계산 기준

- **루틴 이행률**: 루틴 익스텐션이 켜져 있고 루틴이 있으면 *이번 달 루틴 예정일 중 운동한 날 비율*, 아니면 *운동한 날 / (주간 목표 × 경과 주)* (최대 100%)
- **중량 변화**: 종목별 하루 최고 중량 기준. 현황 타일은 최근 30일, 상세 그래프는 선택 구간. 구간 시작 전 마지막 기록을 기준점으로 사용
- **하지 않게 된 / 새로 하게 된 운동**: 최근 30일과 그 전 30일 비교
- **Streak**: 주간 목표를 연속으로 달성한 주 수 (진행 중인 이번 주는 달성 전까지 끊기지 않음)

## 실행

Node.js 22 이상이 필요합니다.

```bash
npm install
```

```bash
npm run dev
```

`http://localhost:3000` 에서 앱이, `http://localhost:4000` 에서 API 서버가 실행됩니다. (Vite가 `/api` 요청을 API 서버로 넘겨줍니다.)
로그인 화면의 **체험 계정으로 둘러보기**를 누르면 1년치 예시 기록이 들어간 임시 계정으로 바로 둘러볼 수 있습니다. 체험 계정은 로그아웃하면 삭제됩니다.

운영 모드(빌드한 화면을 API 서버가 함께 제공):

```bash
npm run build
```

```bash
npm run serve
```

## 테스트

```bash
npm test
```

- `src/shared/stats.test.js` — 진행도·이행률·중량 변화·Streak 계산
- `src/nav/navState.test.js` — 탭별 화면 기록, 탭 재선택 시 초기화
- `server/app.test.js` — 회원가입·로그인·로그아웃, 세션 만료, 로그인 시도 제한, OAuth 흐름(모의 응답), 설정·익스텐션·현황 API 권한
- `src/App.test.jsx` — 실제 화면 컴포넌트로 로그인/로그아웃, 현황 위젯, 탭 이동, 그래프 기간 전환

## 환경변수

| 이름 | 설명 |
|---|---|
| `PORT` | API 서버 포트 (기본 4000) |
| `DB_PATH` | SQLite 파일 경로 (기본 `data/app.db`) |
| `PUBLIC_URL` | 브라우저에서 접속하는 주소. OAuth 콜백 주소에 사용 (기본 `http://localhost:3000`) |
| `ALLOW_DEMO` | `false`면 체험 계정 비활성화 |
| `NODE_ENV` | `production`이면 쿠키에 `Secure` 적용 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google 로그인 |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 네이버 로그인 |
| `KAKAO_CLIENT_ID` / `KAKAO_CLIENT_SECRET` | 카카오 로그인 (REST API 키 / Client Secret) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub 로그인 |

### 소셜 로그인 설정

키가 설정된 서비스만 로그인 버튼이 동작합니다. 각 개발자 콘솔에서 앱을 만들고 **Redirect URI**를 아래처럼 등록하세요.

```
{PUBLIC_URL}/api/auth/oauth/{google|naver|kakao|github}/callback
```

- Google: Google Cloud Console → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID (웹 애플리케이션)
- 네이버: 네이버 개발자센터 → 애플리케이션 등록 → 네이버 로그인
- 카카오: 카카오 디벨로퍼스 → 내 애플리케이션 → 카카오 로그인 활성화, 보안 → Client Secret 발급
- GitHub: Settings → Developer settings → OAuth Apps

## 폴더 구조

```
server/            API 서버 (Express)
  app.js           라우트
  auth.js          비밀번호 해시·세션
  oauth.js         소셜 로그인 공급자 설정
  db.js            SQLite 스키마
  demoData.js      체험 계정용 예시 데이터
src/
  shared/          화면·서버 공용 로직 (날짜, 종목, 익스텐션, 현황 계산)
  nav/             탭별 화면 기록
  components/      공통 위젯 (카드, 캡슐 버튼, 링, 그래프, 운동 아이콘)
  screens/         화면 (현황, 내 계정, 설정)
  state/           로그인·설정·현황 데이터 상태
```
