// AutoFlow — Tauri native shell (PoC Phase 1)
// Wraps the remote Next.js /chat as a Windows desktop app and adds the native
// layer only: native OS notification, loud WAV, system tray, window focus.
// The web app at https://autoflow-mvp.vercel.app/chat is loaded unchanged.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, UserAttentionType, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

const REMOTE_CHAT_URL: &str = "https://autoflow-mvp.vercel.app/chat";
/// Custom protocol registered via tauri-plugin-deep-link (`autoflow://…`).
/// Ledger [열기] uses `autoflow://chat?guestRoom=<N>` in Production EXE mode.
const DEEP_LINK_SCHEME: &str = "autoflow";
const SND_DEFAULT: &[u8] = include_bytes!("../assets/default.wav");
const SND_BELL: &[u8] = include_bytes!("../assets/bell.wav");
const SND_BEEP: &[u8] = include_bytes!("../assets/beep.wav");
const SND_INCOMING: &[u8] = include_bytes!("../assets/incoming.mp3");
const SND_NOTIFY_022: &[u8] = include_bytes!("../assets/notify-022.mp3");
const SND_NOTIFY_036: &[u8] = include_bytes!("../assets/notify-036.mp3");
const SND_NOTIFY_053: &[u8] = include_bytes!("../assets/notify-053.mp3");
const ALERT_ICON: &[u8] = include_bytes!("../icons/alert.png");
const BRIDGE_JS: &str = include_str!("../notify-bridge.js");

/// Toast id → guestRoom for activation → `open_guest_room_in_shell` (Phase GC-Notification-Completion).
fn toast_guest_rooms() -> &'static Mutex<HashMap<String, String>> {
    static MAP: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

fn remember_toast_guest_room(notify_id: &str, guest_room: Option<&str>) {
    let Ok(mut map) = toast_guest_rooms().lock() else {
        return;
    };
    if let Some(room) = guest_room.map(str::trim).filter(|s| !s.is_empty()) {
        map.insert(notify_id.to_string(), room.to_string());
    } else {
        map.remove(notify_id);
    }
}

fn take_toast_guest_room(notify_id: &str) -> Option<String> {
    toast_guest_rooms()
        .lock()
        .ok()
        .and_then(|mut map| map.remove(notify_id))
}

/// Play the selected notification sound via the OS audio device, amplified for
/// "loud". Runs detached so the notification path never blocks. OS-level
/// playback is unaffected by browser autoplay policy (the point vs web audio).
/// soundKey comes from the /chat picker (default | bell | beep | mute).
fn play_sound_key(key: &str) {
    let (bytes, vol): (&'static [u8], f32) = match key {
        "mute" => return,
        "bell" => (SND_BELL, 2.0),
        "beep" => (SND_BEEP, 1.4),
        "incoming" => (SND_INCOMING, 1.5),
        "notify-022" => (SND_NOTIFY_022, 1.5),
        "notify-036" => (SND_NOTIFY_036, 1.5),
        "notify-053" => (SND_NOTIFY_053, 1.5),
        _ => (SND_DEFAULT, 1.6),
    };
    let key_owned = key.to_string();
    std::thread::spawn(move || {
        if let Ok((_stream, handle)) = rodio::OutputStream::try_default() {
            if let Ok(sink) = rodio::Sink::try_new(&handle) {
                let cursor = std::io::Cursor::new(bytes);
                match rodio::Decoder::new(cursor) {
                    Ok(src) => {
                        sink.set_volume(vol); // > 1.0 amplifies above source level
                        sink.append(src);
                        sink.sleep_until_end(); // keep _stream alive until done
                    }
                    Err(e) => {
                        log::warn!("[PLAY_SOUND_DECODE_ERR] key={} err={}", key_owned, e);
                    }
                }
            }
        }
    });
}

/// Best-effort startup reachability probe of the Vercel host (logged only).
fn server_reachable() -> bool {
    use std::net::ToSocketAddrs;
    match ("autoflow-mvp.vercel.app", 443u16).to_socket_addrs() {
        Ok(mut it) => match it.next() {
            Some(sa) => std::net::TcpStream::connect_timeout(&sa, Duration::from_secs(4)).is_ok(),
            None => false,
        },
        Err(_) => false,
    }
}

/// Bring the main window to the foreground and clear the tray alert state.
fn focus_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    set_alert(app, false);
}

/// Parse `guestRoom` from `autoflow://chat?guestRoom=201` (digits, 3–4 chars).
fn parse_guest_room_from_deep_link(url_str: &str) -> Option<String> {
    let url = url::Url::parse(url_str.trim()).ok()?;
    if url.scheme() != DEEP_LINK_SCHEME {
        return None;
    }
    for (k, v) in url.query_pairs() {
        if k != "guestRoom" {
            continue;
        }
        let t = v.trim();
        if !t.is_empty()
            && t.len() >= 3
            && t.len() <= 4
            && t.chars().all(|c| c.is_ascii_digit())
        {
            return Some(t.to_string());
        }
    }
    None
}

fn guest_room_from_argv(argv: &[String]) -> Option<String> {
    argv.iter().find_map(|a| {
        if a.trim_start().starts_with("autoflow:") {
            parse_guest_room_from_deep_link(a)
        } else {
            None
        }
    })
}

fn cache_bust_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn chat_url_with_optional_guest_room(guest_room: Option<&str>) -> String {
    let ts = cache_bust_ts();
    match guest_room {
        Some(room) => format!("{}?guestRoom={}&afts={}", REMOTE_CHAT_URL, room, ts),
        None => format!("{}?afts={}", REMOTE_CHAT_URL, ts),
    }
}

/// Focus Staff EXE and navigate the webview to Production `/chat?guestRoom=`.
fn open_guest_room_in_shell(app: &tauri::AppHandle, room: &str) {
    focus_main(app);
    let target = chat_url_with_optional_guest_room(Some(room));
    let Some(w) = app.get_webview_window("main") else {
        log::warn!("[DEEP_LINK] main window missing; guestRoom={}", room);
        return;
    };
    match target.parse::<url::Url>() {
        Ok(u) => {
            if let Err(e) = w.navigate(u) {
                log::warn!("[DEEP_LINK_NAV_ERR] guestRoom={} err={}", room, e);
            } else {
                log::info!("[DEEP_LINK_NAV] guestRoom={}", room);
            }
        }
        Err(e) => log::warn!("[DEEP_LINK_URL_ERR] guestRoom={} err={}", room, e),
    }
}

/// Toggle the tray "new message" indicator (icon + tooltip).
fn set_alert(app: &tauri::AppHandle, on: bool) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        if on {
            if let Ok(img) = Image::from_bytes(ALERT_ICON) {
                let _ = tray.set_icon(Some(img));
            }
            let _ = tray.set_tooltip(Some("AutoFlow — 새 메시지"));
        } else {
            if let Some(def) = app.default_window_icon() {
                let _ = tray.set_icon(Some(def.clone()));
            }
            let _ = tray.set_tooltip(Some("AutoFlow"));
        }
    }
}

/// Windows taskbar overlay badge (red alert icon when unanswered > 0).
fn set_taskbar_overlay(app: &tauri::AppHandle, on: bool) {
    #[cfg(windows)]
    {
        let Some(w) = app.get_webview_window("main") else {
            return;
        };
        if on {
            if let Ok(img) = Image::from_bytes(ALERT_ICON) {
                if let Err(e) = w.set_overlay_icon(Some(img)) {
                    log::warn!("[TASKBAR_OVERLAY_ERR] {}", e);
                }
            }
        } else if let Err(e) = w.set_overlay_icon(None) {
            log::warn!("[TASKBAR_OVERLAY_CLEAR_ERR] {}", e);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (app, on);
    }
}

/// Flash the taskbar for ~5s (Phase 3), then clear attention request.
fn flash_taskbar_briefly(app: &tauri::AppHandle) {
    let Some(w) = app.get_webview_window("main") else {
        return;
    };
    let _ = w.request_user_attention(Some(UserAttentionType::Critical));
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(5));
        if let Some(w) = handle.get_webview_window("main") {
            let _ = w.request_user_attention(None);
        }
    });
}

/// Handle WinRT toast activation: open guestRoom when present, else relay notify-click.
#[cfg(windows)]
fn handle_toast_activation(app: &tauri::AppHandle, notify_id: &str) {
    use tauri::Emitter;

    let handle = app.clone();
    let id = notify_id.to_string();
    let guest_room = take_toast_guest_room(notify_id);
    let _ = handle.run_on_main_thread(move || {
        if let Some(room) = guest_room {
            log::info!("[NATIVE_TOAST_ACTIVATED] id={} guest_room={}", id, room);
            open_guest_room_in_shell(&handle, &room);
            return;
        }
        focus_main(&handle);
        let _ = handle.emit(
            "autoflow://notify-click",
            serde_json::json!({ "id": id.clone() }),
        );
        log::info!("[NATIVE_TOAST_ACTIVATED] id={}", id);
    });
}

/// Show the Windows OS toast. We build it directly (not via the notification
/// plugin) so we can force SILENT — the plugin/notify-rust path always plays the
/// Windows default beep, which duplicated AutoFlow's own sound. AutoFlow plays
/// the single selected sound via rodio (play_sound_key).
#[cfg(windows)]
fn show_native_toast(
    app: &tauri::AppHandle,
    notify_id: &str,
    title: &str,
    body: &str,
    silent: bool,
) {
    use tauri_winrt_notification::{Sound, Toast};
    // Prefer the app's registered AppUserModelID (shows "AutoFlow" once installed);
    // fall back to the always-present PowerShell AUMID when unpackaged.
    let app_id = app.config().identifier.clone();
    let title = title.to_string();
    let body = body.to_string();
    let notify_id = notify_id.to_string();
    let toast_sound = || {
        if silent {
            None
        } else {
            Some(Sound::Default)
        }
    };
    let build = |aid: &str| {
        let handle = app.clone();
        let id = notify_id.clone();
        Toast::new(aid)
            .title(&title)
            .text1(&body)
            .sound(toast_sound())
            .on_activated(move |_action| {
                handle_toast_activation(&handle, &id);
                Ok(())
            })
    };
    match build(&app_id).show() {
        Ok(()) => log::info!(
            "[NATIVE_TOAST_SHOWN] aid={} id={} silent={}",
            app_id,
            notify_id,
            silent
        ),
        Err(e1) => {
            log::warn!("[NATIVE_TOAST_AUMID_FAILED] aid={} err={}", app_id, e1);
            match build(Toast::POWERSHELL_APP_ID).show() {
                Ok(()) => log::info!(
                    "[NATIVE_TOAST_SHOWN_FALLBACK] id={} silent={}",
                    notify_id,
                    silent
                ),
                Err(e2) => log::warn!("[NATIVE_TOAST_FAILED] err={}", e2),
            }
        }
    }
}

#[cfg(not(windows))]
fn show_native_toast(
    app: &tauri::AppHandle,
    _notify_id: &str,
    title: &str,
    body: &str,
    _silent: bool,
) {
    use tauri_plugin_notification::NotificationExt;
    if let Err(e) = app
        .notification()
        .builder()
        .title(title.to_string())
        .body(body.to_string())
        .show()
    {
        log::warn!("[NATIVE_TOAST_FAILED] err={}", e);
    }
}

/// Invoked by the injected bridge whenever the web app calls `new Notification`.
#[tauri::command]
fn native_notify(
    app: tauri::AppHandle,
    id: String,
    title: String,
    body: String,
    _tag: String,
    silent: Option<bool>,
    sound_key: Option<String>,
    guest_room: Option<String>,
) {
    let title = if title.trim().is_empty() {
        "AutoFlow".to_string()
    } else {
        title
    };
    // Default silent: the OS toast is visual-only; AutoFlow owns the sound.
    let want_silent = silent.unwrap_or(true);
    remember_toast_guest_room(&id, guest_room.as_deref());
    show_native_toast(&app, &id, &title, &body, want_silent);
    let key = sound_key.as_deref().unwrap_or("default");
    play_sound_key(key);
    set_alert(&app, true);
    flash_taskbar_briefly(&app);
    log::info!(
        "[NATIVE_NOTIFY] id={} sound={} silent={} guest_room={:?}",
        id,
        key,
        want_silent,
        guest_room.as_deref()
    );
}

/// Play a notification sound natively without showing a toast ("테스트 재생").
#[tauri::command]
fn play_sound(sound_key: Option<String>) {
    let key = sound_key.as_deref().unwrap_or("default");
    play_sound_key(key);
    log::info!("[PLAY_SOUND] sound={}", key);
}

/// Optional explicit focus path exposed to the page (window.AutoFlowNative.focus).
#[tauri::command]
fn focus_main_window(app: tauri::AppHandle) {
    focus_main(&app);
}

/// Navigate like `autoflow://chat?guestRoom=N` (toast click / web helper).
#[tauri::command]
fn open_guest_room(app: tauri::AppHandle, room: String) {
    let room = room.trim().to_string();
    if room.is_empty() {
        focus_main(&app);
        return;
    }
    open_guest_room_in_shell(&app, &room);
}

/// Sync taskbar overlay + tray alert from unanswered total (web Room Nav).
#[tauri::command]
fn set_unanswered_badge(app: tauri::AppHandle, count: u32) {
    let on = count > 0;
    set_taskbar_overlay(&app, on);
    set_alert(&app, on);
    if let Some(w) = app.get_webview_window("main") {
        let title = if on {
            format!("AutoFlow 채팅 ({})", count)
        } else {
            "AutoFlow".to_string()
        };
        let _ = w.set_title(&title);
    }
    log::info!("[UNANSWERED_BADGE] count={}", count);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Must register before other plugins so duplicate launches focus the existing
    // instance instead of spawning a second process/window. `deep-link` feature
    // forwards protocol argv from the second process into this callback.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Do not log argv / protocol URLs (may include query values).
            let room = guest_room_from_argv(&argv);
            log::info!(
                "[SINGLE_INSTANCE] duplicate launch guest_room={:?}",
                room.as_deref()
            );
            if let Some(room) = room {
                open_guest_room_in_shell(app, &room);
            } else {
                focus_main(app);
            }
        }));
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Dev / unpackaged: register protocol at runtime. Packaged builds
            // register `autoflow://` via installer (tauri.conf plugins.deep-link).
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(e) = app.deep_link().register_all() {
                    log::warn!("[DEEP_LINK_REGISTER_ERR] {}", e);
                }
            }

            // Runtime deep-link events (macOS / some Windows paths). Windows
            // second-instance URLs are primarily handled via single-instance argv.
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let app_handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for u in event.urls() {
                        // Log only parsed guestRoom — never the full URL (no query dump).
                        let room = parse_guest_room_from_deep_link(u.as_str());
                        log::info!("[DEEP_LINK_EVENT] guest_room={:?}", room.as_deref());
                        if let Some(room) = room {
                            open_guest_room_in_shell(&app_handle, &room);
                        }
                    }
                });
            }

            let handle = app.handle().clone();

            // ── System tray ────────────────────────────────────────────────
            let open_i = MenuItem::with_id(app, "open", "AutoFlow 열기", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &quit_i])?;
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("AutoFlow")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => focus_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        focus_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // ── Main window: remote /chat + injected native bridge ─────────
            let reachable = server_reachable();
            let boot_argv: Vec<String> = std::env::args().collect();
            let cold_guest_room = guest_room_from_argv(&boot_argv);
            // Never log argv or navigation URLs (afts cache-bust must stay out of logs).
            log::info!(
                "[AUTOFLOW_BOOT] reachable={} shell=0.2.1 cold_guest_room={:?}",
                reachable,
                cold_guest_room.as_deref()
            );

            // Cache-bust the page HTML per launch so a freshly deployed /chat
            // (web fixes) always loads — WebView2 otherwise serves a stale
            // cached bundle. Hashed static chunks remain cacheable; only the
            // HTML document URL changes. The query param is ignored by routing.
            // Cold-start deep link: include guestRoom so staff lands on that room.
            let chat_url = chat_url_with_optional_guest_room(cold_guest_room.as_deref());

            let win = WebviewWindowBuilder::new(
                &handle,
                "main",
                WebviewUrl::External(chat_url.parse().unwrap()),
            )
            .title("AutoFlow")
            .inner_size(1200.0, 850.0)
            .min_inner_size(900.0, 600.0)
            .center()
            .initialization_script(BRIDGE_JS)
            .build()?;

            // X button → hide to tray (do not quit). Focus → clear alert.
            let win_evt = win.clone();
            win.on_window_event(move |event| match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = win_evt.hide();
                }
                WindowEvent::Focused(true) => {
                    set_alert(&win_evt.app_handle(), false);
                    let _ = win_evt.request_user_attention(None);
                }
                _ => {}
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            native_notify,
            focus_main_window,
            play_sound,
            open_guest_room,
            set_unanswered_badge
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
