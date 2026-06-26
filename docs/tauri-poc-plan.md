# Tauri PoC 계획 — Windows PC `/chat` Native Notification Wrapper

> 상태: **Phase 1 구현 완료 — 빌드 성공, 핵심 경로 자동 검증 완료.** (실제 토스트/소리/트레이 육안 검증은 §10 참고)
> 작성 기준일: 2026-06-26 / 대상: Windows PC 프론트 데스크 전용 `/chat`
> 구현 결과·빌드/실행 절차는 **§10**에 정리.

---

## 0. 목표 한 줄 요약

현재 Vercel에 배포된 `https://autoflow-mvp.vercel.app/chat` 를 **Tauri(Windows) 데스크톱 앱으로 감싸서**, 브라우저 `Notification` API가 아니라 **Tauri native(OS) 알림**으로 새 메시지 알림이 카카오톡처럼 뜨는지 검증한다. 서버·DB·웹 알림 로직은 건드리지 않는다.

---

## 1. 우선 조사 결과 (사실 확인)

| 항목 | 결과 |
|---|---|
| 현재 repo에 Tauri 추가 가능 여부 | **가능.** 기존 Tauri/Rust 흔적 없음. Next.js(14.2.0)/Vercel 구조와 독립적인 `src-tauri/` 하위 디렉터리로 공존. 웹 빌드 파이프라인과 충돌 없음 |
| Next.js remote URL wrapper 방식 가능 여부 | **가능.** Tauri는 로컬 번들 대신 **원격 URL**을 webview window의 `url`로 로드 가능. 즉 `/chat`을 빌드해 exe에 넣지 않고, 배포된 Vercel URL을 그대로 로드 → 웹은 Vercel, 셸만 Tauri |
| Tauri notification plugin 필요 여부 | **필요.** `@tauri-apps/plugin-notification` (JS) + `tauri-plugin-notification` (Rust). 단, **원격 페이지는 웹 코드 수정 금지**이므로 직접 호출 대신 **주입 스크립트가 `window.Notification`을 가로채 플러그인으로 우회** |
| Windows build 산출물 위치 | exe: `src-tauri/target/release/AutoFlow.exe` / 설치본: `src-tauri/target/release/bundle/nsis/AutoFlow_<ver>_x64-setup.exe`, `.../bundle/msi/AutoFlow_<ver>_x64_en-US.msi` |
| 개발/배포 절차 | `npm run tauri dev`(개발 창) → `npm run tauri build`(exe+설치본). 설치본을 프론트 PC에 1회 설치 |
| exe 재설치 필요 vs Vercel만으로 반영 | **§7에 별도 표로 정리.** 핵심: 웹 화면/로직 = Vercel만, 셸(주입 스크립트·Rust·트레이·알림·아이콘) = exe 재빌드 |

### 환경 점검 (이 PC 기준, 조사 시점)
- Node `v24.13.1`, npm `11.8.0` — OK
- **Rust/cargo: 미설치** → `rustup` 설치 필요 (Tauri 필수 선행조건, 유일한 큰 선행작업)
- **WebView2 Runtime: 설치됨 (149.x)** — Tauri Windows 렌더러 준비 완료, 별도 설치 불필요
- 기존 웹 알림 호출부: `lib/chat/browserNotifications.ts`가 표준 `new Notification(title, options)` 사용, 게이트는 `Notification.permission === 'granted'` 확인 → 주입 가로채기로 무수정 우회 가능

---

## 2. 아키텍처 — 웹 코드 무수정 핵심 전략

```
┌─────────────────────────────────────────────────────────────┐
│ AutoFlow.exe (Tauri shell, Windows)                          │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ WebView2 → loads REMOTE https://autoflow-mvp.../chat   │ │
│  │                                                       │ │
│  │  [initialization_script] (셸이 주입, 페이지 로드 前 실행) │ │
│  │   └ window.Notification 을 monkey-patch:               │ │
│  │       · permission='granted' 강제                      │ │
│  │       · new Notification(t,o) → Tauri native 알림 호출  │ │
│  │       · onshow/onclick/onclose 핸들러 형태 그대로 유지   │ │
│  └───────────────────────────────────────────────────────┘ │
│            │ invoke (IPC)                                    │
│            ▼                                                 │
│  Rust core: 트레이 상주 · 알림음(rodio) · 클릭→창 포커스      │
└─────────────────────────────────────────────────────────────┘
```

**왜 이 방식인가:** 웹 앱(`/chat`)은 이미 `!document.hasFocus()` 게이트에서 `new Notification(...)`을 호출한다(직전 배포 `p0-notify-v17`). 셸이 페이지 로드 전에 `window.Notification`을 가로채면, **웹의 알림 발화 시점·조건·내용은 그대로 두고** 렌더링만 Tauri native로 바꿀 수 있다. → 요구사항 "기존 웹 알림 코드 수정 금지" 충족.

> 대안(웹이 `__TAURI__`를 직접 호출)은 웹 코드 수정이 필요하므로 **이번 PoC 범위에서 제외**.

---

## 3. 필요한 패키지 / 설정 목록

### 3.1 선행 도구 (PC 1회)
- **Rust toolchain**: `rustup` → `rustc`/`cargo` (Tauri 빌드 필수)
- WebView2 Runtime — **이미 설치됨**, 작업 불필요
- (선택) Visual Studio C++ Build Tools — Rust MSVC 링커. rustup 설치 시 보통 함께 안내됨

### 3.2 npm devDependencies
- `@tauri-apps/cli` (v2) — `tauri dev`/`tauri build`
- `@tauri-apps/api` (v2) — JS 측 API (주입 스크립트에서 사용)
- `@tauri-apps/plugin-notification` (v2) — native 알림 JS 바인딩

### 3.3 Rust crates (`src-tauri/Cargo.toml`)
- `tauri` (v2, features: `tray-icon`, 필요 시 `image-png`)
- `tauri-plugin-notification` (v2)
- `rodio` *(알림음 "크게" 재생용 — 기본 알림음 부족 시)*
- `serde` / `serde_json` (IPC 페이로드)

### 3.4 핵심 설정 포인트 (`src-tauri/tauri.conf.json`)
- `productName: "AutoFlow"`, `identifier: "com.autoflow.frontops"`
- `app.withGlobalTauri: true` — 원격 페이지에서 `window.__TAURI__` 노출
- `app.windows[]`: 원격 URL 로드 (`"url": "https://autoflow-mvp.vercel.app/chat"`)
  - ※ initialization script는 conf.json이 아니라 **Rust 빌더에서 주입**(아래 §4)
- `app.trayIcon`: 트레이 아이콘/메뉴 (상주·복원·종료)
- `bundle.targets`: `["nsis"]` (PoC는 NSIS 권장 — 가볍고 AUMID 등록됨)
- **capabilities**(`src-tauri/capabilities/*.json`): 원격 오리진에 notification 권한 부여
  - `"remote": { "urls": ["https://autoflow-mvp.vercel.app/*"] }` + `notification:default` 등 — 원격 페이지가 알림 IPC를 쓰려면 필수

---

## 4. 구현 파일 목록 (예정 — 이번엔 생성하지 않음)

| 파일 | 역할 | 변경 시 영향 |
|---|---|---|
| `src-tauri/Cargo.toml` | Rust 의존성 | exe 재빌드 |
| `src-tauri/tauri.conf.json` | 창/트레이/번들/식별자 설정 | exe 재빌드 |
| `src-tauri/capabilities/default.json` | 원격 오리진 알림 권한 | exe 재빌드 |
| `src-tauri/src/main.rs` / `lib.rs` | 앱 부트스트랩, 창 생성+**주입 스크립트**, 트레이, 알림음, 클릭→포커스, IPC command | exe 재빌드 |
| `src-tauri/notify-bridge.js` | `window.Notification` monkey-patch (initialization_script로 주입) | exe 재빌드 |
| `src-tauri/icons/*` | 앱/트레이 아이콘 | exe 재빌드 |
| `src-tauri/assets/notify.wav` | "크게" 울릴 알림음 원본 | exe 재빌드 |
| `package.json` | `"tauri": "tauri"` 스크립트, devDeps | (웹 빌드 무관) |
| `.gitignore` | `src-tauri/target/` 제외 | — |

> **웹 측 파일은 단 하나도 수정/생성하지 않는다.** (`lib/chat/*`, `app/chat/*`, `/staff-chat/*` 전부 불변)

---

## 5. 예상 작업 단계 (PoC)

1. **선행**: `rustup`로 Rust 설치 → `cargo --version` 확인
2. **스캐폴드**: `npm i -D @tauri-apps/cli@^2` 후 `src-tauri/` 초기화. `app.windows[].url`을 원격 `/chat`으로 지정, `withGlobalTauri:true`
3. **창 표시 검증** (필수기능 1·2): `npm run tauri dev` → AutoFlow 창에 `/chat` 정상 로드·로그인·메시지 흐름 확인
4. **트레이 상주** (필수기능 3): `trayIcon` + 창 닫기=트레이로 최소화, 트레이 메뉴(열기/종료) 동작 확인
5. **알림 브리지** (필수기능 4): `notify-bridge.js`를 initialization_script로 주입 → `window.Notification` 가로채 `plugin-notification`으로 native 알림. 실제 메시지 수신 시 Windows 알림 표시 확인. (웹의 `[CHAT_BROWSER_NOTIFY_*]` 로그 흐름은 유지)
6. **알림음 크게** (필수기능 5): 우선 native 알림 기본음 확인 → 부족하면 Rust `rodio`로 `notify.wav` 풀볼륨 재생 추가
7. **클릭→포커스** (필수기능 6): 알림 클릭(또는 토스트 활성화) 시 창 `show()+unminimize()+set_focus()`로 앞으로
8. **패키징 검증**: `npm run tauri build` → NSIS 설치본 생성 → 클린 설치 후 1~7 재검증(특히 토스트 클릭 활성화는 설치본에서만 완전 동작 가능, §6 리스크)
9. **반영 경로 검증** (§7): 웹만 바꿔 `vercel --prod` → 재설치 없이 창에 반영되는지 / 셸 바꾸면 재설치 필요한지 실측

---

## 6. 리스크

| # | 리스크 | 영향 | 완화 |
|---|---|---|---|
| R1 | **Rust 미설치**, 첫 빌드 환경 구성·컴파일 시간 | 착수 지연 | rustup 1회 설치, 빌드 시간 감수 |
| R2 | **원격 URL + Tauri IPC 권한** — 원격 오리진이 `__TAURI__`/알림 권한을 못 받으면 브리지 무력화 | 알림 미동작 | capabilities `remote.urls`에 Vercel 오리진 등록, `withGlobalTauri` 확인 |
| R3 | **Windows 토스트 클릭 활성화는 설치본(AUMID 등록) 기준** — `tauri dev`(미설치)에선 클릭→포커스가 제한적일 수 있음 | 필수기능 6 검증이 dev에서 불완전 | NSIS 설치본으로 최종 검증(설치 시 Start Menu 바로가기+AUMID 등록) |
| R4 | **"알림음 크게"** — native 알림 기본음은 음량 제어 약함 | 필수기능 5 미달 | Rust `rodio`로 별도 WAV 풀볼륨 재생(앱이 트레이/백그라운드여도 OS 레벨 재생) |
| R5 | **focus 게이트 의미 변화** — Tauri 단일 창에선 "다른 앱 보기"가 곧 창 blur. 웹의 `!document.hasFocus()` 게이트가 WebView2에서 기대대로 동작하는지 | 알림 과다/누락 | dev에서 `[NOTIFY_GATE]` 로그로 `hasFocus`/`isBackgroundLike` 실측 |
| R6 | **monkey-patch 호환성** — 웹이 `onshow/onclick/onclose`에 의존(존재함). 가로채기 객체가 이 인터페이스를 충족 못하면 JS 오류 | 알림/후속 로직 깨짐 | 패치 객체가 표준 Notification 인터페이스(이벤트 핸들러·`close()`) 모방 |
| R7 | **중복 알림** — WebView2 자체 web-notification 경로와 native 경로가 동시 발화 | 알림 2번 | 패치로 원본 `Notification` 완전 대체(원본 경로 차단) |
| R8 | **자동 업데이트 없음** — 셸 변경 시 수동 재배포/재설치 | 운영 부담 | PoC 범위 외. 성공 후 `tauri-plugin-updater` 검토 |
| R9 | **인증/세션** — WebView2 쿠키/스토리지로 로그인 유지되는지 | 로그인 반복 | dev에서 세션 지속 확인(WebView2는 영속 프로파일 사용) |

> 범위 보호: 서버/Supabase/DB/API, `/staff-chat` 모바일, 기존 웹 알림 코드는 **건드리지 않는다**. 모든 작업은 `src-tauri/` + `package.json` devDeps/스크립트 한정.

---

## 7. 변경 반영 경로 — exe 재설치 vs Vercel 배포만

| 변경 종류 | 예시 | 반영 방법 |
|---|---|---|
| **웹 화면/로직** | `/chat` UI, 메시지 처리, **알림 발화 조건/게이트**, 토스트, 번역, 분류 등 | **Vercel `vercel --prod`만** — 재설치 불필요 (webview가 최신 페이지 로드) |
| **셸(네이티브)** | 주입 브리지 `notify-bridge.js`, Rust 코드, 트레이, 알림 플러그인/권한, 알림음 WAV, 창/아이콘/식별자, capabilities | **exe 재빌드 + 재설치** 필요 |

핵심: 원격 URL 로드 구조이므로 **웹 변경은 배포만으로 즉시 반영**, **셸 변경만 재설치**. 알림 "조건"은 웹(Vercel), 알림 "표시 방식"은 셸(exe)로 책임이 갈린다.

---

## 8. PoC 성공 기준 (Done = 아래 전부 충족)

1. ✅ `AutoFlow.exe`(또는 `tauri dev` 창) 실행 시 창에 `/chat`이 정상 로드되고 로그인/메시지 흐름 동작
2. ✅ 창 닫기/최소화 시 **시스템 트레이 상주**, 트레이에서 창 복원·종료 가능
3. ✅ 새 메시지 수신 시 **Windows native 알림** 표시 (브라우저 Notification이 아님 — 작업표시줄/알림센터에 OS 토스트)
4. ✅ 알림 시 **알림음이 충분히 크게** 재생(앱이 백그라운드/트레이여도)
5. ✅ 알림 **클릭 시 AutoFlow 창이 앞으로**(show+unminimize+focus)
6. ✅ 웹만 수정해 `vercel --prod` 후 **재설치 없이** 창에 반영됨을 실측
7. ✅ 검증 동안 **서버/DB/API/`staff-chat`/기존 웹 알림 코드 무변경** 확인
8. ✅ (게이트 정합성) 다른 앱 포커스/창 blur 상태에서 알림 발화, 창 포커스 시 in-app만 — `[NOTIFY_GATE]` 로그로 확인

### 비범위(이번 PoC 제외)
- 자동 업데이트, 코드사이닝, 다중 창/다중 모니터 세부, macOS/모바일, `/staff-chat` 래핑, 푸시(서버발) 알림

---

## 9. 다음 액션 (승인 시)
1. `rustup` 설치 안내/진행
2. `src-tauri/` 스캐폴드 + 원격 URL 창(§5-2~3) → **창 표시까지 먼저 데모**
3. 이후 트레이 → 알림 브리지 → 음량 → 클릭 포커스 순으로 단계 검증

> 본 문서는 계획 확정용이며, **코드는 승인 후 착수**한다.

---

## 10. 구현 결과 (Phase 1 — 완료)

### 10.1 무엇을 만들었나
원격 `/chat`을 감싸는 Tauri v2 Windows 셸 `src-tauri/`를 추가했다. **웹 코드는 한 줄도 수정하지 않았다.**

| 파일 | 내용 |
|---|---|
| `src-tauri/Cargo.toml` | tauri(tray-icon,image-png) + tauri-plugin-notification + rodio. desktop 전용이라 `crate-type=["rlib"]`, bin 이름 `AutoFlow` |
| `src-tauri/tauri.conf.json` | 원격 wrapper: `withGlobalTauri`, 번들 `nsis`, identifier `com.autoflow.frontops`, 창은 Rust에서 생성 |
| `src-tauri/capabilities/default.json` | **원격 오리진 IPC 허용**(`remote.urls`) + notification/window/event 권한 |
| `src-tauri/src/lib.rs` | 창 생성(원격 `/chat`)+브리지 주입, 트레이(열기/종료/클릭→포커스), `native_notify`/`focus_main_window` 커맨드, rodio WAV(볼륨 1.6배), X→트레이 최소화, 포커스 시 알림 해제 |
| `src-tauri/notify-bridge.js` | `window.Notification` monkey-patch → `invoke('native_notify')`. permission=granted 강제, on*핸들러 호환, 오프라인 fallback 오버레이 |
| `src-tauri/assets/notify.wav` | 알림음(고진폭 2-tone) |
| `src-tauri/icons/alert.png` | 트레이 "새 메시지" 빨강 아이콘 |
| `package.json` | `"tauri": "tauri"` 스크립트 |

### 10.2 자동 검증된 것 (이번 세션에서 실측)
- ✅ **빌드 성공**: release 컴파일 + NSIS 번들 완료.
  - 산출물: `src-tauri/target/release/AutoFlow.exe` (26.8MB), `src-tauri/target/release/bundle/nsis/AutoFlow_0.1.0_x64-setup.exe` (6MB)
- ✅ **부팅 OK**: debug/release exe 모두 크래시 없이 상주, 로그 `[AUTOFLOW_BOOT] reachable=true`.
- ✅ **핵심 IPC 경로 end-to-end**(최대 리스크 R2 해소): 임시 self-test로 원격 `/chat` 페이지의 `new Notification(...)` → 브리지 가로채기 → **원격 invoke가 Rust `native_notify` 도달** 확인(로그 `[NATIVE_NOTIFY] id=n1`). 즉 토스트+WAV+트레이 알림 트리거 경로가 실제 동작. (self-test는 검증 후 제거함)

### 10.3 육안 검증 필요 (사용자 확인 항목)
GUI 동작이라 화면/소리는 사용자가 직접 확인:
1. `AutoFlow.exe` 실행 → 창에 `/chat` 표시 (성공기준 ①②)
2. 실제 새 메시지 수신(또는 self-test 재삽입) 시 **Windows 토스트** 표시 (③)
3. **WAV가 크게** 재생 (④) — 부족하면 `lib.rs`의 `sink.set_volume(1.6)` 상향
4. 토스트/트레이 **클릭 시 창 활성화** (⑤) — 트레이 클릭 포커스는 코드상 확실, **토스트 클릭 활성화는 설치본(AUMID 등록)에서 신뢰성↑**
5. **X 버튼 → 종료 안 되고 트레이 상주** (⑥)

### 10.4 빌드/실행 절차 (재현)
> 선행 1회: Rust(GNU) + MinGW-w64 설치됨. **빌드 시 PATH에 두 경로 필요**:
> `%USERPROFILE%\.cargo\bin` 와 `%USERPROFILE%\autoflow-tools\mingw64\bin`

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:USERPROFILE\autoflow-tools\mingw64\bin;$env:Path"
# 개발 실행(창 띄우기):
npx tauri dev
# 배포 산출물(exe + 설치본):
npx tauri build
```
설치본 `AutoFlow_0.1.0_x64-setup.exe`를 프론트 PC에 1회 설치 → 이후 **웹 변경은 `vercel --prod`만으로 반영, 재설치 불필요**(§7).

### 10.5 환경/툴체인 메모 (중요)
- 이 PC엔 **MSVC C++ 워크로드가 없어** Rust **GNU 툴체인**을 사용. rustup self-contained binutils가 불완전(`dlltool`이 `as` 못 찾음)하여 **winlibs MinGW-w64**(`%USERPROFILE%\autoflow-tools\mingw64`)를 별도 설치해 PATH로 해결.
- GNU에서 `cdylib` 링크 시 mingw ld 버그(`export ordinal too large`) → desktop 전용이므로 `crate-type=["rlib"]`로 회피.
- 장기적으로 안정성을 원하면 VS의 **C++ 빌드 도구(VC.Tools) 워크로드 설치 후 MSVC 툴체인 전환** 권장(공식 경로). 단 수 GB·관리자 권한 필요.

### 10.6 남은 작업(Phase 2 후보)
- 토스트 클릭 활성화를 설치본에서 정밀 검증(AUMID)
- 트레이 unread 카운트/뱃지, 다중 모니터, 시작프로그램 등록
- (선택) MSVC 전환, 코드사이닝, auto-update
