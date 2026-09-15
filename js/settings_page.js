// Standalone page reached from the sidebar "Settings" entry. js/shell.js

  const __ucpFindGuardAction = (target) => {
    let n = target;
    while (n && n.nodeType === 1 && typeof n.__ucpAction !== 'function') n = n.parentElement;
    return (n && typeof n.__ucpAction === 'function') ? n : null;
  };
  window.addEventListener('click', (e) => {
    const n = __ucpFindGuardAction(e.target);
    if (!n) return; // not one of ours → leave the event alone
    let t = e.target;
    while (t && t !== n && t.nodeType === 1) {
      const tag = t.tagName;
      if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t.isContentEditable) return;
      t = t.parentElement;
    }
    e.stopPropagation(); // NO preventDefault — the native click default stays
    try {
      n.__ucpAction();
      console.info('[UCP click guard] delivered ' + e.type + ' →', (n.id || (typeof n.className === 'string' ? n.className : '') || n.tagName).toString().slice(0, 48));
    } catch (err) { console.warn('UCP settings click guard', err); }
  }, true);

chrome.storage.local.get('toggle_power', (result) => {
  if (!result || !result['toggle_power']) return;

  const BG_PRESETS = [
    '/assets/bgs/bg.jpg', '/assets/bgs/bg1.jpg', '/assets/bgs/bg2.jpg',
    '/assets/bgs/bg3.jpg', '/assets/bgs/bg4.jpg', '/assets/bgs/bg5.jpg',
    '/assets/bgs/bg6.jpg', '/assets/bgs/bg7.jpg',
  ];
  const CURRENT_BG_KEY = 'background-wallpaper-path';

  const powerOn = (v) => (v === undefined || v === null) ? true : !!v;

  // helpers
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"'`=\/]/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
      "'": '&#39;', '`': '&#x60;', '=': '&#x3D;', '/': '&#x2F;',
    }[c]));
  }
  // Extension paths must be slash-less (no leading '/') so chrome.runtime.getURL
  // resolves them cleanly to chrome-extension://<id>/assets/... .
  function extUrl(p) {
    try { return chrome.runtime.getURL(String(p).replace(/^\/+/, '')); }
    catch (e) { return p; }
  }
  // True while the extension context is live. After the extension is reloaded
  // from chrome://extensions, already-open tabs keep their OLD content scripts:
  // chrome.runtime.getURL() then throws, bundled images can't be fetched, and
  // background picking silently breaks until the page is refreshed. Detected
  // so the page can say so instead of rendering blank tiles / no wallpaper.
  function isContextAlive() {
    try { chrome.runtime.getURL('manifest.json'); return true; } catch (e) { return false; }
  }
  function byId(id) { return document.getElementById(id); }
  function syncSwitch(id, on) {
    const el = byId(id); if (!el) return;
    el.classList.toggle('on', !!on);
    el.setAttribute('aria-checked', String(!!on));
  }
  function ensureMaterialIcons() {
    if (byId('ucp-shell-icons')) return;
    const l = document.createElement('link');
    l.id = 'ucp-shell-icons';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
    document.head.appendChild(l);
  }
  // Page stylesheet (shared frame/card rules already come from shell.css).
  // Also carries the "wallpaper guarantee" layer rules (see the CSS header).
  function ensurePageCss() {
    if (byId('ucp-shell-settings-css')) return;
    const l = document.createElement('link');
    l.id = 'ucp-shell-settings-css';
    l.rel = 'stylesheet';
    try { l.href = chrome.runtime.getURL('styles/settings_page.css'); } catch (e) { return; }
    document.head.appendChild(l);
  }

  // =========================================================================
  // WALLPAPER SYNC — make the saved background actually paint on this page.
  // --ucp-bg-image is normally set by student.js at page load; in tabs where
  // that did not run (opened before the extension loaded, extension reloaded
  // without a page reload) the variable is missing and nothing paints. This
  // mirrors student.js's resolve + probe + default-fallback logic and runs on
  // every render, so the background is guaranteed to show behind the page.
  // =========================================================================
  const DEFAULT_BG = 'assets/bgs/bg.jpg'; // bundled — always exists
  // Cap for uploaded background size (max width/height it's stored at). The
  // Storage & Cache section lets the user lower it to save storage.
  const BG_MAX_KEY = 'ucp_bg_max_size';
  let bgMaxDim = 1400;
  function applyWallpaper(path) {
    const body = document.body;
    if (!body) return;
    let url;
    try {
      url = /^data:|^https?:/i.test(String(path))
        ? path
        : chrome.runtime.getURL(String(path || DEFAULT_BG).replace(/^\/+/, ''));
    } catch (e) {
      // Extension context gone (reloaded without a page refresh) — the bundled
      // wallpaper can't be fetched; say so instead of staying silent.
      showBgStatus('Extension was reloaded — refresh this page (F5) to change the background.', true);
      return;
    }
    const apply = (finalUrl) => {
      try {
        body.style.setProperty('--ucp-bg-image', `url("${finalUrl}")`);
        body.style.setProperty('--ucp-bg-url', finalUrl);
      } catch (e) {}
    };
    // Validate that the image actually loads before publishing it — a stale
    // saved value (bad custom URL, …) would otherwise leave a blank page.
    const probe = new Image();
    probe.onload = () => apply(url);
    probe.onerror = () => {
      let fallback;
      try { fallback = chrome.runtime.getURL(DEFAULT_BG); } catch (e) { return; }
      if (fallback !== url) {
        console.warn('applyWallpaper: background failed to load, using default', url);
        apply(fallback);
        showBgStatus('Saved background could not be loaded — using the default.', true);
      }
    };
    probe.src = url;
  }

  // (Setting toggles no longer write storage on change — they run the
  // pending Save/Discard model wired in render(); onChanged below syncs the
  // UI from storage changes made by THIS page's Save button or other tabs.)

  // --- Blur amount (slider, 0–10 px) -------------------------------------
  // Replaces the old on/off `ucp_blur_bg` boolean. The amount is applied as
  // body.ucp-blur + a --ucp-blur-px variable (the CSS blur filter reads the
  // variable). The legacy boolean still works when no amount is saved yet:
  // a stored true maps to the old fixed 10px.
  const BLUR_KEY = 'ucp_blur_amount';
  const BLUR_MAX = 10;
  // True while the user is pressing the slider — a storage read-back must
  // never rewrite the thumb's value mid-drag (it would snap it back to a
  // stale amount and the control would appear frozen).
  let blurDragging = false;
  function blurEffective(r) {
    if (r && typeof r[BLUR_KEY] === 'number') return Math.min(BLUR_MAX, Math.max(0, r[BLUR_KEY]));
    return (r && r.ucp_blur_bg) ? BLUR_MAX : 0;
  }
  function syncBlurUi(amount) {
    const range = byId('ucp-shell-blurRange');
    const label = byId('ucp-shell-blurValue');
    if (range && !blurDragging && parseInt(range.value, 10) !== amount) range.value = amount;
    // Filled-track percentage for the custom slider CSS (--blur-fill).
    if (range) range.style.setProperty('--blur-fill', (amount / BLUR_MAX * 100) + '%');
    if (label) label.textContent = amount > 0 ? amount + ' px' : '0 px (off)';
  }
  // Apply the blur class + px variable on THIS page directly (don't rely on
  // shell.js's listener being present, e.g. a standalone page load).
  function applyBlurClass(amount) {
    try {
      const on = amount > 0;
      document.body.classList.toggle('ucp-blur', on);
      if (on) document.body.style.setProperty('--ucp-blur-px', amount + 'px');
      else document.body.style.removeProperty('--ucp-blur-px');
    } catch (e) {}
  }
  function setBlurValue(v, persist) {
    syncBlurUi(v);
    applyBlurClass(v);
    if (persist) {
      // Also mirror the legacy boolean so an older shell.js (still running in
      // a tab that hasn't refreshed) keeps blurring at the old fixed amount.
      try { chrome.storage.local.set({ [BLUR_KEY]: v, ucp_blur_bg: v > 0 }); } catch (e) {}
    }
  }
  // --- Accent-color toggle (ON by default; off = plain white) -------------
  const ACCENT_KEY = 'ucp_bg_accent';
  const ACCENT_COLOR_KEY = 'ucp_bg_accent_color'; // cached "r,g,b" of last sample
  // ON unless the user explicitly turned it off (missing value = on).
  const accentOn = (v) => (v === undefined || v === null) ? true : !!v;
  // Stay Active is ON by default (missing value = on).
  const stayOn = (v) => (v === undefined || v === null) ? true : !!v;

  const COURSE_CARD_CONFIG_KEY = 'ucp_course_card_config';
  const DEFAULT_COURSE_CARD_CONFIG = { code: true, section: true, credits: true, defaultBtn: 'gradebook' };
  const NTFY_KEY = 'ucp_ntfy_topic';              // private ntfy topic the phones subscribe to
  const DISCORD_KEY = 'ucp_discord_webhook';      // Discord Webhook URL (optional, advanced)
  const NOTIF_LAST_MODE_KEY = 'ucp_notif_last_mode'; // what the scan-bar quick toggle re-enables

  // Default notification mode for a brand-new user (both push keys never
  // written): Background notification — background checks on out of the box.
  // 'Off' is no longer a behaviour (the master toggle at the card head is the
  // on/off switch) — a stored both-false pair remaps to 'push', the least
  // aggressive mode that still works (browser-open only).
  const notifModeFromKeys = (r) => {
    const push = r ? r.ucp_push_notify : undefined;
    const instant = r ? r.ucp_instant_push : undefined;
    if (push === undefined && instant === undefined) return 'instant';
    return instant ? 'instant' : 'push';
  };

  function syncNotifBehaviorUi(pushOn, instantOn) {
    const mode = instantOn ? 'instant' : 'push';
    document.querySelectorAll('#ucp-shell-notifBehaviorSeg .ucp-shell-seg-opt').forEach((o) => {
      const on = o.dataset.notifMode === mode;
      o.classList.toggle('is-on', on);
      o.setAttribute('aria-checked', String(on));
    });
    const sub = byId('ucp-shell-notifBehaviorSub');
    if (sub) {
      if (mode === 'push') sub.textContent = 'Push Notification will only work if the browser is open.';
      else sub.textContent = 'Checks course updates in the background and pushes to your phone; your computer still needs to be ON for this to work.';
    }
  }

  // Notification master toggle (default ON — the service worker seeds the
  // key on first run): off = the card body is dimmed + inert
  // (.ucp-shell-notif-off, see settings_page.css) and both of the SW's
  // notification alarms gate on this key (background/script.js). Instant —
  // the write happens in the same gesture, no pending Save/Discard.
  function setNotifEnabledUi(on) {
    const card = byId('ucp-shell-notifSettingsBlock');
    if (card) card.classList.toggle('ucp-shell-notif-off', !on);
    syncSwitch('ucp-shell-notifToggle', !!on);
  }

  function syncCourseCardUi(cfg) {
    cfg = cfg || {};
    document.querySelectorAll('[data-course-card-item]').forEach((el) => {
      const k = el.dataset.courseCardItem;
      const on = cfg[k] === undefined ? true : !!cfg[k];
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-checked', String(on));
    });
    const def = cfg.defaultBtn || 'gradebook';
    document.querySelectorAll('#ucp-shell-courseBtnDefault .ucp-shell-seg-opt').forEach((o) => {
      const on = o.dataset.courseBtn === def;
      o.classList.toggle('is-on', on);
      o.setAttribute('aria-checked', String(on));
    });
  }

  // --- ntfy (phone push) ----------------------------------------------------
  // A private topic the phone subscribes to: 'ucp-' + 24 hex chars (192
  // random bits). ntfy.sh topics are 1–64 URL-safe chars — ours fits by
  // construction. The QR encodes https://ntfy.sh/<topic>; if the QR image
  // never loads (portal CSP), the URL is always shown as plain text too.
  function newNtfyTopic() {
    const bytes = new Uint8Array(12);
    try { (self.crypto || crypto).getRandomValues(bytes); } catch (e) { for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256); }
    return 'ucp-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  const ntfyTopicUrl = (topic) => 'https://ntfy.sh/' + topic;
  const ntfyQrUrl = (topic) => 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=6&data=' + encodeURIComponent(ntfyTopicUrl(topic));

  // Paint the "Add other devices" row: the QR panel is visible while a topic
  // exists; the Add button otherwise. Rotate/Remove appear with a topic.
  function renderNtfyUi(topic) {
    const has = !!topic;
    const panel = byId('ucp-shell-devicesPanel');
    const add = byId('ucp-shell-devicesAdd');
    const rotate = byId('ucp-shell-devicesRotate');
    const test = byId('ucp-shell-devicesTest');
    const remove = byId('ucp-shell-devicesRemove');
    if (panel) panel.hidden = !has;
    if (add) add.hidden = has;
    if (rotate) rotate.hidden = !has;
    if (test) test.hidden = !has;
    if (remove) remove.hidden = !has;
    if (!has) return;
    const qr = byId('ucp-shell-devicesQr');
    if (qr) qr.src = ntfyQrUrl(topic);
    const urlEl = byId('ucp-shell-devicesUrl');
    if (urlEl) urlEl.textContent = ntfyTopicUrl(topic);
  }

  // Ask the service worker to (re)create the topic + fire the test push the
  // phone should receive. The worker owns the fetch (ntfy CORS is open).
  function ntfySendTest() {
    try { chrome.runtime.sendMessage({ type: 'UCP_NTFY_TEST' }, () => void chrome.runtime.lastError); } catch (e) {}
  }
  function discordSendTest() {
    try { chrome.runtime.sendMessage({ type: 'UCP_DISCORD_TEST' }, () => void chrome.runtime.lastError); } catch (e) {}
  }

  function initPrefs() {
    chrome.storage.local.get([
      'ucp_night_mode', 'ucp_night_mode_deep', 'ucp_blur_bg', BLUR_KEY, 'toggle_stay',
      'ucp_enrollment_ui_new', CURRENT_BG_KEY, ACCENT_KEY, BG_MAX_KEY, 'ucp_push_notify',
      'ucp_instant_push', 'ucp_notif_enabled', COURSE_CARD_CONFIG_KEY, NTFY_KEY, DISCORD_KEY
    ], (r) => {
      syncSwitch('ucp-shell-stayToggle', r ? stayOn(r.toggle_stay) : true);
      // Dark Mode is the default now — a never-set value shows ON (shell.js
      // seeds the stored true on first run).
      syncSwitch('ucp-shell-nightToggle', (r && r.ucp_night_mode === undefined) ? true : !!r.ucp_night_mode);
      // Night Mode (deep — wallpaper removed) is OFF by default; missing = off.
      syncSwitch('ucp-shell-nightDeepToggle', !!(r && r.ucp_night_mode_deep));
      syncSwitch('ucp-shell-accentToggle', r ? accentOn(r[ACCENT_KEY]) : true);
      // Default is the OLD portal enrollment UI unless the user opted in.
      syncSwitch('ucp-shell-enrollToggle', !!(r && r.ucp_enrollment_ui_new));
      // Notification Behaviour segmented control — first-run default is
      // Instant Push (see notifModeFromKeys): a never-set pair reads as
      // 'instant', matching the service worker's onInstalled seed.
      const nm = notifModeFromKeys(r);
      syncNotifBehaviorUi(nm === 'push' || nm === 'instant', nm === 'instant');
      // Notification master toggle — missing key reads as ON (the SW seeds
      // it on first run); OFF greys out the card body (setNotifEnabledUi).
      setNotifEnabledUi((r && r.ucp_notif_enabled === undefined) ? true : !!r.ucp_notif_enabled);
      // Discord Webhook input (optional) + the ntfy QR panel.
      const discInput = byId('ucp-shell-discordInput');
      if (discInput) discInput.value = (r && r[DISCORD_KEY]) || '';
      renderNtfyUi(r ? r[NTFY_KEY] : undefined);
      syncCourseCardUi((r && r[COURSE_CARD_CONFIG_KEY]) || DEFAULT_COURSE_CARD_CONFIG);
      // Blur slider (merged into the Background card) — restore + apply.
      const blur = blurEffective(r);
      syncBlurUi(blur);
      applyBlurClass(blur);
      // Background-size cap (Storage & Cache).
      syncBgMaxSize(r ? r[BG_MAX_KEY] : undefined);
      const savedBg = (r && r[CURRENT_BG_KEY]) || null; // null, never undefined
      renderBgGrid(savedBg);
      // Guarantee the saved wallpaper paints on this page (see applyWallpaper).
      applyWallpaper(savedBg);
      // Accent mode (ON by default): apply the cached tint now, re-sample below.
      if (r && accentOn(r[ACCENT_KEY])) applyAccentNow();
    });
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    // A setting with a pending (unsaved) preview is NOT re-painted from
    // storage here — the local preview wins; the stored value only re-bases
    // the pending entry's `previous` (so Discard still lands on the true
    // stored value).
    if (changes.toggle_stay) {
      const e = pending.get('stay');
      if (e) e.previous = !!changes.toggle_stay.newValue;
      else syncSwitch('ucp-shell-stayToggle', !!changes.toggle_stay.newValue);
    }
    if (changes.ucp_night_mode) {
      const e = pending.get('dark');
      if (e) e.previous = !!changes.ucp_night_mode.newValue;
      else syncSwitch('ucp-shell-nightToggle', !!changes.ucp_night_mode.newValue);
    }
    if (changes.ucp_night_mode_deep) {
      const e = pending.get('night');
      if (e) e.previous = !!changes.ucp_night_mode_deep.newValue;
      else syncSwitch('ucp-shell-nightDeepToggle', !!changes.ucp_night_mode_deep.newValue);
    }
    if (changes.ucp_enrollment_ui_new) {
      const e = pending.get('enroll');
      if (e) e.previous = !!changes.ucp_enrollment_ui_new.newValue;
      else syncSwitch('ucp-shell-enrollToggle', !!changes.ucp_enrollment_ui_new.newValue);
    }
    // Notification master toggle (instant — no pending entry exists for it;
    // a value written here is the final value). Also fires for this page's
    // own write — setNotifEnabledUi is idempotent, so that is harmless.
    if (changes.ucp_notif_enabled) {
      setNotifEnabledUi(changes.ucp_notif_enabled.newValue !== false);
    }
    if (changes[BLUR_KEY] || changes.ucp_blur_bg) {
      chrome.storage.local.get([BLUR_KEY, 'ucp_blur_bg'], (r) => {
        const amt = blurEffective(r);
        const e = pending.get('blur');
        if (e) { e.previous = amt; return; } // local preview in progress
        syncBlurUi(amt);
        applyBlurClass(amt);
      });
    }
    if (changes[ACCENT_KEY]) {
      const e = pending.get('accent');
      if (e) { e.previous = accentOn(changes[ACCENT_KEY].newValue); return; }
      syncSwitch('ucp-shell-accentToggle', accentOn(changes[ACCENT_KEY].newValue));
      if (accentOn(changes[ACCENT_KEY].newValue)) applyAccentNow();
      else clearAccent();
    }
    if (changes[CURRENT_BG_KEY]) {
      const e = pending.get('bg');
      if (e) { e.previous = changes[CURRENT_BG_KEY].newValue || null; return; }
      renderBgGrid(changes[CURRENT_BG_KEY].newValue);
      // Another tab may have changed the wallpaper — keep this page in sync.
      applyWallpaper(changes[CURRENT_BG_KEY].newValue);
      // A new background changes its accent color — refresh the tint.
      try {
        chrome.storage.local.get(ACCENT_KEY, (r) => { if (r && accentOn(r[ACCENT_KEY])) applyAccentNow(); });
      } catch (e2) {}
    }
    // Dashboard-item toggles changed from the dashboard (or another tab).
    if (changes['ucp_dashboard_items']) {
      const e = pending.get('dash');
      if (e) { e.previous = changes['ucp_dashboard_items'].newValue || {}; return; }
      const state = changes['ucp_dashboard_items'].newValue || {};
      document.querySelectorAll('[data-dash-item]').forEach((el) => {
        const k = el.dataset.dashItem;
        const on = state[k] === undefined ? true : !!state[k];
        el.classList.toggle('is-on', on);
        el.setAttribute('aria-checked', String(on));
      });
    }
    // Course card config changed from another tab
    if (changes[COURSE_CARD_CONFIG_KEY]) {
      const e = pending.get('courseCard');
      if (e) { e.previous = changes[COURSE_CARD_CONFIG_KEY].newValue || DEFAULT_COURSE_CARD_CONFIG; return; }
      syncCourseCardUi(changes[COURSE_CARD_CONFIG_KEY].newValue || DEFAULT_COURSE_CARD_CONFIG);
    }
    // ntfy topic / Discord Webhook changed elsewhere (another settings tab,
    // a clear-cache) — keep this page in sync.
    if (changes[NTFY_KEY]) {
      renderNtfyUi(changes[NTFY_KEY].newValue || null);
    }
    if (changes[DISCORD_KEY]) {
      const e = pending.get('discord');
      if (e) { e.previous = changes[DISCORD_KEY].newValue || ''; return; }
      const inp = byId('ucp-shell-discordInput');
      if (inp) inp.value = changes[DISCORD_KEY].newValue || '';
    }
    // Notification mode (off / push / instant) changed from another surface
    // (the scan-bar quick toggle on the notifications page).
    if (changes['ucp_push_notify'] || changes['ucp_instant_push']) {
      if (pending.get('notifMode')) return; // local preview owns the write
      chrome.storage.local.get(['ucp_push_notify', 'ucp_instant_push'], (r) => {
        syncNotifBehaviorUi(!!(r && r.ucp_push_notify), !!(r && r.ucp_instant_push));
      });
    }
    // Notification-widget tab prefs changed from another tab.
    if (changes['ucp_notif_tabs']) {
      const e = pending.get('notif');
      if (e) { e.previous = changes['ucp_notif_tabs'].newValue || {}; return; }
      const state = changes['ucp_notif_tabs'].newValue || {};
      const tabs = state.tabs || {};
      document.querySelectorAll('[data-notif-tab]').forEach((el) => {
        const k = Number(el.dataset.notifTab);
        const on = tabs[k] === undefined ? true : !!tabs[k];
        el.classList.toggle('is-on', on);
        el.setAttribute('aria-checked', String(on));
      });
      let def = Number(state.default);
      if (!isFinite(def) || def < 0 || def > 4) def = 0;
      document.querySelectorAll('#ucp-shell-notifDefault .ucp-shell-seg-opt').forEach((o) => {
        const on = Number(o.dataset.notifDefault) === def;
        o.classList.toggle('is-on', on);
        o.setAttribute('aria-checked', String(on));
      });
    }
    // Notification behavior / push changed from another tab.
    if (changes.ucp_push_notify || changes.ucp_instant_push) {
      const e = pending.get('notifMode');
      if (!e) {
        chrome.storage.local.get(['ucp_push_notify', 'ucp_instant_push'], (r) => {
          syncNotifBehaviorUi(!!(r && r.ucp_push_notify), !!(r && r.ucp_instant_push));
        });
      }
    }
  });

  // =========================================================================
  // ACCENT COLOR (ON by default) — tints this page's icons, buttons and
  // headings with the dominant vibrant color of the current background
  // image. js/shell.js runs the same logic globally on every page; this
  // local copy keeps the Settings page responsive to background changes. The
  // color is sampled on a small canvas: `data:` URLs (uploads) are safe to
  // draw directly, and extension images are fetched first (a
  // chrome-extension:// <img> would otherwise taint the canvas). A
  // cross-origin image that still taints the canvas just falls back to the
  // plain-white default (sampling returns null, the cached color is kept).
  // When ON the page gets body.ucp-bg-accent + a --ucp-accent variable; the
  // page stylesheets do the tinting (see settings_page.css /
  // notification_page.css).
  // =========================================================================
  function sampleAccent(img) {
    const S = 48;
    try {
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, S, S);
      const d = ctx.getImageData(0, 0, S, S).data;
      // Quantize into coarse buckets; score buckets by saturation so the
      // result is the image's dominant VIBRANT hue, not its average gray.
      const buckets = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        const lum = (mx + mn) / 510;
        if (sat < 0.22 || lum < 0.12 || lum > 0.95) continue; // skip gray/dark/white
        const key = ((r >> 5) << 4) | ((g >> 5) << 2) | (b >> 5);
        const k = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0, s: 0 };
        k.n++; k.r += r; k.g += g; k.b += b; k.s += sat;
        buckets.set(key, k);
      }
      let best = null, bestScore = -1;
      for (const k of buckets.values()) {
        const score = (k.s / k.n) * Math.sqrt(k.n); // avg saturation x frequency
        if (score > bestScore) { bestScore = score; best = k; }
      }
      if (!best) return null;
      let r = Math.round(best.r / best.n), g = Math.round(best.g / best.n), b = Math.round(best.b / best.n);
      // Keep it legible over the dark portal: brighten a too-dark accent.
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum < 0.45) {
        const f = 0.45 / Math.max(lum, 0.05);
        r = Math.min(255, Math.round(r * f));
        g = Math.min(255, Math.round(g * f));
        b = Math.min(255, Math.round(b * f));
      }
      return r + ',' + g + ',' + b;
    } catch (e) { return null; } // tainted canvas / no 2d context → white default
  }
  // Resolve the current background into an Image we can sample (promise).
  function sampleCurrentBg() {
    return new Promise((resolve) => {
      let r;
      try { r = chrome.storage.local; } catch (e) { return resolve(null); }
      // .get() itself throws in a stale extension context — settle the
      // promise instead of rejecting it.
      try {
        r.get(CURRENT_BG_KEY, (res) => {
        const path = res && res[CURRENT_BG_KEY];
        if (!path) return resolve(null);
        let src;
        try { src = /^data:|^https?:/i.test(path) ? path : extUrl(path); } catch (e) { return resolve(null); }
        const withImg = (imgSrc) => {
          const img = new Image();
          img.onload = () => resolve(sampleAccent(img));
          img.onerror = () => resolve(null);
          img.src = imgSrc;
        };
        if (/^chrome-extension:/i.test(src)) {
          // Cross-origin from the page's point of view → fetch the bundled
          // file (web-accessible) and sample from a same-origin object URL.
          try {
            fetch(src).then((res2) => (res2 && res2.ok ? res2.blob() : null))
              .then((blob) => {
                if (!blob) return resolve(null);
                const obj = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => { URL.revokeObjectURL(obj); resolve(sampleAccent(img)); };
                img.onerror = () => { URL.revokeObjectURL(obj); resolve(null); };
                img.src = obj;
              }).catch(() => resolve(null));
          } catch (e) { resolve(null); }
          return;
        }
        withImg(src); // data: (safe) or http(s) custom (may taint → null)
        });
      } catch (e) { resolve(null); }
    });
  }
  function applyAccentStyle(color) {
    if (!color) return;
    try {
      document.body.style.setProperty('--ucp-accent', `rgb(${color})`);
      document.body.classList.add('ucp-bg-accent');
    } catch (e) {}
  }
  function clearAccent() {
    try { document.body.classList.remove('ucp-bg-accent'); } catch (e) {}
  }
  // Apply the cached tint immediately, then re-sample the CURRENT background
  // so the color stays in sync with whatever is on screen (and re-caches it).
  function applyAccentNow() {
    let r;
    try { r = chrome.storage.local; } catch (e) { return; }
    try {
      r.get([ACCENT_KEY, ACCENT_COLOR_KEY], (res) => {
        if (!res || !accentOn(res[ACCENT_KEY])) return;
        if (res[ACCENT_COLOR_KEY]) applyAccentStyle(res[ACCENT_COLOR_KEY]);
        sampleCurrentBg().then((color) => {
          if (!color) return; // keep the cached/default white
          if (color !== res[ACCENT_COLOR_KEY]) {
            try { chrome.storage.local.set({ [ACCENT_COLOR_KEY]: color }); } catch (e) {}
          }
          applyAccentStyle(color);
        });
      });
    } catch (e) { return; } // stale extension context
  }

  // =========================================================================
  // STORAGE & CACHE — usage meters + clear-cache + background-size cap
  // The extension's own chrome.storage is metered via getUsage() /
  // getBytesInUse() (a per-item breakdown is only possible HERE). The portal
  // (website) uses its OWN origin storage, metered via navigator.storage.
  // estimate() — a single approximate total (no images-vs-data split, and it
  // is NOT the extension's storage).
  // =========================================================================
  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return Math.round(n) + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }
  function paintBar(id, usage, quota) {
    const bar = byId(id);
    if (!bar) return;
    const pct = quota ? Math.min(100, (usage / quota) * 100) : 0;
    bar.style.setProperty('--pct', pct + '%');
  }
  // Real on-disk size of the background IMAGE. A preset stores only a short
  // path string in chrome.storage (the image itself is bundled in the
  // extension), so getBytesInUse on the key is ~bytes — meaningless as an
  // "image size". Instead: preset → fetch the bundled asset and read its byte
  // length; custom → decode the stored data URL (≈ the original file size).
  function bgImageSize(path) {
    return new Promise((resolve) => {
      if (!path) { resolve(0); return; }
      const p = String(path);
      if (/^data:/.test(p)) {
        const comma = p.indexOf(',');
        const b64 = comma >= 0 ? p.slice(comma + 1) : p;
        resolve(Math.max(0, Math.floor(b64.length * 0.75))); // base64 → ~3/4
        return;
      }
      let url;
      try { url = chrome.runtime.getURL(p.replace(/^\/+/, '')); } catch (e) { resolve(0); return; }
      try {
        fetch(url).then((r) => (r && r.ok ? r.blob() : Promise.reject('bad')))
          .then((b) => resolve(b ? b.size : 0))
          .catch(() => resolve(0));
      } catch (e) { resolve(0); }
    });
  }
  // Extension meters (its own chrome.storage.local).
  // Primary path: ask the background service worker for the numbers (getUsage
  // is guaranteed accurate there). Fallback: the content-script storage API —
  // whose getUsage() often reports 0, so the fallback re-derives the total by
  // summing getBytesInUse over the known keys. Last resort: "unavailable".
  const EXT_KNOWN_KEYS = [
    CURRENT_BG_KEY, ACCENT_KEY, ACCENT_COLOR_KEY, BLUR_KEY, 'ucp_blur_bg',
    'toggle_power', 'toggle_stay', 'ucp_night_mode', 'ucp_night_mode_deep',
    'ucp_enrollment_ui_new',
    'ucp_dashboard_items', BG_MAX_KEY, 'ucp_academic_calendar',
    // Notification-section caches + the course-code cache (see the
    // "Notification section" block below) — included so the fallback total
    // (getBytesInUse over the known keys) accounts for everything stored.
    'ucp_course_updates', 'ucp_course_snapshots_v1', 'ucp_course_codes',
    'ucp_notif_tabs',
    // Course-updates scan-bar prefs (type filter, Push + Instant Push, unread
    // state, sidebar unread count, last-used mode — see js/notification_page.js).
    'ucp_notif_course_filter', 'ucp_push_notify', 'ucp_instant_push', 'ucp_notif_seen',
    'ucp_notif_unread', 'ucp_notif_last_mode',
    // Course-card display config (code/section/credits + default button).
    'ucp_course_card_config',
    // External delivery targets (phone via ntfy, Discord Webhook).
    'ucp_ntfy_topic', 'ucp_discord_webhook',
    // Academic-calendar per-term expansion state.
    'ucp_acad_expanded_terms',
  ];
  function renderExtMeters() {
    // The extension's real chrome.storage.local quota is ~10 MB — a realistic
    // number. (With the unlimitedStorage permission, quotaBytes can balloon to
    // the disk size, which is meaningless for the display, so the bar/label
    // denominator is capped at a realistic 10 MB.)
    const EXT_QUOTA_CAP = 10 * 1024 * 1024; // 10 MB
    const setText = (id, s) => { const el = byId(id); if (el) el.textContent = s; };
    const done = (bytes, quota, storedBg) => {
      const q = (quota && quota > 0) ? Math.min(quota, EXT_QUOTA_CAP) : EXT_QUOTA_CAP;
      setText('ucp-shell-extTotal', fmtBytes(bytes) + ' of ' + fmtBytes(q));
      paintBar('ucp-shell-extBar', bytes, q);
      // "Settings & other" = total chrome.storage minus the bg key's footprint.
      setText('ucp-shell-extOther', fmtBytes(Math.max(0, bytes - (storedBg || 0))));
      // "Background image" = the REAL image file size (async: preset fetches
      // the bundled asset, custom decodes the data URL).
      setText('ucp-shell-extBg', '…');
      try {
        chrome.storage.local.get(CURRENT_BG_KEY, (r) => {
          const path = r && r[CURRENT_BG_KEY];
          bgImageSize(path).then((n) => setText('ucp-shell-extBg', path ? fmtBytes(n) : 'none'));
        });
      } catch (e) { setText('ucp-shell-extBg', fmtBytes(storedBg || 0)); }
    };
    const fail = () => setText('ucp-shell-extTotal', 'unavailable');
    const fallback = () => {
      try {
        if (typeof chrome.storage.local.getUsage !== 'function') { fail(); return; }
        chrome.storage.local.getUsage((d) => {
          d = d || {};
          let bytes = d.bytes || 0;
          const quota = d.quotaBytes || 10485760;
          const finish = (bg) => done(bytes, quota, bg || 0);
          // getUsage() commonly reports 0 in a content script — recover the
          // total by summing the known keys' bytes.
          const total = (cb) => {
            if (bytes > 0) return cb();
            try { chrome.storage.local.getBytesInUse(EXT_KNOWN_KEYS, (k) => { bytes = k || 0; cb(); }); }
            catch (e) { cb(); }
          };
          try { chrome.storage.local.getBytesInUse([CURRENT_BG_KEY], (bg) => total(() => finish(bg))); }
          catch (e) { total(() => finish(0)); }
        });
      } catch (e) { fail(); }
    };
    try {
      const alive = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
      if (alive) {
        let answered = false;
        chrome.runtime.sendMessage({ type: 'GET_STORAGE_USAGE' }, (resp) => {
          if (chrome.runtime.lastError) return; // let the timeout drive the fallback
          answered = true;
          if (resp && typeof resp.bytes === 'number') done(resp.bytes, resp.quotaBytes, resp.bgBytes);
          else fallback();
        });
        // Safety net: if the service worker never answers (stale/just-reloaded
        // context, SW asleep, etc.) the callback above may never fire — run the
        // direct content-script API after a short delay so the meter still
        // populates instead of staying on the "—" placeholder.
        setTimeout(() => { if (!answered) fallback(); }, 700);
        return;
      }
    } catch (e) { /* stale context — fall through */ }
    fallback();
  }
  // Portal (website) meter — its own origin storage. Approximate + async, so
  // a Refresh button re-queries on demand (and it runs on first render).
  // navigator.storage.estimate().quota reports the FULL origin quota (~10 GB),
  // which is meaningless for how much a portal page can actually use — so the
  // displayed denominator is capped at a realistic 500 MB (the bar + label are
  // both computed against that cap, not the raw quota).
  const PORTAL_DISPLAY_CAP = 500 * 1024 * 1024; // 500 MB
  function refreshPortalMeter() {
    const el = byId('ucp-shell-portalTotal');
    if (!el) return;
    try {
      if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
        el.textContent = 'unavailable'; return;
      }
      navigator.storage.estimate().then((est) => {
        const usage = (est && est.usage) || 0;
        const rawQuota = (est && est.quota) || 0;
        const shownQuota = rawQuota > 0 ? Math.min(rawQuota, PORTAL_DISPLAY_CAP) : PORTAL_DISPLAY_CAP;
        el.textContent = fmtBytes(usage) + ' of ' + fmtBytes(shownQuota);
        paintBar('ucp-shell-portalBar', usage, shownQuota);
      }).catch(() => { el.textContent = 'unavailable'; });
    } catch (e) { el.textContent = 'unavailable'; }
  }
  // Notification-section cache — shown as its OWN block (the user asked for it
  // separate from the general storage section). Only TWO things are persisted:
  // the academic-calendar model (the only cached tab) and the course-updates
  // list (+ the diffing snapshot). Portal News / Miscellaneous / UCP Feed are
  // re-fetched live and store nothing. Sizes come from getBytesInUse on the
  // exact keys (content-script storage API — works without the service worker).
  const NOTIF_ACADEMICS_KEYS = ['ucp_academic_calendar'];
  const NOTIF_COURSES_KEYS = ['ucp_course_updates', 'ucp_course_snapshots_v1'];
  function renderNotifCacheMeters() {
    const setText = (id, s) => { const el = byId(id); if (el) el.textContent = s; };
    const keysInUse = (keys, cb) => {
      try { chrome.storage.local.getBytesInUse(keys, cb); } catch (e) { cb(0); }
    };
    try {
      keysInUse(NOTIF_ACADEMICS_KEYS, (a) => {
        a = Number(a) || 0;
        setText('ucp-shell-notifAcad', fmtBytes(a));
        keysInUse(NOTIF_COURSES_KEYS, (c) => {
          c = Number(c) || 0;
          setText('ucp-shell-notifCourses', fmtBytes(c));
          setText('ucp-shell-notifTotal', fmtBytes(a + c));
        });
      });
    } catch (e) {
      setText('ucp-shell-notifAcad', '0 B');
      setText('ucp-shell-notifCourses', '0 B');
      setText('ucp-shell-notifTotal', '0 B');
    }
  }
  // Clears ONLY the notification section's stored data (the extension's own
  // chrome.storage.local — never the portal's own origin storage). The next
  // widget load re-fetches / re-scans everything from live.
  function clearNotifCache() {
    const status = byId('ucp-shell-storageStatus');
    const say = (t) => { if (status) status.textContent = t; };
    try {
      chrome.storage.local.remove(NOTIF_ACADEMICS_KEYS.concat(NOTIF_COURSES_KEYS), () => {
        say('Cleared the notification-section cache (academic calendar + course updates).');
        renderNotifCacheMeters(); // the block now reads 0 B
        renderExtMeters();         // and the extension total drops
        setTimeout(() => { if (status) status.textContent = ''; }, 6000);
      });
    } catch (e) { say('Could not clear the notification cache.'); }
  }
  function renderStorageMeters() {
    renderExtMeters();
    renderNotifCacheMeters();
    refreshPortalMeter();
  }
  // Background-size cap (segmented control): sync the UI + the module value.
  function syncBgMaxSize(v) {
    const val = (typeof v === 'number' && v > 0) ? v : 1400;
    bgMaxDim = val;
    const seg = byId('ucp-shell-bgMaxSize');
    if (!seg) return;
    seg.querySelectorAll('.ucp-shell-seg-opt').forEach((o) => {
      const on = parseInt(o.dataset.max, 10) === val;
      o.classList.toggle('is-on', on);
      o.setAttribute('aria-checked', String(on));
    });
  }
  // Clear the extension's own cache: drop the cached accent sample and, if a
  // CUSTOM (data:) background is stored, reset it to the default preset — the
  // data URL is by far the largest stored item, so this reclaims the space.
  // Confirms in the status line and re-renders the meters so the drop is
  // visible. (Does NOT touch the portal's own storage.)
  function clearExtCache() {
    const status = byId('ucp-shell-storageStatus');
    const say = (t) => { if (status) status.textContent = t; };
    try {
      chrome.storage.local.get(CURRENT_BG_KEY, (r) => {
        const bg = r && r[CURRENT_BG_KEY];
        const isCustom = !!bg && /^data:/i.test(bg);
        const keysToRemove = [
          ACCENT_COLOR_KEY,
          'ucp_academic_calendar',
          'ucp_course_updates',
          'ucp_course_snapshots_v1',
        ];
        chrome.storage.local.remove(keysToRemove, () => {
          if (isCustom) {
            chrome.storage.local.set({ [CURRENT_BG_KEY]: BG_PRESETS[0] }, () => {
              applyWallpaper(BG_PRESETS[0]);
              try { chrome.storage.local.get(ACCENT_KEY, (ar) => { if (ar && accentOn(ar[ACCENT_KEY])) applyAccentNow(); }); } catch (e) {}
              say('Cleared — custom background reset to the default preset.');
              renderStorageMeters();
              setTimeout(() => { if (status) status.textContent = ''; }, 6000);
            });
          } else {
            say('Cleared the extension cache (accent sample + academic calendar + course updates).');
            renderStorageMeters();
            setTimeout(() => { if (status) status.textContent = ''; }, 6000);
          }
        });
      });
    } catch (e) { say('Could not clear the cache.'); }
  }
  // "Open cache folder": a content script can't launch the OS file explorer or
  // open file:// URLs, so this copies the extension's on-disk data path to the
  // clipboard and shows it, ready to paste into File Explorer. storage.local is
  // a LevelDB under the Chrome profile's "Local Extension Settings" folder.
  function cacheFolderPath() {
    let id = 'unknown-extension-id';
    try { id = (chrome.runtime && chrome.runtime.id) || id; } catch (e) {}
    const ua = navigator.userAgent || '';
    if (/Windows/i.test(ua)) return '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Local Extension Settings\\' + id;
    if (/Macintosh|Mac OS X/i.test(ua)) return '~/Library/Application Support/Google/Chrome/Default/Local Extension Settings/' + id;
    return '~/.config/google-chrome/Default/Local Extension Settings/' + id;
  }
  function revealCacheFolder() {
    const status = byId('ucp-shell-storageStatus');
    const path = cacheFolderPath();
    const done = () => {
      if (!status) return;
      status.textContent = 'Path copied — paste into File Explorer: ' + path;
      setTimeout(() => { if (status) status.textContent = ''; }, 12000);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(path).then(done).catch(done);
      } else done();
    } catch (e) { done(); }
  }

  // =========================================================================
  // PAGE MARKUP (rendered into the shell's page root)
  // =========================================================================
  const pageHtml = `
    <div class="ucp-shell-page">
      <header class="ucp-shell-page-header">
        <h1 class="ucp-shell-page-title">Settings</h1>
      </header>

      <div class="ucp-shell-settings">
        <div class="ucp-shell-card ucp-shell-setting-row">
          <div class="ucp-shell-setting-info">
            <span class="material-icons">hourglass_empty</span>
            <div><div class="ucp-shell-setting-label">Stay Active</div><div class="ucp-shell-setting-desc">Don't auto-logout from the portal (on by default)</div></div>
          </div>
          <div class="ucp-shell-switch" id="ucp-shell-stayToggle" role="switch" aria-checked="true" tabindex="0"><div class="ucp-shell-switch-thumb"></div></div>
        </div>

        <div class="ucp-shell-card ucp-shell-setting-block">
          <!-- Header row: the title on the left, the upload control pushed to
               the right. The upload trigger carries NO role="button": the
               portal's aarsol bundle intercepts clicks on [role="button"]
               (its own custom-button markup — the console's "i fired" log)
               and swallows them before ANY listener sees the event. Our
               controls must never use that attribute. Keyboard still works:
               tabindex + Enter/Space (wireAction). -->
          <div class="ucp-shell-card-head">
            <div class="ucp-shell-setting-info">
              <span class="material-icons">palette</span>
              <div><div class="ucp-shell-setting-label">Theme &amp; Background</div><div class="ucp-shell-setting-desc">Theme switches, wallpaper presets and colour matching</div></div>
            </div>
            <div class="ucp-pending-actions" data-pending="bg blur"><div class="ucp-pending-btn ucp-pending-save" tabindex="0">Save changes</div><div class="ucp-pending-btn ucp-pending-discard" tabindex="0">Discard</div></div>
            <div class="ucp-shell-upload" id="ucp-shell-bgUploadBtn" tabindex="0">
              <span class="material-icons">upload</span> Upload
            </div>
          </div>
          <div class="ucp-shell-bg-grid" id="ucp-shell-bgGrid"></div>
          <input type="file" id="ucp-shell-bgUpload" accept="image/*" hidden>
          <div class="ucp-shell-bg-status" id="ucp-shell-bgStatus"></div>

          <!-- Background controls, merged into this card (below the gallery):
               a manual blur slider (replaces the old Blur Background toggle)
               and the accent-color toggle (ON by default). -->
          <div class="ucp-shell-bg-controls">
            <div class="ucp-shell-bg-blur">
              <div class="ucp-shell-bg-blur-head">
                <span class="ucp-shell-bg-ctl-label"><span class="material-icons">blur_on</span> Blur amount</span>
                <div class="ucp-pending-actions" data-pending="blur"><div class="ucp-pending-btn ucp-pending-save" tabindex="0">Save changes</div><div class="ucp-pending-btn ucp-pending-discard" tabindex="0">Discard</div></div>
                <span class="ucp-shell-bg-blur-value" id="ucp-shell-blurValue">0 px (off)</span>
              </div>
              <input type="range" id="ucp-shell-blurRange" min="0" max="10" step="1" value="0" aria-label="Background blur amount">
            </div>
            <div class="ucp-shell-bg-accent">
              <div class="ucp-shell-bg-accent-info">
                <span class="material-icons">colorize</span>
                <div><div class="ucp-shell-setting-label">Match colors to background</div><div class="ucp-shell-setting-desc">Tint the icons, buttons and sidebar with the background's accent color (on by default)</div></div>
              </div>
              <div class="ucp-shell-switch" id="ucp-shell-accentToggle" role="switch" aria-checked="true" tabindex="0"><div class="ucp-shell-switch-thumb"></div></div>
            </div>
            <!-- Theme toggles (merged in from the old standalone Dark Mode /
                 Night Mode cards). Single toggles apply INSTANTLY — no
                 Save/Discard (see instantSwitch below). -->
            <div class="ucp-shell-theme-row">
              <div class="ucp-shell-theme-row-info">
                <span class="material-icons">dark_mode</span>
                <div><div class="ucp-shell-setting-label">Dark Mode</div><div class="ucp-shell-setting-desc">Dark theme for the whole portal — dims the wallpaper and darkens every surface (on by default)</div></div>
              </div>
              <div class="ucp-shell-switch" id="ucp-shell-nightToggle" role="switch" aria-checked="true" tabindex="0"><div class="ucp-shell-switch-thumb"></div></div>
            </div>
            <div class="ucp-shell-theme-row">
              <div class="ucp-shell-theme-row-info">
                <span class="material-icons">bedtime</span>
                <div><div class="ucp-shell-setting-label">Night Mode</div><div class="ucp-shell-setting-desc">Separate from Dark Mode — removes the background wallpaper entirely and turns the portal near-black (off by default)</div></div>
              </div>
              <div class="ucp-shell-switch" id="ucp-shell-nightDeepToggle" role="switch" aria-checked="false" tabindex="0"><div class="ucp-shell-switch-thumb"></div></div>
            </div>
          </div>
        </div>

        <!-- Notifications block (separated from dashboard items).
             The card head carries the master on/off toggle (instant — off
             greys out #ucp-shell-notifBody below). The segmented control
             picks the BEHAVIOUR while on: Push Notification | Background
             Notification (the old 'Off' behaviour is gone — the master
             toggle IS the off switch). Subtitle explains: "'Push
             Notification' will only work if the browser is open"; the
             background mode needs this computer to stay ON. -->
        <div class="ucp-shell-card ucp-shell-setting-block ucp-shell-push-block" id="ucp-shell-notifSettingsBlock">
          <div class="ucp-shell-card-head">
            <div class="ucp-shell-setting-info">
              <span class="material-icons">notifications</span>
              <div>
                <div class="ucp-shell-setting-label">Notifications</div>
                <div class="ucp-shell-setting-desc">Background course-updates checks &amp; browser notifications</div>
              </div>
            </div>
            <div class="ucp-pending-actions" data-pending="notifMode"><div class="ucp-pending-btn ucp-pending-save" tabindex="0">Save changes</div><div class="ucp-pending-btn ucp-pending-discard" tabindex="0">Discard</div></div>
            <div class="ucp-shell-switch" id="ucp-shell-notifToggle" role="switch" aria-checked="true" tabindex="0" title="Notifications on/off"><div class="ucp-shell-switch-thumb"></div></div>
          </div>

          <!-- Everything below the head is the notification BODY: when the
               master toggle above is off, this whole block is dimmed and
               inert (.ucp-shell-notif-off on the card, see CSS). -->
          <div id="ucp-shell-notifBody">
          <div class="ucp-shell-storage-opt ucp-shell-notif-behavior-opt" style="padding: 10px 0;">
            <div>
              <div class="ucp-shell-setting-label">Notification behaviour</div>
              <div class="ucp-shell-setting-desc" id="ucp-shell-notifBehaviorSub">Background notification — checks course updates in the background and pushes them to your phone; your computer still needs to be ON for this to work.</div>
            </div>
            <div class="ucp-shell-seg" id="ucp-shell-notifBehaviorSeg" role="radiogroup">
              <div class="ucp-shell-seg-opt" data-notif-mode="push" role="radio" aria-checked="false" tabindex="0">Push Notification</div>
              <div class="ucp-shell-seg-opt is-on" data-notif-mode="instant" role="radio" aria-checked="true" tabindex="0">Background Notification</div>
            </div>
          </div>

          <!-- Other devices (phones) — ntfy pairing. The private topic below
               is what the phone subscribes to (QR / link); the service worker
               POSTs new course updates to it from both scan paths (see
               background/script.js — pushExternalChannels). The phone only
               receives pushes while THIS computer — and the extension — is
               running. Add = create topic + test push; Rotate = new topic
               (old phones must re-scan); Remove = unpair. -->
          <div class="ucp-shell-devices-row">
            <span class="material-icons">qr_code_scanner</span>
            <div class="ucp-shell-devices-main">
              <div class="ucp-shell-setting-label">Add other devices for push notification</div>
              <div class="ucp-shell-setting-desc">Phones such as Android, iOS — via ntfy (this computer must stay on)</div>
            </div>
            <div class="ucp-shell-devices-actions">
              <div class="ucp-shell-devices-btn" id="ucp-shell-devicesAdd" tabindex="0">Add device</div>
              <div class="ucp-shell-devices-btn" id="ucp-shell-devicesRotate" tabindex="0" hidden>Use a new code</div>
              <div class="ucp-shell-devices-btn" id="ucp-shell-devicesTest" tabindex="0" hidden>Send test</div>
              <div class="ucp-shell-devices-btn ucp-shell-devices-btn-remove" id="ucp-shell-devicesRemove" tabindex="0" hidden>Remove</div>
            </div>
          </div>
          <div class="ucp-shell-devices-panel" id="ucp-shell-devicesPanel" hidden>
            <img class="ucp-shell-devices-qr" id="ucp-shell-devicesQr" alt="ntfy QR code" width="160" height="160" />
            <div class="ucp-shell-devices-panel-col">
              <div class="ucp-shell-devices-url" id="ucp-shell-devicesUrl"></div>
              <div class="ucp-shell-devices-hint">
                1. Install the free <b>ntfy</b> app on your phone (Play Store / App Store).<br>
                2. In ntfy: <b>Add topic</b> → <b>Scan QR</b> — or open the link above.<br>
                3. Done — new course updates push to your phone whenever a check finds them.<br>
                <span class="ucp-shell-devices-hint-dim">If the QR doesn't load, use the link. The phone only gets pushes while this computer is on.</span>
              </div>
            </div>
          </div>

          <!-- Discord Webhook (Advanced) — optional. POSTs the same
               notifications to a Discord channel as "UCP Smart Portal"
               (background/script.js — pushExternalChannels). Empty =
               disabled; saved via the pending Save/Discard pair. -->
          <div class="ucp-shell-setting-row ucp-shell-discord-row">
            <div class="ucp-shell-setting-info">
              <span class="material-icons">link</span>
              <div>
                <div class="ucp-shell-setting-label">Discord Webhook (Advanced)</div>
                <div class="ucp-shell-setting-desc">Also deliver notifications to a Discord channel as "UCP Smart Portal" (optional)</div>
              </div>
            </div>
            <div class="ucp-shell-discord-ctl">
              <input class="ucp-shell-discord-input" id="ucp-shell-discordInput" type="url" placeholder="https://discord.com/api/webhooks/…" spellcheck="false" autocomplete="off" />
              <div class="ucp-shell-devices-btn" id="ucp-shell-discordTest" tabindex="0">Send test</div>
            </div>
            <div class="ucp-pending-actions" data-pending="discord"><div class="ucp-pending-btn ucp-pending-save" tabindex="0">Save changes</div><div class="ucp-pending-btn ucp-pending-discard" tabindex="0">Discard</div></div>
          </div>
          </div><!-- /ucp-shell-notifBody -->
          <div class="ucp-shell-dash-status" id="ucp-shell-notifStatus"></div>
        </div>

        <div class="ucp-shell-card ucp-shell-setting-block">
          <div class="ucp-shell-card-head">
            <div class="ucp-shell-setting-info">
              <span class="material-icons">dashboard_customize</span>
              <div>
                <div class="ucp-shell-setting-label">Dashboard items</div>
                <div class="ucp-shell-setting-desc">Choose which cards and card details appear on the dashboard</div>
              </div>
            </div>
            <div class="ucp-pending-actions" data-pending="dash notif courseCard"><div class="ucp-pending-btn ucp-pending-save" tabindex="0">Save changes</div><div class="ucp-pending-btn ucp-pending-discard" tabindex="0">Discard</div></div>
            <div class="ucp-dash-items-reset" id="ucp-shell-dashReset" tabindex="0">
              <span class="material-icons">restart_alt</span> Reset to default
            </div>
          </div>

          <div class="ucp-dash-items">
            <div class="ucp-dash-items-group">
              <div class="ucp-dash-items-group-title">Academics · Widgets</div>
              <div class="ucp-dash-items-grid">
                <div class="ucp-dash-item" data-dash-item="cgpa" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>CGPA</span></div>
                <div class="ucp-dash-item" data-dash-item="earned" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>Credits Info</span></div>
                <div class="ucp-dash-item" data-dash-item="termProgress" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>Term Progress</span></div>
                <div class="ucp-dash-item" data-dash-item="nextClass" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>Next Class</span></div>
                <div class="ucp-dash-item" data-dash-item="attendanceGlance" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>Attendance Glance</span></div>
                <div class="ucp-dash-item" data-dash-item="invoices" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>Invoices</span></div>
              </div>
            </div>

            <div class="ucp-dash-items-group">
              <div class="ucp-dash-items-group-title">Academics · cards</div>
              <div class="ucp-dash-items-grid">
                <div class="ucp-dash-item" data-dash-item="studentCard" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>UCP Student Card</span></div>
                <div class="ucp-dash-item" data-dash-item="attendance" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>Attendance</span></div>
                <div class="ucp-dash-item" data-dash-item="classesToday" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>Classes Today</span></div>
              </div>
            </div>

            <div class="ucp-dash-items-group">
              <div class="ucp-dash-items-group-title">Courses · Widgets</div>
              <div class="ucp-dash-items-grid">
                <div class="ucp-dash-item" data-dash-item="courseSubmissions" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>Submissions Left</span></div>
                <div class="ucp-dash-item" data-dash-item="courseAssessments" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>Next Assessment</span></div>
                <div class="ucp-dash-item" data-dash-item="courseGrades" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>Make-Up Class</span></div>
              </div>
            </div>

            <!-- Courses · Card Details: controls course code, section, credit hours and default action button -->
            <div class="ucp-dash-items-group">
              <div class="ucp-dash-items-group-title">Courses · Card Details</div>
              <div class="ucp-dash-items-grid">
                <div class="ucp-dash-item is-on" data-course-card-item="code" role="checkbox" aria-checked="true" tabindex="0"><span class="ucp-dash-item-box"></span><span>Course Code</span></div>
                <div class="ucp-dash-item is-on" data-course-card-item="section" role="checkbox" aria-checked="true" tabindex="0"><span class="ucp-dash-item-box"></span><span>Section</span></div>
                <div class="ucp-dash-item is-on" data-course-card-item="credits" role="checkbox" aria-checked="true" tabindex="0"><span class="ucp-dash-item-box"></span><span>Credit Hours</span></div>
              </div>
              <div class="ucp-notif-default-row" style="margin-top: 12px;">
                <span class="ucp-notif-default-label">Default Card Button</span>
                <div class="ucp-shell-seg ucp-notif-default-seg" id="ucp-shell-courseBtnDefault" role="radiogroup">
                  <div class="ucp-shell-seg-opt is-on" data-course-btn="gradebook" role="radio" aria-checked="true" tabindex="0">Open Gradebook</div>
                  <div class="ucp-shell-seg-opt" data-course-btn="announcements" role="radio" aria-checked="false" tabindex="0">Open Announcement</div>
                  <div class="ucp-shell-seg-opt" data-course-btn="material" role="radio" aria-checked="false" tabindex="0">Open Course Material</div>
                  <div class="ucp-shell-seg-opt" data-course-btn="assessments" role="radio" aria-checked="false" tabindex="0">Open Assessments</div>
                  <div class="ucp-shell-seg-opt" data-course-btn="outline" role="radio" aria-checked="false" tabindex="0">Open Outline</div>
                </div>
              </div>
            </div>

            <!-- Notification widget (the dashboard / Notification & Updates page)
                 tab visibility + the default tab. data-notif-tab = the tab's
                 ORIGINAL index (0-4) — the notification widget hides a tab by
                 that index; missing state = all five enabled, default = 0. -->
            <div class="ucp-dash-items-group">
              <div class="ucp-dash-items-group-title">Notification widget · tabs</div>
              <div class="ucp-dash-items-grid">
                <div class="ucp-dash-item" data-notif-tab="0" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>Academic Calendar</span></div>
                <div class="ucp-dash-item" data-notif-tab="1" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>Portal News</span></div>
                <div class="ucp-dash-item" data-notif-tab="2" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>Course Updates</span></div>
                <div class="ucp-dash-item" data-notif-tab="3" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>Miscellaneous</span></div>
                <div class="ucp-dash-item" data-notif-tab="4" role="checkbox" aria-checked="false" tabindex="0"><span class="ucp-dash-item-box"></span><span>UCP Feed</span></div>
              </div>
              <div class="ucp-notif-default-row">
                <span class="ucp-notif-default-label">Notification &amp; Update Default Tab</span>
                <div class="ucp-shell-seg ucp-notif-default-seg" id="ucp-shell-notifDefault" role="radiogroup">
                  <div class="ucp-shell-seg-opt" data-notif-default="0" role="radio" aria-checked="false" tabindex="0">Calendar</div>
                  <div class="ucp-shell-seg-opt" data-notif-default="1" role="radio" aria-checked="false" tabindex="0">News</div>
                  <div class="ucp-shell-seg-opt" data-notif-default="2" role="radio" aria-checked="false" tabindex="0">Courses</div>
                  <div class="ucp-shell-seg-opt" data-notif-default="3" role="radio" aria-checked="false" tabindex="0">Misc</div>
                  <div class="ucp-shell-seg-opt" data-notif-default="4" role="radio" aria-checked="false" tabindex="0">Feed</div>
                </div>
              </div>
            </div>
          </div>
          <div class="ucp-shell-dash-status" id="ucp-shell-dashStatus"></div>
        </div>

        <div class="ucp-shell-card ucp-shell-setting-row">
          <div class="ucp-shell-setting-info">
            <span class="material-icons">school</span>
            <div><div class="ucp-shell-setting-label">New Enrollment UI</div><div class="ucp-shell-setting-desc">Cards page: new enrollment UI (off = old portal cards, the default)</div></div>
          </div>
          <div class="ucp-pending-actions" data-pending="enroll"><div class="ucp-pending-btn ucp-pending-save" tabindex="0">Save changes</div><div class="ucp-pending-btn ucp-pending-discard" tabindex="0">Discard</div></div>
          <div class="ucp-shell-switch" id="ucp-shell-enrollToggle" role="switch" aria-checked="false" tabindex="0"><div class="ucp-shell-switch-thumb"></div></div>
        </div>

        <div class="ucp-shell-card ucp-shell-setting-block ucp-shell-storage">
          <!-- Header row: title left, the Clear-extension-cache control pushed
               right (same placement as the Background upload + Dashboard reset). -->
          <div class="ucp-shell-card-head">
            <div class="ucp-shell-setting-info">
              <span class="material-icons">storage</span>
              <div><div class="ucp-shell-setting-label">Storage &amp; Cache</div><div class="ucp-shell-setting-desc">What the extension and the portal store</div></div>
            </div>
            <div class="ucp-shell-clear-btn" id="ucp-shell-clearCache" tabindex="0" title="Frees the cached accent sample + the notification-section cache (academic calendar + course updates), and, if you uploaded a custom background, resets it to the default preset.">
              <span class="material-icons">delete_sweep</span> Clear extension cache
            </div>
          </div>

          <div class="ucp-shell-storage-block">
            <div class="ucp-shell-storage-subhead">
              <span class="material-icons">extension</span> Extension
              <div class="ucp-shell-refresh" id="ucp-shell-extRefresh" tabindex="0" title="Re-query the extension's storage usage">
                <span class="material-icons">refresh</span> Refresh
              </div>
            </div>
            <div class="ucp-shell-meter">
              <div class="ucp-shell-meter-track"><div class="ucp-shell-meter-fill" id="ucp-shell-extBar"></div></div>
              <div class="ucp-shell-meter-row"><span>Background image</span><b id="ucp-shell-extBg">—</b></div>
              <div class="ucp-shell-meter-row"><span>Settings &amp; other</span><b id="ucp-shell-extOther">—</b></div>
              <div class="ucp-shell-meter-row ucp-shell-meter-total"><span>Total</span><b id="ucp-shell-extTotal">—</b></div>
            </div>
            <div class="ucp-shell-storage-note">"Background image" is the actual image file size. Preset backgrounds are bundled inside the extension (not counted in the Total); a custom upload IS stored and grows the Total.</div>
            <div class="ucp-shell-storage-note">"Clear extension cache" drops the cached accent sample + the whole notification-section cache (academic calendar, course updates), so the next load re-fetches them live.</div>
            <div class="ucp-shell-open-folder" id="ucp-shell-openCacheFolder" tabindex="0" title="Copies the folder path where the extension stores its data — paste it into File Explorer">
              <span class="material-icons">folder_open</span> Open cache folder
            </div>
          </div>

          <!-- The notification section's OWN cache, shown separately (the user
               asked for it apart from the general storage block). Only the
               academic calendar + the course-updates list are persisted; the
               other tabs (Portal News / Miscellaneous / UCP Feed) re-fetch
               live and store nothing. -->
          <div class="ucp-shell-storage-block">
            <div class="ucp-shell-storage-subhead">
              <span class="material-icons">notifications</span> Notification section
              <div class="ucp-shell-refresh" id="ucp-shell-notifCacheClear" tabindex="0" title="Clears the academic-calendar cache + the stored course updates (the notification section's only stored data).">
                <span class="material-icons">delete_sweep</span> Clear
              </div>
            </div>
            <div class="ucp-shell-meter">
              <div class="ucp-shell-meter-row"><span>Academic calendar cache</span><b id="ucp-shell-notifAcad">—</b></div>
              <div class="ucp-shell-meter-row"><span>Course updates (incl. scan snapshot)</span><b id="ucp-shell-notifCourses">—</b></div>
              <div class="ucp-shell-meter-row ucp-shell-meter-total"><span>Total</span><b id="ucp-shell-notifTotal">—</b></div>
            </div>
            <div class="ucp-shell-storage-note">Only the two tabs above store anything — Portal News, Miscellaneous and UCP Feed re-fetch on every open and keep no cache. Clearing this block never touches the portal's own storage.</div>
          </div>

          <div class="ucp-shell-storage-block">
            <div class="ucp-shell-storage-subhead">
              <span class="material-icons">language</span> Portal (website)
              <div class="ucp-shell-refresh" id="ucp-shell-portalRefresh" tabindex="0"><span class="material-icons">refresh</span> Refresh</div>
            </div>
            <div class="ucp-shell-meter">
              <div class="ucp-shell-meter-track"><div class="ucp-shell-meter-fill" id="ucp-shell-portalBar"></div></div>
              <div class="ucp-shell-meter-row ucp-shell-meter-total"><b id="ucp-shell-portalTotal">—</b></div>
            </div>
            <div class="ucp-shell-storage-note">The portal's figure is the website's own origin storage (images, data, cached files) — separate from the extension and only an approximation.</div>
          </div>

          <div class="ucp-shell-storage-block">
            <div class="ucp-shell-storage-opt">
              <div><div class="ucp-shell-setting-label">Background image size</div><div class="ucp-shell-setting-desc">Max width/height an uploaded background is stored at</div></div>
              <div class="ucp-pending-actions" data-pending="bgSize"><div class="ucp-pending-btn ucp-pending-save" tabindex="0">Save changes</div><div class="ucp-pending-btn ucp-pending-discard" tabindex="0">Discard</div></div>
              <div class="ucp-shell-seg" id="ucp-shell-bgMaxSize" role="radiogroup">
                <div class="ucp-shell-seg-opt" data-max="1000" role="radio" aria-checked="false" tabindex="0">Small</div>
                <div class="ucp-shell-seg-opt" data-max="1400" role="radio" aria-checked="true" tabindex="0">Medium</div>
                <div class="ucp-shell-seg-opt" data-max="1600" role="radio" aria-checked="false" tabindex="0">Large</div>
              </div>
            </div>
          </div>

          <div class="ucp-shell-storage-note">"Clear extension cache" frees the cached accent sample + the notification-section cache (academic calendar + course updates) and, if you uploaded a custom background, resets it to the default preset.</div>
          <div class="ucp-shell-storage-status" id="ucp-shell-storageStatus"></div>
        </div>

        <div class="ucp-shell-credits-card" id="ucp-shell-credits">
          <a class="ucp-shell-credits-title ucp-shell-credits-link" href="https://github.com/bakrx12/UCP-Smart-Portal" target="_blank" rel="noopener">UCP Smart Portal</a>
          <div class="ucp-shell-credits-names" id="ucp-shell-creditsNames"></div>
        </div>
      </div>
    </div>`;

  // =========================================================================
  // PENDING CHANGES — "Save changes" / "Discard" per setting
  // A UI change applies LIVE (a preview of the new look) but is NOT written
  // to storage until the setting's "Save changes" is pressed. "Discard"
  // reverts that setting to its stored value. `pending` holds one entry per
  // dirty setting id:
  //   previous — the stored value when the row first became dirty (frozen;
  //              cross-tab onChanged re-bases it without touching the UI)
  //   save()   — persist the CURRENT (UI/preview) value
  //   discard()— restore `previous` in the UI + its live effect
  // Every render() starts clean (the page DOM is rebuilt, old pending state
  // would point at dead nodes).
  // =========================================================================
  const pending = new Map();
  const pendingRows = []; // { pIds: "a b", rowEl, actionsEl }
  function anyPending(pIds) {
    return String(pIds).split(/\s+/).some((id) => pending.has(id));
  }
  function registerPendingRow(pIds, rowEl, actionsEl) {
    pendingRows.push({ pIds, rowEl, actionsEl });
    const on = anyPending(pIds);
    if (rowEl) rowEl.classList.toggle('is-dirty', on);
    if (actionsEl) actionsEl.classList.toggle('ucp-pending-show', on);
  }
  function refreshPendingUi() {
    pendingRows.forEach(({ pIds, rowEl, actionsEl }) => {
      const on = anyPending(pIds);
      if (rowEl) rowEl.classList.toggle('is-dirty', on);
      if (actionsEl) actionsEl.classList.toggle('ucp-pending-show', on);
    });
  }
  function markDirty(pId, entry) {
    const ex = pending.get(pId);
    if (ex) {
      // Row already dirty: keep the ORIGINAL stored baseline, refresh the
      // current-value handlers (each change re-snapshots the UI state).
      ex.save = entry.save;
      ex.discard = entry.discard;
    } else {
      pending.set(pId, { previous: entry.previous, save: entry.save, discard: entry.discard });
    }
    refreshPendingUi();
  }
  function clearDirty(pId) {
    if (pending.delete(pId)) refreshPendingUi();
  }
  function saveDirty(pIds) {
    String(pIds).split(/\s+/).forEach((id) => {
      const e = pending.get(id);
      if (!e) return;
      try { e.save(); } catch (err) { console.warn('UCP settings save', err); }
      clearDirty(id);
    });
  }
  function discardDirty(pIds) {
    String(pIds).split(/\s+/).forEach((id) => {
      const e = pending.get(id);
      if (!e) return;
      try { e.discard(); } catch (err) { console.warn('UCP settings discard', err); }
      clearDirty(id);
    });
  }

  // =========================================================================
  // CREDITS — the card's title links to the extension's repo. The four
  // credited developers are shown as plain text; the only personal social
  // found in the extension's own code is the repo owner's GitHub.
  // =========================================================================
  const CREDITS_SOCIALS = {
    'Abdurrehman': null,
    'Talha Abid': null,
    'Abdullah Zafar': null,
    'AbuBakr Aslam': 'https://github.com/bakrx12', // the UCP-Smart-Portal repo owner
  };
  function renderCredits() {
    const box = byId('ucp-shell-creditsNames');
    if (!box) return;
    box.innerHTML = Object.entries(CREDITS_SOCIALS).map(([name, url]) => (url
      ? `<a class="ucp-credits-name" href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>`
      : `<span class="ucp-credits-name">${esc(name)}</span>`
    )).join('');
  }

  // =========================================================================
  // wireAction(el, action) — ROBUST ACTIVATION for every settings control
  // (module scope so renderBgGrid's tiles can use it too). The portal's own
  // scripts register a window-level click interceptor that swallows pointer
  // events on some of the controls BEFORE later-registered listeners see
  // them, so a control is only alive if its action is reachable without a
  // normal event path. Three delivery layers, in order of preference:
  //   * the in-file CLICK GUARD at the top of this file (document_start) — a
  //     window-capture backstop registered BEFORE the portal's interceptor
  //     even exists, so it runs first on a click of any __ucpAction control
  //     and the portal never sees the event. THE primary path for mouse/touch.
  //   * element-level pointerdown / capture-click / keydown listeners —
  //     fires when the event does reach the control (switches' clicks pass
  //     the portal's interceptor); keydown(Enter/Space) is the keyboard
  //     path and is never intercepted.
  //   * window- + document-level CAPTURE backstops (bottom of this file) —
  //     a second net; registered after the portal's handlers, so they win
  //     only when an event slips past the portal's interceptor.
  // run() is double-fire guarded (400 ms): one press can fire several of
  // these paths at once, and only the FIRST may execute.
  // =========================================================================
  const BUILD_TAG = '2026-09-08.7';
  let wiredControls = 0;
  // True when the press started INSIDE a native interactive descendant of el
  // (a real <a>/<button>/<input>/<select>/<textarea> or a contenteditable):
  // those own their native behaviour (link navigation, the file picker via
  // input.click(), clipboard gestures) and must never be hijacked by the
  // row/card's shared action.
  const pressHitsInteractive = (e, el) => {
    let t = e.target;
    while (t && t !== el && t.nodeType === 1) {
      const tag = t.tagName;
      if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t.isContentEditable) return true;
      t = t.parentElement;
    }
    return false;
  };
  function wireAction(el, action) {
    if (!el) return;
    let lastRun = 0;
    const run = () => {
      const now = Date.now();
      if (now - lastRun < 400) return;
      lastRun = now;
      try { action(); } catch (err) { console.warn('UCP settings control', err); }
    };
    el.__ucpAction = run;
    wiredControls++;
    // pressHitsInteractive: a press that begins on a native control inside an
    // armed row/card (e.g. the Discord input inside the Notifications card)
    // is left to that control's own handlers — no hijack, no double-fire.
    el.addEventListener('pointerdown', (e) => {
      if (pressHitsInteractive(e, el)) return;
      e.stopPropagation();
      run();
    });
    el.addEventListener('click', (e) => {
      if (pressHitsInteractive(e, el)) return;
      e.stopPropagation();
      run();
    }, true);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); } });
  }

  // =========================================================================
  // render(container) — called by shell.js (and on a direct load of
  // /student/settings). Rebuilds the page fresh every time (the shell
  // already cleared the container).
  // =========================================================================
  function render(container) {
    ensureMaterialIcons();
    ensurePageCss();
    container.innerHTML = pageHtml;
    // Fresh page → fresh pending state (old entries would target dead nodes).
    pending.clear();
    pendingRows.length = 0;
    wiredControls = 0;
    renderCredits();

    // =========================================================================
    // INSTANT TOGGLES — single switches (Stay Active, Dark Mode, Night Mode,
    // accent, new enrollment UI, Notification master) apply IMMEDIATELY: the
    // paint IS the final state and storage is written in the same gesture —
    // no Save/Discard (those remain for multi-step blocks: wallpaper/blur,
    // notification behaviour, dashboard items, the webhook field). All
    // controls go through __ucpAction (wireAction) so the in-file click
    // guard (document_start) and the window/document-capture backstops can
    // reach them. Clicking anywhere on the toggle's ROW runs it too (the row
    // shares the switch's __ucpAction = one shared 400 ms guard).
    // =========================================================================
    const nightUi = () => {
      const d = byId('ucp-shell-nightToggle');
      const p = byId('ucp-shell-nightDeepToggle');
      return { dark: !!(d && d.classList.contains('on')), deep: !!(p && p.classList.contains('on')) };
    };
    // Dark Mode (ucp-night) applies when EITHER mode is on; Night Mode
    // (deep) additionally drops the wallpaper (ucp-night-deep).
    const nightPreview = () => {
      const u = nightUi();
      document.body.classList.toggle('ucp-night', !!(u.dark || u.deep));
      document.body.classList.toggle('ucp-night-deep', !!u.deep);
    };
    // (read-side defaults — which way a never-set switch paints — live in
    // initPrefs; the write is always an explicit boolean.)
    const instantSwitch = (elId, storageKey, preview, rowSelector) => {
      const el = byId(elId);
      if (!el) return;
      const uiOn = () => el.classList.contains('on');
      const action = () => {
        const next = !uiOn();
        syncSwitch(elId, next); // instant: the paint is the final state
        if (preview) { try { preview(next); } catch (e) {} }
        try { chrome.storage.local.set({ [storageKey]: next }); } catch (e) {}
      };
      wireAction(el, action);
      // Whole-row toggle: the row runs the same action (one shared
      // __ucpAction = one shared 400 ms guard, so a press on the switch and
      // the backstop can never double-fire). The accent switch lives INSIDE
      // the big Theme & Background card — its row is the accent sub-block,
      // NOT the card (the card holds the bg picker / blur slider, whose own
      // handlers must keep working); the theme rows are their own blocks.
      const row = rowSelector ? el.closest(rowSelector) : el.closest('.ucp-shell-card');
      if (row) row.__ucpAction = el.__ucpAction;
    };
    instantSwitch('ucp-shell-stayToggle', 'toggle_stay', null, '.ucp-shell-card');
    instantSwitch('ucp-shell-nightToggle', 'ucp_night_mode', nightPreview, '.ucp-shell-theme-row');
    instantSwitch('ucp-shell-nightDeepToggle', 'ucp_night_mode_deep', nightPreview, '.ucp-shell-theme-row');
    instantSwitch('ucp-shell-accentToggle', ACCENT_KEY, (v) => { if (v) applyAccentNow(); else clearAccent(); }, '.ucp-shell-bg-accent');
    instantSwitch('ucp-shell-enrollToggle', 'ucp_enrollment_ui_new', null, '.ucp-shell-card');
    // Notification master toggle (card head): instant, and OFF also greys out
    // the whole card body (the SW gates both notification alarms on the key).
    const notifToggle = byId('ucp-shell-notifToggle');
    if (notifToggle) {
      wireAction(notifToggle, () => {
        const next = !notifToggle.classList.contains('on');
        setNotifEnabledUi(next);
        try { chrome.storage.local.set({ ucp_notif_enabled: next }); } catch (e) {}
      });
    }
    // Notification Behaviour (Push | Background) — segmented control.
    // ('Off' is no longer a behaviour: the master toggle at the card head.)
    const notifSegOpts = Array.from(container.querySelectorAll('#ucp-shell-notifBehaviorSeg .ucp-shell-seg-opt'));
    const notifStatusEl = byId('ucp-shell-notifStatus');
    const getStoredNotifMode = (cb) => {
      try {
        chrome.storage.local.get(['ucp_push_notify', 'ucp_instant_push'], (r) => {
          // First-run default is 'instant' — the raw-coercion would read a
          // never-set pair as 'off' (see notifModeFromKeys).
          cb(notifModeFromKeys(r));
        });
      } catch (e) { cb('instant'); }
    };

    notifSegOpts.forEach((opt) => {
      const mode = opt.dataset.notifMode;
      const pick = async () => {
        let perm = 'granted';
        if (mode !== 'off') {
          if (typeof Notification === 'undefined') perm = 'unsupported';
          else {
            perm = Notification.permission;
            if (perm === 'default') {
              try { perm = await Notification.requestPermission(); } catch (e) { perm = Notification.permission; }
            }
          }
        }
        getStoredNotifMode((storedMode) => {
          if (mode !== 'off' && perm !== 'granted') {
            syncNotifBehaviorUi(storedMode === 'push' || storedMode === 'instant', storedMode === 'instant');
            clearDirty('notifMode');
            if (notifStatusEl) {
              notifStatusEl.textContent = perm === 'unsupported'
                ? 'Notifications are not supported in this browser.'
                : perm === 'denied'
                  ? 'Notifications are blocked for this site in your browser settings. Please allow them to enable push.'
                  : 'Notifications permission was not granted.';
              setTimeout(() => { notifStatusEl.textContent = ''; }, 6000);
            }
            return;
          }

          syncNotifBehaviorUi(mode === 'push' || mode === 'instant', mode === 'instant');
          if (mode === storedMode) {
            clearDirty('notifMode');
            return;
          }

          markDirty('notifMode', {
            previous: storedMode,
            save: () => {
              try {
                const next = {
                  ucp_push_notify: mode === 'push' || mode === 'instant',
                  ucp_instant_push: mode === 'instant'
                };
                if (mode !== 'off') next[NOTIF_LAST_MODE_KEY] = mode; // the scan-bar quick toggle re-enables this
                chrome.storage.local.set(next);
              } catch (e) {}
            },
            discard: () => {
              syncNotifBehaviorUi(storedMode === 'push' || storedMode === 'instant', storedMode === 'instant');
            }
          });
        });
      };
      wireAction(opt, pick);
    });

    // =========================================================================
    // ntfy (phones) + Discord Webhook — Notifications card.
    // ntfy: Add = create a private topic + fire the welcome/test push;
    // Rotate = brand-new topic (old phones must re-scan); Remove = unpair.
    // The SW owns the fetch (background/script.js — pushExternalChannels /
    // UCP_NTFY_TEST). Discord: the input is pending on change (Save writes
    // ucp_discord_webhook); Send test POSTs the SAVED url.
    // =========================================================================
    const ntfyAdd = byId('ucp-shell-devicesAdd');
    const ntfyRotate = byId('ucp-shell-devicesRotate');
    const ntfyRemove = byId('ucp-shell-devicesRemove');
    const applyNtfy = (topic) => {
      renderNtfyUi(topic);
      ntfySendTest(); // the phone should get a "linked" push right away
    };
    if (ntfyAdd) wireAction(ntfyAdd, () => {
      const t = newNtfyTopic();
      try { chrome.storage.local.set({ [NTFY_KEY]: t }); } catch (e) {}
      applyNtfy(t);
    });
    if (ntfyRotate) wireAction(ntfyRotate, () => {
      const t = newNtfyTopic();
      try { chrome.storage.local.set({ [NTFY_KEY]: t }); } catch (e) {}
      applyNtfy(t);
    });
    if (ntfyRemove) wireAction(ntfyRemove, () => {
      try { chrome.storage.local.remove(NTFY_KEY); } catch (e) {}
      renderNtfyUi(null);
    });
    // ntfy 'Send test' (mirrors the Discord one): the SW POSTs a test push to
    // the STORED topic (UCP_NTFY_TEST — background/script.js). Only visible
    // while a topic exists (renderNtfyUi).
    const ntfyTest = byId('ucp-shell-devicesTest');
    if (ntfyTest) wireAction(ntfyTest, () => {
      ntfySendTest();
      if (notifStatusEl) {
        notifStatusEl.textContent = 'Test push sent — check your phone.';
        setTimeout(() => { if (notifStatusEl) notifStatusEl.textContent = ''; }, 6000);
      }
    });
    const discInput = byId('ucp-shell-discordInput');
    const discTest = byId('ucp-shell-discordTest');
    if (discTest) wireAction(discTest, discordSendTest);
    if (discInput) {
      // 'change' fires on commit (blur / Enter) — not per keystroke.
      discInput.addEventListener('change', () => {
        const v = discInput.value.trim();
        try {
          chrome.storage.local.get(DISCORD_KEY, (r) => {
            const stored = (r && r[DISCORD_KEY]) || '';
            if (v === stored) { clearDirty('discord'); return; }
            markDirty('discord', {
              previous: stored,
              save: () => {
                try { if (v) { chrome.storage.local.set({ [DISCORD_KEY]: v }); } else { chrome.storage.local.remove(DISCORD_KEY); } } catch (e) {}
              },
              discard: () => { try { discInput.value = stored; } catch (e) {} },
            });
          });
        } catch (e) {}
      });
    }

    // Blur slider (merged into the Background card). 'input' = LIVE PREVIEW
    // only (label + blur applied directly, NO storage write) — writing on
    // every pixel of a drag queues async read-backs that snap the thumb back
    // to a stale value mid-drag (the "slider won't move" bug). 'change'
    // (release) persists the final value once.
    const blurRange = byId('ucp-shell-blurRange');
    if (blurRange) {
      blurRange.addEventListener('pointerdown', () => { blurDragging = true; });
      window.addEventListener('pointerup', () => { blurDragging = false; });
      blurRange.addEventListener('blur', () => { blurDragging = false; });
      blurRange.addEventListener('input', () => {
        const v = parseInt(blurRange.value, 10) || 0;
        syncBlurUi(v);
        applyBlurClass(v);
      });
      blurRange.addEventListener('change', () => {
        const v = parseInt(blurRange.value, 10) || 0;
        // Release = preview settled: mark pending (the live preview is the
        // 'input' handler above — no storage write until "Save changes").
        try {
          chrome.storage.local.get([BLUR_KEY, 'ucp_blur_bg'], (r) => {
            const stored = blurEffective(r);
            if (v === stored) { clearDirty('blur'); return; }
            markDirty('blur', {
              previous: stored,
              save: () => setBlurValue(v, true),
              discard: () => setBlurValue(stored, false),
            });
          });
        } catch (e) {}
      });
    }

    // Upload: a plain <div tabindex="0"> (NO role="button" — the portal's
    // aarsol bundle swallows clicks on [role="button"] markup) that opens the
    // hidden file input via wireAction. Programmatic input.click() inside a
    // trusted gesture opens the picker.
    const uploadBtn = byId('ucp-shell-bgUploadBtn');
    const upload = byId('ucp-shell-bgUpload');
    if (uploadBtn && upload) {
      const openPicker = () => { try { upload.click(); } catch (e) {} };
      wireAction(uploadBtn, openPicker);
    }
    if (upload) upload.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = ''; // allow re-selecting the SAME file on a next upload
      onBgUpload(f);
    });

    // Dashboard item visibility (div-based checkboxes + reset-to-default).
    // Each <div class="ucp-dash-item" data-dash-item="key"> is on/off via the
    // .is-on class. Stored under ucp_dashboard_items as item→bool; the
    // dashboard content script reads it. Missing keys default to VISIBLE, so
    // "reset" = remove the key. Divs (not native <input>) because the portal's
    // content-area handler swallows native form-control clicks — the reason
    // the old <label>/<input> toggles did nothing.
    const DASH_ITEMS_KEY = 'ucp_dashboard_items';
    const dashItems = Array.from(container.querySelectorAll('[data-dash-item]'));
    const dashOn = (el) => el.classList.contains('is-on');
    const setDashOn = (el, on) => {
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-checked', String(on));
    };
    const syncDashBoxes = (state) => {
      dashItems.forEach((el) => {
        const k = el.dataset.dashItem;
        setDashOn(el, state[k] === undefined ? true : !!state[k]);
      });
    };
    const dashStateFromUi = () => {
      const s = {};
      dashItems.forEach((el) => { s[el.dataset.dashItem] = dashOn(el); });
      return s;
    };
    const dashMatchesStored = (stored, ui) => dashItems.every((el) => {
      const k = el.dataset.dashItem;
      return (stored[k] === undefined ? true : !!stored[k]) === ui[k];
    });
    const persistDash = () => {
      const s = dashStateFromUi(); // the UI (preview) state at save time
      try { chrome.storage.local.set({ [DASH_ITEMS_KEY]: s }); } catch (e) {}
    };
    chrome.storage.local.get(DASH_ITEMS_KEY, (r) => syncDashBoxes((r && r[DASH_ITEMS_KEY]) || {}));
    // Each row is a whole-card toggle: the data attribute + __ucpAction sit
    // on the FULL row div, so a press anywhere on it (box, label, padding)
    // resolves to the same guarded action. Toggle = LIVE preview; the stored
    // value only changes on "Save changes".
    dashItems.forEach((el) => {
      const action = () => {
        setDashOn(el, !dashOn(el));
        const ui = dashStateFromUi();
        try {
          chrome.storage.local.get(DASH_ITEMS_KEY, (r) => {
            const stored = (r && r[DASH_ITEMS_KEY]) || {};
            if (dashMatchesStored(stored, ui)) { clearDirty('dash'); return; }
            markDirty('dash', {
              previous: stored,
              save: persistDash,
              discard: () => {
                try { chrome.storage.local.get(DASH_ITEMS_KEY, (rr) => syncDashBoxes((rr && rr[DASH_ITEMS_KEY]) || {})); } catch (e) {}
              },
            });
          });
        } catch (e) {}
      };
      wireAction(el, action);
    });
    const dashReset = byId('ucp-shell-dashReset');

    // =========================================================================
    // Notification widget — tab visibility toggles + default-tab selector.
    // Stored under ucp_notif_tabs as { default: <orig 0-4>, tabs: {<orig>:bool} };
    // js/notification_page.js reads it on every widget render (missing = all
    // five tabs on, default = Academic Calendar).
    // =========================================================================
    const NOTIF_PREFS_KEY = 'ucp_notif_tabs';
    const notifTabItems = Array.from(container.querySelectorAll('[data-notif-tab]'));
    const notifDefaultOpts = Array.from(container.querySelectorAll('#ucp-shell-notifDefault .ucp-shell-seg-opt'));
    const syncNotifUi = (state) => {
      state = state || {};
      const tabs = state.tabs || {};
      notifTabItems.forEach((el) => {
        const k = Number(el.dataset.notifTab);
        const on = tabs[k] === undefined ? true : !!tabs[k];
        el.classList.toggle('is-on', on);
        el.setAttribute('aria-checked', String(on));
      });
      let def = Number(state.default);
      if (!isFinite(def) || def < 0 || def > 4) def = 0;
      notifDefaultOpts.forEach((o) => {
        const on = Number(o.dataset.notifDefault) === def;
        o.classList.toggle('is-on', on);
        o.setAttribute('aria-checked', String(on));
      });
    };
    const notifStateFromUi = () => {
      const s = { tabs: {}, default: 0 };
      notifTabItems.forEach((el) => { s.tabs[Number(el.dataset.notifTab)] = el.classList.contains('is-on'); });
      notifDefaultOpts.forEach((o) => { if (o.classList.contains('is-on')) s.default = Number(o.dataset.notifDefault); });
      return s;
    };
    const persistNotif = () => {
      try { chrome.storage.local.set({ [NOTIF_PREFS_KEY]: notifStateFromUi() }); } catch (e) {}
    };
    try { chrome.storage.local.get(NOTIF_PREFS_KEY, (r) => syncNotifUi((r && r[NOTIF_PREFS_KEY]) || {})); } catch (e) { syncNotifUi({}); }
    // Tab rows = whole-row toggles (same pattern as the dashboard items).
    // LIVE preview; the stored value only changes on "Save changes".
    notifTabItems.forEach((el) => {
      const k = Number(el.dataset.notifTab);
      const action = () => {
        const on = !el.classList.contains('is-on');
        el.classList.toggle('is-on', on);
        el.setAttribute('aria-checked', String(on));
        const ui = notifStateFromUi();
        try {
          chrome.storage.local.get(NOTIF_PREFS_KEY, (r) => {
            const stored = (r && r[NOTIF_PREFS_KEY]) || {};
            const st = stored.tabs || {};
            const stDef = Number(stored.default);
            const same = Object.keys(ui.tabs).every((t) => (st[t] === undefined ? true : !!st[t]) === ui.tabs[t])
              && (ui.default === (isFinite(stDef) ? stDef : 0));
            if (same) { clearDirty('notif'); return; }
            markDirty('notif', {
              previous: stored,
              save: persistNotif,
              discard: () => {
                try { chrome.storage.local.get(NOTIF_PREFS_KEY, (rr) => syncNotifUi((rr && rr[NOTIF_PREFS_KEY]) || {})); } catch (e) {}
              },
            });
          });
        } catch (e) {}
      };
      wireAction(el, action);
    });
    notifDefaultOpts.forEach((o) => {
      const pick = () => {
        const v = Number(o.dataset.notifDefault);
        notifDefaultOpts.forEach((x) => {
          const on = x === o;
          x.classList.toggle('is-on', on);
          x.setAttribute('aria-checked', String(on));
        });
        const ui = notifStateFromUi();
        try {
          chrome.storage.local.get(NOTIF_PREFS_KEY, (r) => {
            const stored = (r && r[NOTIF_PREFS_KEY]) || {};
            const st = stored.tabs || {};
            const stDef = Number(stored.default);
            const same = Object.keys(ui.tabs).every((t) => (st[t] === undefined ? true : !!st[t]) === ui.tabs[t])
              && (ui.default === (isFinite(stDef) ? stDef : 0));
            if (same) { clearDirty('notif'); return; }
            markDirty('notif', {
              previous: stored,
              save: persistNotif,
              discard: () => {
                try { chrome.storage.local.get(NOTIF_PREFS_KEY, (rr) => syncNotifUi((rr && rr[NOTIF_PREFS_KEY]) || {})); } catch (e) {}
              },
            });
          });
        } catch (e) {}
      };
      wireAction(o, pick);
    });

    // =========================================================================
    // Courses · Card Details wiring (code, section, credits toggles & defaultBtn)
    // =========================================================================
    const courseCardItems = Array.from(container.querySelectorAll('[data-course-card-item]'));
    const courseBtnOpts = Array.from(container.querySelectorAll('#ucp-shell-courseBtnDefault .ucp-shell-seg-opt'));

    const courseCardStateFromUi = () => {
      const s = { code: true, section: true, credits: true, defaultBtn: 'gradebook' };
      courseCardItems.forEach((el) => {
        s[el.dataset.courseCardItem] = el.classList.contains('is-on');
      });
      courseBtnOpts.forEach((o) => {
        if (o.classList.contains('is-on')) s.defaultBtn = o.dataset.courseBtn;
      });
      return s;
    };

    const persistCourseCard = () => {
      try { chrome.storage.local.set({ [COURSE_CARD_CONFIG_KEY]: courseCardStateFromUi() }); } catch (e) {}
    };

    const courseCardMatchesStored = (stored, ui) => {
      stored = stored || DEFAULT_COURSE_CARD_CONFIG;
      const keys = ['code', 'section', 'credits'];
      const itemsMatch = keys.every((k) => (stored[k] === undefined ? true : !!stored[k]) === ui[k]);
      const btnMatch = (stored.defaultBtn || 'gradebook') === (ui.defaultBtn || 'gradebook');
      return itemsMatch && btnMatch;
    };

    courseCardItems.forEach((el) => {
      const action = () => {
        const on = !el.classList.contains('is-on');
        el.classList.toggle('is-on', on);
        el.setAttribute('aria-checked', String(on));
        const ui = courseCardStateFromUi();
        try {
          chrome.storage.local.get(COURSE_CARD_CONFIG_KEY, (r) => {
            const stored = (r && r[COURSE_CARD_CONFIG_KEY]) || DEFAULT_COURSE_CARD_CONFIG;
            if (courseCardMatchesStored(stored, ui)) { clearDirty('courseCard'); return; }
            markDirty('courseCard', {
              previous: stored,
              save: persistCourseCard,
              discard: () => {
                try { chrome.storage.local.get(COURSE_CARD_CONFIG_KEY, (rr) => syncCourseCardUi((rr && rr[COURSE_CARD_CONFIG_KEY]) || DEFAULT_COURSE_CARD_CONFIG)); } catch (e) {}
              }
            });
          });
        } catch (e) {}
      };
      wireAction(el, action);
    });

    courseBtnOpts.forEach((o) => {
      const pick = () => {
        courseBtnOpts.forEach((x) => {
          const on = x === o;
          x.classList.toggle('is-on', on);
          x.setAttribute('aria-checked', String(on));
        });
        const ui = courseCardStateFromUi();
        try {
          chrome.storage.local.get(COURSE_CARD_CONFIG_KEY, (r) => {
            const stored = (r && r[COURSE_CARD_CONFIG_KEY]) || DEFAULT_COURSE_CARD_CONFIG;
            if (courseCardMatchesStored(stored, ui)) { clearDirty('courseCard'); return; }
            markDirty('courseCard', {
              previous: stored,
              save: persistCourseCard,
              discard: () => {
                try { chrome.storage.local.get(COURSE_CARD_CONFIG_KEY, (rr) => syncCourseCardUi((rr && rr[COURSE_CARD_CONFIG_KEY]) || DEFAULT_COURSE_CARD_CONFIG)); } catch (e) {}
              }
            });
          });
        } catch (e) {}
      };
      wireAction(o, pick);
    });

    if (dashReset) {
      // Reset = PREVIEW the default (all items on, default tab = Calendar, default course card config).
      // It marks the groups dirty against the stored values — "Save changes"
      // then actually applies the reset (remove the keys = all defaults),
      // "Discard" reverts the preview. If storage is already at defaults
      // nothing is marked dirty (nothing to save, nothing to discard).
      const doReset = () => {
        syncDashBoxes({});
        syncCourseCardUi(DEFAULT_COURSE_CARD_CONFIG);
        notifTabItems.forEach((el) => { el.classList.add('is-on'); el.setAttribute('aria-checked', 'true'); });
        notifDefaultOpts.forEach((o) => {
          const on = o.dataset.notifDefault === '0';
          o.classList.toggle('is-on', on);
          o.setAttribute('aria-checked', String(on));
        });
        try {
          chrome.storage.local.get([DASH_ITEMS_KEY, NOTIF_PREFS_KEY, COURSE_CARD_CONFIG_KEY], (r) => {
            const dashStored = (r && r[DASH_ITEMS_KEY]) || {};
            const dashDiffers = Object.keys(dashStored).some((k) => dashStored[k] === false);
            const st = (r && r[NOTIF_PREFS_KEY] && r[NOTIF_PREFS_KEY].tabs) || {};
            const notifDiffers = Object.keys(st).some((k) => st[k] === false)
              || ((isFinite(Number(r && r[NOTIF_PREFS_KEY] && r[NOTIF_PREFS_KEY].default)) ? Number(r[NOTIF_PREFS_KEY].default) : 0) !== 0);
            const ccStored = (r && r[COURSE_CARD_CONFIG_KEY]) || DEFAULT_COURSE_CARD_CONFIG;
            const ccDiffers = !courseCardMatchesStored(DEFAULT_COURSE_CARD_CONFIG, ccStored);

            if (dashDiffers) {
              markDirty('dash', {
                previous: dashStored,
                save: () => { try { chrome.storage.local.remove(DASH_ITEMS_KEY); } catch (e) {} },
                discard: () => {
                  try { chrome.storage.local.get(DASH_ITEMS_KEY, (rr) => syncDashBoxes((rr && rr[DASH_ITEMS_KEY]) || {})); } catch (e) {}
                },
              });
            } else clearDirty('dash');

            if (notifDiffers) {
              markDirty('notif', {
                previous: (r && r[NOTIF_PREFS_KEY]) || {},
                save: () => { try { chrome.storage.local.remove(NOTIF_PREFS_KEY); } catch (e) {} },
                discard: () => {
                  try { chrome.storage.local.get(NOTIF_PREFS_KEY, (rr) => syncNotifUi((rr && rr[NOTIF_PREFS_KEY]) || {})); } catch (e) {}
                },
              });
            } else clearDirty('notif');

            if (ccDiffers) {
              markDirty('courseCard', {
                previous: ccStored,
                save: () => { try { chrome.storage.local.remove(COURSE_CARD_CONFIG_KEY); } catch (e) {} },
                discard: () => {
                  try { chrome.storage.local.get(COURSE_CARD_CONFIG_KEY, (rr) => syncCourseCardUi((rr && rr[COURSE_CARD_CONFIG_KEY]) || DEFAULT_COURSE_CARD_CONFIG)); } catch (e) {}
                },
              });
            } else clearDirty('courseCard');
          });
        } catch (e) {}
        // Confirm even when nothing was hidden (no visible box change otherwise).
        const ds = byId('ucp-shell-dashStatus');
        if (ds) { ds.textContent = 'Dashboard items, course card options & notification tabs reset to default.'; setTimeout(() => { ds.textContent = ''; }, 4000); }
      };
      wireAction(dashReset, doReset);
    }

    // Storage & Cache — wire the Refresh button, the background-size segmented
    // control and the Clear-cache button (all div-based; pointerdown-activated
    // via wireAction so the portal can't swallow them).
    // Extension meter Refresh (re-query the usage after a reload / stale read)
    // + the notification-section Clear (drops ONLY that section's stored data).
    const extRefresh = byId('ucp-shell-extRefresh');
    if (extRefresh) {
      wireAction(extRefresh, () => { renderExtMeters(); renderNotifCacheMeters(); });
    }
    const notifCacheClear = byId('ucp-shell-notifCacheClear');
    if (notifCacheClear) {
      wireAction(notifCacheClear, () => clearNotifCache());
    }
    const portalRefresh = byId('ucp-shell-portalRefresh');
    if (portalRefresh) {
      wireAction(portalRefresh, () => refreshPortalMeter());
    }
    const bgMaxSeg = byId('ucp-shell-bgMaxSize');
    if (bgMaxSeg) {
      bgMaxSeg.querySelectorAll('.ucp-shell-seg-opt').forEach((o) => {
        const pick = () => {
          const v = parseInt(o.dataset.max, 10) || 1400;
          syncBgMaxSize(v); // UI + module var (affects FUTURE uploads only)
          try {
            chrome.storage.local.get(BG_MAX_KEY, (r) => {
              const stored = (r && r[BG_MAX_KEY]) || 1400;
              if (v === stored) { clearDirty('bgSize'); return; }
              markDirty('bgSize', {
                previous: stored,
                save: () => { try { chrome.storage.local.set({ [BG_MAX_KEY]: v }); } catch (e) {} },
                discard: () => syncBgMaxSize(stored),
              });
            });
          } catch (e) {}
        };
        wireAction(o, pick);
      });
    }
    const clearBtn = byId('ucp-shell-clearCache');
    if (clearBtn) {
      wireAction(clearBtn, () => clearExtCache());
    }
    const openFolder = byId('ucp-shell-openCacheFolder');
    if (openFolder) {
      wireAction(openFolder, () => revealCacheFolder());
    }
    renderStorageMeters();

    initPrefs();

    // =========================================================================
    // PENDING ACTIONS — wire each "Save changes" / "Discard" pair (the boxes
    // are shown only while their setting is dirty) and register the rows they
    // highlight. One box can cover several settings ("dash notif" — the two
    // groups share a card).
    // =========================================================================
    document.querySelectorAll('.ucp-pending-actions').forEach((box) => {
      const pIds = box.dataset.pending || '';
      const rowEl = pIds === 'blur' ? box.closest('.ucp-shell-bg-blur')
        : pIds === 'accent' ? box.closest('.ucp-shell-bg-accent')
        : pIds === 'bgSize' ? box.closest('.ucp-shell-storage-opt')
        : box.closest('.ucp-shell-card');
      registerPendingRow(pIds, rowEl, box);
      const saveBtn = box.querySelector('.ucp-pending-save');
      const discBtn = box.querySelector('.ucp-pending-discard');
      if (saveBtn) wireAction(saveBtn, () => saveDirty(pIds));
      if (discBtn) wireAction(discBtn, () => discardDirty(pIds));
    });

    // WIRING SELF-CHECK — proves the page is running THIS build. In the
    // DevTools console after opening Settings, look for this line: if it is
    // MISSING the page is still running the old content script (the extension
    // was reloaded but the page was not hard-refreshed — content scripts never
    // re-inject into an already-open page; press Ctrl+Shift+R).
    console.info('[UCP settings] build ' + BUILD_TAG + ' — ' + wiredControls
      + ' controls armed (switches, bg tiles, segments, refresh, clear, open-folder, Save/Discard)');
  }
  // Called by js/shell.js when the page is left (Escape / sidebar / Back /
  // popstate): every UNSAVED preview is discarded so the portal the user
  // returns to matches the STORED settings — a preview must not leak onto
  // other pages. (Saved changes already reached storage; shell.js applies
  // them via its onChanged handlers.)
  function revertPending() {
    // (stay / dark / night / enroll / accent are INSTANT now — they write
    // storage in the gesture, so no pending entries exist for them.)
    try { discardDirty('blur bg bgSize dash notif push instantPush notifMode courseCard discord'); } catch (e) {}
    pending.clear();
    // Body-level previews (night modes / blur / wallpaper) — restore the
    // stored state directly (in case the page's own storage sync already ran
    // or the body drifted during a preview).
    try {
      chrome.storage.local.get(['ucp_night_mode', 'ucp_night_mode_deep', BLUR_KEY, 'ucp_blur_bg', CURRENT_BG_KEY], (r) => {
        const dark = (r && r.ucp_night_mode === undefined) ? true : !!r.ucp_night_mode;
        const deep = !!(r && r.ucp_night_mode_deep);
        document.body.classList.toggle('ucp-night', !!(dark || deep));
        document.body.classList.toggle('ucp-night-deep', !!deep);
        try { applyBlurClass(blurEffective(r)); } catch (e) {}
        const savedBg = (r && r[CURRENT_BG_KEY]) || null;
        if (savedBg) { try { applyWallpaper(savedBg); } catch (e) {} }
      });
    } catch (e) {}
  }
  window.__ucpSettingsPage = { render, revertPending };

  // -------------------------------------------------------------------------
  // Window- + document-level CAPTURE backstops for the settings controls.
  //
  // The portal's own scripts register capture handlers (on window AND/OR
  // document, always BEFORE any content script of ours) that swallow
  // pointerdown/mousedown — and on some clicks — for the deeper-nested
  // controls. A handler registered EARLIER on the same node can
  // stopImmediatePropagation() us out of existence, so a backstop on
  // <document> alone can be starved by the portal's own document handler.
  // <window> sits ABOVE <document>: its capture listeners run BEFORE every
  // document-level handler — the portal's included — so the window backstop
  // is the layer the portal cannot preempt. The document copies stay as a
  // second net (if the portal somehow blocks window capture, document may
  // still deliver). The 400 ms __ucpAction guard makes the double
  // registration safe: one press executes at most ONE action.
  //
  // Each backstop walks up from the pressed element to the nearest one
  // carrying a __ucpAction (set on every control during render(), incl. the
  // bg tiles and whole-row toggles), EXECUTES it, and swallows the event so
  // the portal never gets it. Targets without __ucpAction (all portal
  // content, the blur slider) are ignored — the backstops only ever touch
  // our own controls.
  // -------------------------------------------------------------------------
  const __ucpFindAction = (target) => {
    let n = target;
    while (n && n.nodeType === 1 && typeof n.__ucpAction !== 'function') n = n.parentElement;
    return (n && typeof n.__ucpAction === 'function') ? n : null;
  };
  const ucpBackstop = (type) => (e) => {
    const n = __ucpFindAction(e.target);
    if (!n) return;
    // A press that started on a native interactive control inside the armed
    // node keeps its own behaviour (links, inputs, file pickers) — same rule
    // as wireAction, so the backstop never hijacks those either.
    let t = e.target;
    while (t && t !== n && t.nodeType === 1) {
      const tag = t.tagName;
      if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t.isContentEditable) return;
      t = t.parentElement;
    }
    e.stopPropagation();
    // Do not call e.preventDefault() so user activation, clicks, and native file dialogues are not blocked
    try { n.__ucpAction(); } catch (err) { console.warn('UCP settings control', err); }
  };
  // pointerdown / mousedown: the portal eats these for the nested controls,
  // so these usually lose — but they win whenever a delivery path opens up,
  // and the click backstop below is the guaranteed one (clicks demonstrably
  // reach these layers — that is how the switches have always worked).
  ['pointerdown', 'mousedown', 'click'].forEach((type) => {
    window.addEventListener(type, ucpBackstop(type), true);
    document.addEventListener(type, ucpBackstop(type), true);
  });

  // =========================================================================
  // BACKGROUND — picker + custom upload (moved in from shell.js)
  // =========================================================================
  // A tile whose image failed to load gets a text label so the option stays
  // visible and pickable (no blank boxes).
  function showTileFallback(tile, name) {
    const img = tile.querySelector('img');
    if (img) img.remove();
    const label = document.createElement('div');
    label.className = 'ucp-shell-bg-tile-name';
    label.textContent = name;
    tile.appendChild(label);
  }
  function renderBgGrid(currentPath) {
    const grid = byId('ucp-shell-bgGrid');
    if (!grid) return;
    if (currentPath === undefined) {
      // No value in hand — read it once, and fall back to "no selection"
      // (null) when nothing is saved yet so this can't loop forever.
      chrome.storage.local.get(CURRENT_BG_KEY, (r) => renderBgGrid((r && r[CURRENT_BG_KEY]) || null));
      return;
    }
    // Stale extension context (extension reloaded without a page refresh):
    // getURL() throws and no bundled image can be fetched — say so instead of
    // rendering a grid of blank tiles.
    if (!isContextAlive()) {
      grid.innerHTML = '<div class="ucp-shell-bg-dead">The extension was just reloaded — press F5 (refresh this page) to pick or change the background.</div>';
      return;
    }
    grid.innerHTML = '';
    BG_PRESETS.forEach((p) => {
      const tile = document.createElement('div');
      tile.className = 'ucp-shell-bg-tile' + (currentPath === p ? ' ucp-shell-bg-active' : '');
      tile.dataset.bg = p; // bgPathFromUi() reads it back (pending bg save)
      tile.title = 'Use preset background';
      const img = document.createElement('img');
      // Eager load: the page can be hidden (display:none) until opened, and
      // lazy images inside a hidden container can stay blank after it is shown.
      img.src = extUrl(p); img.alt = 'Background preset';
      img.onerror = () => showTileFallback(tile, String(p).split('/').pop().replace(/\.jpg$/i, ''));
      tile.appendChild(img);
      // wireAction (not a plain click listener): the tile is deep inside the
      // Background card, where the portal's handlers swallow plain clicks —
      // only the __ucpAction backstop path reliably reaches it.
      wireAction(tile, () => setBackground(p));
      grid.appendChild(tile);
    });
    if (currentPath && !BG_PRESETS.includes(currentPath)) {
      const tile = document.createElement('div');
      tile.className = 'ucp-shell-bg-tile ucp-shell-bg-active ucp-shell-bg-custom';
      const img = document.createElement('img');
      img.src = (currentPath.startsWith('data:') || currentPath.startsWith('http')) ? currentPath : extUrl(currentPath);
      img.alt = 'Current background';
      img.onerror = () => showTileFallback(tile, 'Custom');
      tile.appendChild(img);
      tile.title = 'Current (custom) background';
      grid.appendChild(tile);
    }
  }
  // Background pick / upload = LIVE PREVIEW: the wallpaper paints on this
  // page at once and the grid highlights the tile, but the STORED value only
  // changes when "Save changes" is pressed. Discard restores the stored
  // background. Saving triggers the CURRENT_BG_KEY onChanged branch (other
  // tabs + the accent re-sample).
  function previewBackground(path) {
    applyWallpaper(path);
    renderBgGrid(path); // re-highlights; adds the custom tile for an upload
  }
  // The background the UI currently shows (the active tile — a preset path or
  // the custom tile's data URL / image src).
  function bgPathFromUi() {
    const grid = byId('ucp-shell-bgGrid');
    if (!grid) return null;
    const active = grid.querySelector('.ucp-shell-bg-active');
    if (!active) return null;
    if (active.dataset.bg) return active.dataset.bg;
    const img = active.querySelector('img');
    return img ? img.src : null;
  }
  function setBackground(path) {
    previewBackground(path);
    try {
      chrome.storage.local.get(CURRENT_BG_KEY, (r) => {
        const stored = (r && r[CURRENT_BG_KEY]) || null;
        if (stored === path) { clearDirty('bg'); return; }
        markDirty('bg', {
          previous: stored,
          save: () => {
            const cur = bgPathFromUi() || path; // the UI state at save time
            try { chrome.storage.local.set({ [CURRENT_BG_KEY]: cur }); } catch (e) {}
          },
          discard: () => {
            if (stored) { applyWallpaper(stored); renderBgGrid(stored); }
            else renderBgGrid(null);
          },
        });
      });
    } catch (e) {}
  }
  // =========================================================================
  // UPLOAD FEEDBACK — a short status line confirms a pick/upload applied, so
  // the user can see the upload actually took effect (it is applied live).
  // =========================================================================
  let statusTimer = null;
  // sticky = keep the message on screen until something else replaces it
  // (used for "Processing image…" — a large file can take a while and the
  // 3.5s auto-clear would make the upload look dead).
  function showBgStatus(msg, isError, sticky) {
    const el = byId('ucp-shell-bgStatus');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('ucp-shell-bg-status-error', !!isError);
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    if (!sticky) statusTimer = setTimeout(() => { el.textContent = ''; }, 3500);
  }
  // Some file pickers / OS report an EMPTY mime type for image files, so
  // reject only when BOTH the type and the file name say "not an image".
  const IMG_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|svg)$/i;
  function onBgUpload(file) {
    if (!file) return;
    const looksImage = (file.type && file.type.startsWith('image/')) || IMG_EXT.test(file.name || '');
    if (!looksImage) {
      showBgStatus('That file is not an image — try a JPG, PNG or WebP.', true);
      return;
    }
    showBgStatus('Processing image…', false, true); // sticky until the result replaces it
    const reader = new FileReader();
    reader.onerror = () => showBgStatus('Could not read that file. Try again.', true);
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string') {
        showBgStatus('Could not read that file. Try again.', true);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const MAX = bgMaxDim; // user-configurable cap (Storage & Cache section)
        let { width: w, height: h } = img;
        if (!w || !h) { w = MAX; h = Math.round(MAX * 0.625); } // decode gave no size — still save it
        if (w > MAX || h > MAX) { const s = Math.min(MAX / w, MAX / h); w = Math.round(w * s); h = Math.round(h * s); }
        try {
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          // JPEG has no alpha channel — flatten any transparency to white so
          // a PNG with transparent areas doesn't turn into black boxes.
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          setBackground(canvas.toDataURL('image/jpeg', 0.82));
          showBgStatus('Custom background previewed — press Save changes to keep it (Discard reverts).');
        } catch (e) {
          // Canvas edge case (size/taint) — use the raw file data instead.
          setBackground(dataUrl);
          showBgStatus('Custom background previewed — press Save changes to keep it (Discard reverts).');
        }
      };
      img.onerror = () => {
        // The browser couldn't decode it — still keep the raw file data so
        // the user's pick is not lost.
        setBackground(dataUrl);
        showBgStatus('Custom background previewed — press Save changes to keep it (Discard reverts).');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  // =========================================================================
  // Direct load — a refresh on /student/settings (or the portal serving that
  // path) still shows the settings page: render into the shell root (created
  // here when shell.js hasn't). Leaving the page is via the sidebar entries
  // / Escape / the browser Back button (shell.js' popstate handler) — the
  // page itself no longer has a Back button.
  // =========================================================================
  if (location.pathname === '/student/settings') {
    const ensureRoot = () => {
      let root = byId('ucp-shell-root');
      if (root) return root;
      root = document.createElement('div');
      root.id = 'ucp-shell-root';
      (document.getElementById('page_content') || document.body).appendChild(root);
      return root;
    };
    const directRender = () => {
      // This script now runs at document_start — long before #page_content
      // (or even <body>) exists — so defer the render to DOM ready.
      if (!document.body) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', directRender, { once: true });
        else setTimeout(directRender, 0);
        return;
      }
      render(ensureRoot());
    };
    directRender();
  }
});
