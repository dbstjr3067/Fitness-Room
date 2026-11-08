# Google · GitHub 로그인 설정

체단실은 Google과 GitHub 로그인을 지원합니다. 키(클라이언트 ID)는 각 서비스에서 직접 발급받아야 합니다.
아래 메뉴 이름은 각 사이트 화면 개편에 따라 조금씩 다를 수 있습니다.

| 어디서 | 방식 | 필요한 값 |
|---|---|---|
| 웹 (서버) | 리디렉트: Google/GitHub 페이지로 갔다가 돌아옴 | 서버 환경변수 `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`·`GITHUB_CLIENT_SECRET` |
| Android 앱 | 코드 입력: 앱에 뜬 코드를 휴대폰 브라우저에서 입력 | 앱 빌드용 `.env.mobile.local`의 `VITE_GOOGLE_DEVICE_CLIENT_ID`·`VITE_GOOGLE_DEVICE_CLIENT_SECRET`, `VITE_GITHUB_CLIENT_ID` |

앱이 코드 입력 방식을 쓰는 이유: 앱은 서버 없이 휴대폰 안에서 기록을 저장하므로, 로그인 후 돌아올 인터넷 주소가 없습니다.
코드 입력 방식(OAuth 기기 인증)은 돌아올 주소 없이 로그인할 수 있고, 비밀 키도 앱에 넣지 않아도 됩니다(GitHub) 또는 공개해도 되는 값만 씁니다(Google).

---

## Google

1. [Google Cloud Console](https://console.cloud.google.com/)에서 새 프로젝트를 만듭니다.
2. **Google 인증 플랫폼(OAuth 동의 화면)** 을 설정합니다.
   - 앱 이름: 체단실, 사용자 지원 이메일·개발자 연락처: 본인 이메일
   - 대상: **외부**
   - 데이터 접근(범위): `openid`, `email`, `profile` — 기본 범위라 별도 심사가 필요 없습니다.
   - **테스트 사용자**에 로그인할 Google 계정을 추가합니다. 테스트 상태에서는 여기 등록한 계정만 로그인할 수 있고, 모두에게 열려면 앱을 **게시**합니다.
3. **클라이언트**를 만듭니다. 웹과 앱은 유형이 달라 각각 만듭니다.
   - **웹용**: 유형 **웹 애플리케이션**, 승인된 리디렉션 URI에 `{PUBLIC_URL}/api/auth/oauth/google/callback`
     (예: `https://fit.example.com/api/auth/oauth/google/callback`, 로컬 개발은 `http://localhost:3000/api/auth/oauth/google/callback`).
     발급된 값을 서버의 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`에 넣습니다.
   - **앱용**: 유형 **TV 및 입력 제한 기기(TVs and Limited Input devices)**.
     발급된 값을 `.env.mobile.local`의 `VITE_GOOGLE_DEVICE_CLIENT_ID`, `VITE_GOOGLE_DEVICE_CLIENT_SECRET`에 넣습니다.
     이 유형의 "보안 비밀"은 Google이 설치형 앱용으로 공개를 전제로 하는 값이라 APK에 들어가도 됩니다. 웹용 보안 비밀과 섞어 쓰지 마세요.

## GitHub

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**
2. 입력
   - Application name: 체단실
   - Homepage URL: 웹 주소(`PUBLIC_URL`). 앱만 쓸 거라면 저장소 주소 등 아무 주소나 괜찮습니다.
   - Authorization callback URL: `{PUBLIC_URL}/api/auth/oauth/github/callback`
3. 만든 뒤 **Enable Device Flow** 를 체크합니다 (앱 로그인에 필요).
4. **Client ID** 를 서버의 `GITHUB_CLIENT_ID`와 `.env.mobile.local`의 `VITE_GITHUB_CLIENT_ID`에 넣습니다.
5. 웹에서도 쓰려면 **Generate a new client secret** 으로 만든 값을 서버의 `GITHUB_CLIENT_SECRET`에 넣습니다. 앱에는 필요 없습니다.

---

## 앱(APK) 빌드

프로젝트 루트에 `.env.mobile.local` 파일을 만듭니다. 이 파일은 git에 올라가지 않습니다.

```
VITE_GOOGLE_DEVICE_CLIENT_ID=1234-abcd.apps.googleusercontent.com
VITE_GOOGLE_DEVICE_CLIENT_SECRET=GOCSPX-...
VITE_GITHUB_CLIENT_ID=Ov23li...
```

그다음 평소처럼 빌드합니다 (`npm run apk` 또는 `npm run apk:release`). 값을 넣지 않은 서비스는 앱 로그인 화면에 버튼이 나타나지 않습니다.

## 앱에서 로그인하는 모습

1. 내 계정 → **Google로 계속하기** / **GitHub로 계속하기**
2. 앱에 코드(예: `WDJB-MJHT`)가 나타납니다. **코드 복사** 후 **GitHub에서 코드 입력** 을 누르면 휴대폰 브라우저가 열립니다.
3. 브라우저에서 코드를 붙여 넣고 로그인·승인합니다.
4. 앱으로 돌아오면 자동으로 로그인됩니다. 코드는 Google 30분, GitHub 15분 안에 입력해야 하며, 지나면 **새 코드 받기** 를 누릅니다.

참고: 앱의 기록은 그 휴대폰에만 저장됩니다. 다른 휴대폰에서 같은 계정으로 로그인하면 그 휴대폰에는 새 빈 계정이 만들어집니다.
