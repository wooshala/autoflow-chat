# Staff Chat – Android Push-to-Talk (STT, ru-RU)

Status: implementation (feature branches, not merged to main)
Scope: **input method only**. No change to send path, translation, TTS, photo,
room selection, Quick Phrase, admin `/chat`, DB, or API.

## Goal
Add Russian Push-to-Talk voice input to the Android Staff app (`/staff-chat`).
The recognized transcript is sent through the **existing** `send(text)` path, so
`client_nonce`, `room_no`, translation, telemetry, and latency trace are all
reused unchanged.

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
- **React owns the state machine.** `SENDING` is React-only (native does not know
  about send). Native emits RECORDING/RECOGNIZING/IDLE/ERROR hints only.
- **Duplicate-send guard:** React sets `awaitingResult` on `stop()`, consumes it on
  the first `onSttResult`; later results/taps are ignored.

## State machine
```
IDLE ─start()─▶ RECORDING ─stop()─▶ RECOGNIZING ─onSttResult(non-empty)─▶ SENDING ─send done─▶ IDLE
        (re-entry blocked)   (cancel() only exit)   (empty/error ─▶ IDLE, no send)   (no re-send while SENDING)
```

### Cancel rules (never send)
| case | handling |
| --- | --- |
| short tap (< 300 ms) | `cancel()` |
| drag / touch cancel  | `cancel()` |
| empty STT result     | IDLE, no send |
| STT error            | toast, IDLE, no send |
| permission denied    | `onSttError('permission_denied')`, IDLE |

## React changes (`app/staff-chat/StaffChatClient.tsx`, +overlay)
- State: `sttPhase` (`idle|recording|recognizing|sending`), `sttAvailable` (effect-set).
- Refs: `pressStartRef`, `awaitingResultRef`, `rmsRef` (+ bar DOM ref). RMS updates go
  through a ref + `requestAnimationFrame`; **no state, no full re-render.**
- 🎤 button: replace `handleVoiceClick` stub with press-hold handlers
  (`onTouchStart/onTouchEnd/onTouchCancel`). `held < 300ms` → `cancel()`, else `stop()`.
- Register `window.onSttState/onSttResult/onSttError/onSttRms` in a mount effect with
  cleanup; latest `send`/phase reached via refs (stale-closure safe); single owner.
- `onSttResult(text)`: ignore unless `awaitingResult`; consume; trim; empty → IDLE;
  else `sttPhase='sending'` and call existing **`send(text)`**.
- Overlay when `sttPhase!=='idle'`: 🎤 + "녹음 시작"→"듣는 중" + RMS bar + "손을 떼면 자동
  전송". RMS bar only; no interim text (v1).
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
