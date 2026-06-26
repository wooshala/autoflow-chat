// AutoFlow — Tauri native shell (PoC Phase 1)
// Wraps the remote Next.js /chat as a Windows desktop app and adds the native
// layer only: native OS notification, loud WAV, system tray, window focus.
// The web app at https://autoflow-mvp.vercel.app/chat is loaded unchanged.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;

const REMOTE_CHAT_URL: &str = "https://autoflow-mvp.vercel.app/chat";
const SND_DEFAULT: &[u8] = include_bytes!("../assets/default.wav");
const SND_BELL: &[u8] = include_bytes!("../assets/bell.wav");
const SND_BEEP: &[u8] = include_bytes!("../assets/beep.wav");
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
        _ => (SND_DEFAULT, 1.6),
    };
    std::thread::spawn(move || {
        if let Ok((_stream, handle)) = rodio::OutputStream::try_default() {
            if let Ok(sink) = rodio::Sink::try_new(&handle) {
                let cursor = std::io::Cursor::new(bytes);
                if let Ok(src) = rodio::Decoder::new(cursor) {
                    sink.set_volume(vol); // > 1.0 amplifies above source level
                    sink.append(src);
                    sink.sleep_until_end(); // keep _stream alive until done
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

/// Invoked by the injected bridge whenever the web app calls `new Notification`.
#[tauri::command]
fn native_notify(
    app: tauri::AppHandle,
    id: String,
    title: String,
    body: String,
    _tag: String,
    sound_key: Option<String>,
) {
    let title = if title.trim().is_empty() {
        "AutoFlow".to_string()
    } else {
        title
    };
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        log::warn!("[NATIVE_NOTIFY_ERR] id={} err={}", id, e);
    }
    let key = sound_key.as_deref().unwrap_or("default");
    play_sound_key(key);
    set_alert(&app, true);
    log::info!("[NATIVE_NOTIFY] id={} sound={}", id, key);
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
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
            log::info!("[AUTOFLOW_BOOT] reachable={}", reachable);

            // Cache-bust the page HTML per launch so a freshly deployed /chat
            // (web fixes) always loads — WebView2 otherwise serves a stale
            // cached bundle. Hashed static chunks remain cacheable; only the
            // HTML document URL changes. The query param is ignored by routing.
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let chat_url = format!("{}?afts={}", REMOTE_CHAT_URL, ts);

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
                }
                _ => {}
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            native_notify,
            focus_main_window,
            play_sound
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
