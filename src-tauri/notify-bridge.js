// AutoFlow Tauri bridge — injected as an initialization_script BEFORE the remote
// /chat page loads. It transparently replaces the browser Notification API with
// the native (Tauri) path. The web app keeps calling `new Notification(...)`
// unchanged; this shim reroutes display + sound + click-to-focus to Rust.
//
// IMPORTANT: This file lives in the Tauri shell (exe). It never ships to Vercel
// and never modifies web app code. Changing it requires an exe rebuild.
(function () {
  'use strict';

  // Only activate inside the Tauri webview. In a normal browser this is a no-op,
  // so the original web Notification behavior is untouched.
  function tauri() {
    return typeof window !== 'undefined' ? window.__TAURI__ : undefined;
  }
  if (!tauri()) {
    // __TAURI__ may attach slightly later; retry briefly, else bail (plain browser).
    var tries = 0;
    var iv = setInterval(function () {
      tries += 1;
      if (tauri()) { clearInterval(iv); install(); }
      else if (tries > 50) { clearInterval(iv); }
    }, 20);
  } else {
    install();
  }

  function invoke(cmd, args) {
    var t = tauri();
    try {
      if (t && t.core && typeof t.core.invoke === 'function') {
        return t.core.invoke(cmd, args);
      }
    } catch (e) { /* swallow */ }
    return Promise.reject(new Error('tauri invoke unavailable'));
  }

  // Selected notification sound key, persisted by the /chat UI. Keep in sync
  // with lib/chat/notifySound.ts (NOTIFY_SOUND_STORAGE_KEY).
  function readSoundKey() {
    try {
      var v = window.localStorage.getItem('autoflow_notify_sound');
      var known = {
        default: 1, 'soft-chime': 1, bell: 1, beep: 1, ding: 1, pop: 1, glass: 1,
        'water-drop': 1, 'office-soft': 1, 'digital-soft': 1, knock: 1,
        incoming: 1, 'notify-022': 1, 'notify-036': 1, 'notify-053': 1, mute: 1
      };
      if (v && known[v]) return v;
    } catch (e) { /* ignore */ }
    return 'soft-chime';
  }

  function install() {
    if (window.__AUTOFLOW_NATIVE_BRIDGE__) return;
    window.__AUTOFLOW_NATIVE_BRIDGE__ = true;

    var registry = Object.create(null);
    var seq = 0;

    // Route native toast clicks (emitted by Rust) back to the matching
    // Notification instance's onclick handler. Rust also focuses the window.
    try {
      var t = tauri();
      if (t && t.event && typeof t.event.listen === 'function') {
        t.event.listen('autoflow://notify-click', function (evt) {
          try {
            var id = evt && evt.payload && evt.payload.id;
            var inst = id != null ? registry[id] : null;
            if (inst && typeof inst.onclick === 'function') {
              inst.onclick({ type: 'click', target: inst });
            }
          } catch (e) { /* ignore */ }
        });
      }
    } catch (e) { /* ignore */ }

    function AutoFlowNotification(title, options) {
      options = options || {};
      var self = this;
      this.title = title;
      this.body = options.body || '';
      this.tag = options.tag || '';
      this.onshow = null;
      this.onclick = null;
      this.onclose = null;
      this.onerror = null;
      this._id = 'n' + (++seq);
      registry[this._id] = this;

      invoke('native_notify', {
        id: this._id,
        title: String(title == null ? '' : title),
        body: String(this.body || ''),
        tag: String(this.tag || ''),
        // Forward the web silent flag (default true): the native toast must be
        // silent so only AutoFlow's selected sound (rodio) plays.
        silent: options.silent !== false,
        soundKey: readSoundKey()
      })
        .then(function () {
          if (typeof self.onshow === 'function') {
            try { self.onshow({ type: 'show', target: self }); } catch (e) {}
          }
        })
        .catch(function (err) {
          if (typeof self.onerror === 'function') {
            try { self.onerror({ type: 'error', target: self, error: err }); } catch (e) {}
          }
        });
    }

    AutoFlowNotification.prototype.close = function () {
      try { delete registry[this._id]; } catch (e) {}
      if (typeof this.onclose === 'function') {
        try { this.onclose({ type: 'close', target: this }); } catch (e) {}
      }
    };
    // Minimal EventTarget compatibility (web code uses on* props, but be safe).
    AutoFlowNotification.prototype.addEventListener = function (type, cb) {
      if (type === 'show') this.onshow = cb;
      else if (type === 'click') this.onclick = cb;
      else if (type === 'close') this.onclose = cb;
      else if (type === 'error') this.onerror = cb;
    };
    AutoFlowNotification.prototype.removeEventListener = function () {};

    // Permission is always granted in the native shell (OS handles gating).
    Object.defineProperty(AutoFlowNotification, 'permission', {
      get: function () { return 'granted'; },
      configurable: true
    });
    AutoFlowNotification.requestPermission = function (cb) {
      if (typeof cb === 'function') { try { cb('granted'); } catch (e) {} }
      return Promise.resolve('granted');
    };
    AutoFlowNotification.maxActions = 2;

    try {
      Object.defineProperty(window, 'Notification', {
        value: AutoFlowNotification,
        writable: true,
        configurable: true
      });
    } catch (e) {
      window.Notification = AutoFlowNotification;
    }

    // Optional explicit API for future web-side use (not required by PoC).
    window.AutoFlowNative = {
      notify: function (title, body) {
        return invoke('native_notify', {
          id: 'api' + (++seq), title: String(title || ''), body: String(body || ''), tag: '', soundKey: readSoundKey()
        });
      },
      // Play a sound natively without showing a toast (used by "테스트 재생").
      playSound: function (key) {
        return invoke('play_sound', { soundKey: String(key || readSoundKey()) });
      },
      focus: function () { return invoke('focus_main_window', {}); },
      // Flash the taskbar AutoFlow button for an unread message (focus gate +
      // dedupe handled in Rust). Independent of the toast/sound path.
      requestAttention: function () { return invoke('request_attention', {}); },
      // Stop the taskbar flash (e.g. /chat tab visible again).
      clearAttention: function () { return invoke('clear_attention', {}); }
    };

    // ── Connection fallback ────────────────────────────────────────────────
    // Minimal "서버에 연결할 수 없습니다." overlay when the remote is unreachable.
    // (Top-level data: URLs are blocked by WebView2, so we overlay in-page.)
    function showFallback() {
      if (document.getElementById('autoflow-offline')) return;
      var el = document.createElement('div');
      el.id = 'autoflow-offline';
      el.setAttribute('style', [
        'position:fixed', 'inset:0', 'z-index:2147483647',
        'background:#111', 'color:#eee', 'display:flex',
        'align-items:center', 'justify-content:center',
        'font-family:system-ui,sans-serif', 'text-align:center'
      ].join(';'));
      el.innerHTML =
        '<div><h2 style="margin:0 0 8px">서버에 연결할 수 없습니다.</h2>' +
        '<p style="opacity:.7;margin:0">네트워크 확인 후 AutoFlow를 다시 시도해 주세요.</p></div>';
      (document.body || document.documentElement).appendChild(el);
    }
    function clearFallback() {
      var el = document.getElementById('autoflow-offline');
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
    try {
      window.addEventListener('offline', showFallback);
      window.addEventListener('online', clearFallback);
      window.addEventListener('load', function () {
        if (navigator && navigator.onLine === false) showFallback();
      });
    } catch (e) { /* ignore */ }

    try { console.log('[AUTOFLOW_NATIVE_BRIDGE_READY]', { rev: 'tauri-poc-1' }); } catch (e) {}
  }
})();
