// AutoFlow — Tauri native shell (PoC Phase 1)
// Wraps the remote Next.js /chat as a Windows desktop app and adds the native
// layer only: native OS notification, loud WAV, system tray, window focus.
// The web app at https://autoflow-mvp.vercel.app/chat is loaded unchanged.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

const REMOTE_CHAT_URL: &str = "https://autoflow-mvp.vercel.app/chat";
const SND_DEFAULT: &[u8] = include_bytes!("../assets/default.wav");
const SND_BELL: &[u8] = include_bytes!("../assets/bell.wav");
const SND_BEEP: &[u8] = include_bytes!("../assets/beep.wav");
const SND_INCOMING: &[u8] = include_bytes!("../assets/incoming.mp3");
const SND_NOTIFY_022: &[u8] = include_bytes!("../assets/notify-022.mp3");
const SND_NOTIFY_036: &[u8] = include_bytes!("../assets/notify-036.mp3");
const SND_NOTIFY_053: &[u8] = include_bytes!("../assets/notify-053.mp3");
const ALERT_ICON: &[u8] = include_bytes!("../icons/alert.png");
const BRIDGE_JS: &str = include_str!("../notify-bridge.js");

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

/// Handle WinRT toast activation: foreground the main window and relay the click
/// to the injected notify-bridge (no sound replay on click).
#[cfg(windows)]
fn handle_toast_activation(app: &tauri::AppHandle, notify_id: &str) {
    use tauri::Emitter;

    let handle = app.clone();
    let id = notify_id.to_string();
    let focus_handle = handle.clone();
    let _ = handle.run_on_main_thread(move || {
        focus_main(&focus_handle);
        let _ = focus_handle.emit(
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
) {
    let title = if title.trim().is_empty() {
        "AutoFlow".to_string()
    } else {
        title
    };
    // Default silent: the OS toast is visual-only; AutoFlow owns the sound.
    let want_silent = silent.unwrap_or(true);
    show_native_toast(&app, &id, &title, &body, want_silent);
    let key = sound_key.as_deref().unwrap_or("default");
    play_sound_key(key);
    set_alert(&app, true);
    log::info!("[NATIVE_NOTIFY] id={} sound={} silent={}", id, key, want_silent);
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

/// Cache-busted /chat URL (same origin) so a freshly deployed bundle loads.
/// Uses `&` when the base URL already carries a query string, `?` otherwise.
fn fresh_chat_url() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let sep = if REMOTE_CHAT_URL.contains('?') { '&' } else { '?' };
    format!("{}{}afts={}", REMOTE_CHAT_URL, sep, ts)
}

/// Basic refresh (safe): navigate the main webview to a fresh cache-busted URL.
/// Same-origin navigation → localStorage/session (login, settings) preserved.
fn do_reload_fresh(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let url = fresh_chat_url();
        let _ = win.eval(&format!("window.location.replace('{}')", url));
        let _ = win.set_focus();
        log::info!("[RELOAD_FRESH] {}", url);
    }
}

/// Advanced reset: clear ALL browsing data (cache + cookies + storage → logout),
/// then reload fresh. Login is intentionally cleared.
fn do_clear_app_data(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.clear_all_browsing_data();
        let url = fresh_chat_url();
        let _ = win.eval(&format!("window.location.replace('{}')", url));
        log::info!("[CLEAR_WEBVIEW_CACHE] cleared all browsing data + reload {}", url);
    }
}

/// "최신 화면으로 새로고침" — safe, preserves login/settings.
#[tauri::command]
fn reload_fresh(app: tauri::AppHandle) {
    do_reload_fresh(&app);
}

/// "앱 데이터 초기화" (고급) — clears cache + storage (logout) + reload.
#[tauri::command]
fn clear_webview_cache(app: tauri::AppHandle) {
    do_clear_app_data(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Must register before other plugins so duplicate launches focus the existing
    // instance instead of spawning a second process/window.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(
            |app, _args, _cwd| {
                log::info!("[SINGLE_INSTANCE] duplicate launch → focus existing window");
                focus_main(app);
            },
        ));
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let handle = app.handle().clone();

            // ── System tray ────────────────────────────────────────────────
            let open_i = MenuItem::with_id(app, "open", "AutoFlow 열기", true, None::<&str>)?;
            let refresh_i =
                MenuItem::with_id(app, "refresh", "🔄 최신 화면으로 새로고침", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &refresh_i, &quit_i])?;
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("AutoFlow")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => focus_main(app),
                    "refresh" => do_reload_fresh(app),
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
            log::info!(
                "[AUTOFLOW_BOOT] reachable={} shell={}",
                reachable,
                env!("CARGO_PKG_VERSION")
            );

            // Cache-bust the page HTML per launch so a freshly deployed /chat
            // (web fixes) always loads — WebView2 otherwise serves a stale
            // cached bundle. Hashed static chunks remain cacheable; only the
            // HTML document URL changes. The query param is ignored by routing.
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let sep = if REMOTE_CHAT_URL.contains('?') { '&' } else { '?' };
            let chat_url = format!("{}{}afts={}", REMOTE_CHAT_URL, sep, ts);

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

            // ── Native window menu bar (Windows top menu) ──────────────────
            // Always-visible, discoverable native UI so users can refresh a
            // stale web bundle WITHOUT any /chat web change or web deploy.
            // Primary action + Ctrl+Shift+R accelerator; advanced reset hidden
            // under a "고급" submenu.
            let win_refresh_i = MenuItem::with_id(
                app,
                "win_reload_fresh",
                "최신 화면으로 새로고침",
                true,
                Some("CmdOrCtrl+Shift+R"),
            )?;
            let win_clear_i = MenuItem::with_id(
                app,
                "win_clear_data",
                "앱 데이터 초기화 (재로그인 필요)",
                true,
                None::<&str>,
            )?;
            let adv_sub = Submenu::with_items(app, "고급", true, &[&win_clear_i])?;
            let sep = PredefinedMenuItem::separator(app)?;
            let refresh_sub = Submenu::with_items(
                app,
                "🔄 최신 화면으로 새로고침",
                true,
                &[&win_refresh_i, &sep, &adv_sub],
            )?;
            let window_menu = Menu::with_items(app, &[&refresh_sub])?;
            win.set_menu(window_menu)?;
            win.on_menu_event(move |win, event| match event.id.as_ref() {
                "win_reload_fresh" => do_reload_fresh(win.app_handle()),
                "win_clear_data" => do_clear_app_data(win.app_handle()),
                _ => {}
            });

            // X button → hide to tray (do not quit). Focus → clear alert.
            let win_evt = win.clone();
            win.on_window_event(move |event| match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = win_evt.hide();
                }
                WindowEvent::Focused(true) => {
                    set_alert(&win_evt.app_handle(), false);
                }
                _ => {}
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            native_notify,
            focus_main_window,
            play_sound,
            reload_fresh,
            clear_webview_cache
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
