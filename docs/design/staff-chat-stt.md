# Staff Chat – Android Push-to-Talk (STT, ru-RU)

Status: implementation (feature branches, not merged to main)
Scope: **input method only**. No change to send path, translation, TTS, photo,
room selection, Quick Phrase, admin `/chat`, DB, or API.

## Goal
Add Russian Push-to-Talk voice input to the Android Staff app (`/staff-chat`).
The recognized transcript is written into the **existing message input**; the
staff reviews it and presses the existing send button. **No auto-send, no new
send path.** The existing `send()` (client_nonce / room_no / translation /
telemetry) is exercised only when the staff sends manually — exactly as for
typed text.

## Branches
- React: `feature/staff-chat-stt-ru` (base: `main`)
- Android: `feature/staff-android-stt` (base: `feature/staff-fcm-android-3c`)
- main merge only after re-approval.

## Bridge contract

### web → native — `window.AutoFlowStaffStt` (injected by native `addJavascriptInterface`)
| method | behaviour |
| --- | --- |
| `start()` | ensure RECORD_AUDIO (request if needed); start SpeechRecognizer(ru-RU); short haptic; emit `onSttState('RECORDING')`. Denied → `onSttError('permission_denied')`. |
| `stop()`  | stop listening → RECOGNIZING; final result delivered via `onSttResult`. |
| `cancel()`| abort; no result emitted; `onSttState('IDLE')`. |

### native → web — functions React registers on `window`
| callback | arg | notes |
| --- | --- | --- |
| `onSttState(state)` | `'RECORDING' \| 'RECOGNIZING' \| 'IDLE' \| 'ERROR'` | lifecycle hint |
| `onSttResult(text)` | final transcript (may be empty) | empty/duplicate ignored by React |
| `onSttError(code)`  | `permission_denied \| no_match \| network \| busy \| timeout \| recognizer_unavailable` | |
| `onSttRms(level)`   | `0.0 – 1.0` normalized | high frequency |

### App detection
`typeof window.AutoFlowStaffStt?.start === 'function'` (evaluated in a client
effect). If absent, the 🎤 button is **hidden**; text input is unchanged.

### Contract rules
- **React owns the state machine.** Native emits RECORDING/RECOGNIZING/IDLE/ERROR
  hints only. STT never sends — it only fills the input.
- **Duplicate guard:** React sets `awaitingResult` on `stop()`, consumes it on the
  first `onSttResult`; later results/taps are ignored.
- **RECOGNIZING timeout:** if no result within 5s of `stop()`, React fails the
  utterance (cancel native, no input change, toast).

## State machine
```
IDLE ─start()─▶ RECORDING ─stop()─▶ RECOGNIZING ─onSttResult(non-empty)─▶ fill input ─▶ IDLE
        (re-entry blocked)   (cancel() only exit)   (empty / error / 5s timeout ─▶ IDLE, no input change, toast)
```

### No-input / failure rules (never send, never change input)
| case | handling |
| --- | --- |
| short tap (< 300 ms) | `cancel()`, no input change |
| drag / touch cancel  | `cancel()`, no input change |
| empty STT result     | IDLE, toast "음성을 인식하지 못했습니다. 다시 말씀해주세요." |
| STT error            | IDLE, toast |
| RECOGNIZING timeout (5s) | cancel native, IDLE, toast |
| permission denied    | `onSttError('permission_denied')`, IDLE, toast |

## React changes (`app/staff-chat/StaffChatClient.tsx`, +overlay)
- State: `sttPhase` (`idle|recording|recognizing|sending`), `sttAvailable` (effect-set).
- Refs: `pressStartRef`, `awaitingResultRef`, `rmsRef` (+ bar DOM ref). RMS updates go
  through a ref + `requestAnimationFrame`; **no state, no full re-render.**
- 🎤 button: replace `handleVoiceClick` stub with press-hold handlers
  (`onTouchStart/onTouchEnd/onTouchCancel`). `held < 300ms` → `cancel()`, else `stop()`.
- Register `window.onSttState/onSttResult/onSttError/onSttRms` in a mount effect with
  cleanup; latest `send`/phase reached via refs (stale-closure safe); single owner.
- `onSttResult(text)`: ignore unless `awaitingResult`; consume; trim; empty/error/
  timeout → IDLE + unified failure toast ("음성을 인식하지 못했습니다. 다시 말씀해주세요."),
  **no input change**; else write into the existing input via `setText` (append),
  **focus it and move the cursor to the end**, show the "done" hint ~1s, then IDLE.
  **Never calls `send()`.**
- Overlay phases (RMS bar only; no interim text, v1):
  - recording → "듣는 중..."
  - recognizing → "음성을 문자로 변환하고 있습니다..."
  - done (~1s) → "입력창에서 확인 후 전송하세요."
- Placeholder guides short input: ko "짧게 말씀해주세요. 예) 507 끝 / 수건 2장",
  ru "Говорите коротко. Напр.: 507 готово / 2 полотенца".
- Untouched: `send()`, text/photo send, room, translation, TTS, telemetry, nonce, trace.

## Android changes (`feature/staff-android-stt`, additive)
- `AndroidManifest.xml`: add `RECORD_AUDIO`.
- New `StaffSttBridge.kt`: `@JavascriptInterface start()/stop()/cancel()`.
  SpeechRecognizer created/used on the **main thread** (JS calls arrive on a binder
  thread → `runOnUiThread`). `RecognitionListener`: `onRmsChanged`→`onSttRms`,
  `onResults`→`onSttResult`, `onError`→`onSttError`, `onEndOfSpeech`→ RECOGNIZING.
  Locale fixed `ru-RU`.
- Permission: `start()` requests RECORD_AUDIO if missing; grant→start, deny→
  `onSttError('permission_denied')`.
- Haptic: short vibrate on start.
- Register `webView.addJavascriptInterface(bridge, "AutoFlowStaffStt")` right after
  WebView creation. All native→web via `runOnUiThread { evaluateJavascript(...) }`,
  JSON-safe text. Existing camera/FCM/session/Firebase logic unchanged.

## Verification
- React Preview (Vercel) from the feature branch; `tsc` clean.
- Debug APK from the Android branch, launch URL temporarily pointed at the STT Preview
  URL (production URL unchanged).
- Positive: STT send, translation, room_no, existing text/photo send.
- Regression: short tap / drag cancel / empty / duplicate results / receive while
  recording / rapid re-tap after finish — all must not send. Browser: 🎤 hidden, text
  send unaffected.
