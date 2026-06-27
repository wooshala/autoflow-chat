# AutoFlow Tauri Updater — 배포 가이드

> 셸 버전 SSOT: `src-tauri/tauri.conf.json` + `src-tauri/Cargo.toml`  
> 웹 UI: Vercel (`autoflow-mvp.vercel.app`) — Updater와 별개

## 1. Signing key (1회)

로컬에서 생성 (private key는 **git 커밋 금지**):

```powershell
$env:CI = 'true'
npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\autoflow-updater.key" -f --ci
```

- Public key → `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` (repo에 커밋 OK)
- Private key → GitHub Secrets + 별도 백업 (1Password 등)

### GitHub Secrets (`wooshala/autoflow-chat`)

| Secret | 값 |
|--------|-----|
| `TAURI_SIGNING_PRIVATE_KEY` | `autoflow-updater.key` 파일 **전체 내용** |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 비밀번호 없으면 빈 문자열 |

## 2. Updater endpoint

```
https://github.com/wooshala/autoflow-chat/releases/latest/download/latest.json
```

## 3. 배포 순서 (매 릴리스)

1. **Vercel** — `/chat`의 updater UI 등 웹 변경 먼저 배포  
2. **버전 bump** — `tauri.conf.json` + `Cargo.toml` 동일 semver (예: `0.1.2`)  
3. **태그 & push**:
   ```bash
   git tag app-v0.1.2
   git push origin app-v0.1.2
   ```
4. GitHub Actions `Release Desktop App` → NSIS + `latest.json` 업로드

## 4. 업장 PC 롤아웃

| 단계 | 버전 | 방법 |
|------|------|------|
| Bootstrap | **0.1.1** | NSIS **수동 1회** 설치 (updater 포함 첫 버전) |
| E2E 테스트 | **0.1.2** | 앱 내 **「앱 업데이트 확인」** → 확인 → 설치 |

## 5. 로컬 Windows 빌드

```powershell
# private key (로컬 빌드 시 서명 산출물 생성)
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "$env:USERPROFILE\.tauri\autoflow-updater.key"

npm run tauri build
# → src-tauri/target/release/bundle/nsis/AutoFlow_*_setup.exe
# → latest.json (createUpdaterArtifacts: true)
```

## 6. 실패 시

- `latest.json` / 네트워크 실패 → 앱은 그대로 실행, `/chat` 헤더에 오류 표시  
- private key 분실 → **새 key + 전체 재설치** 필요 (기존 설치본 in-app 업데이트 불가)
