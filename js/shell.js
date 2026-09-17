chrome.storage.local.get('toggle_power', (result) => {
  if (!result || !result['toggle_power']) return;

  const BASE = 'https://horizon.ucp.edu.pk';
  const PAGE_URLS = { settings: '/student/settings' };
  let originalContent = null; // saved display styles of the page content's children

  const powerOn = (v) => (v === undefined || v === null) ? true : !!v;
  // Stay Active is ON by default (a missing value means "stay on").
  const stayOn = (v) => (v === undefined || v === null) ? true : !!v;
  // Accent-color mode is ON by default (a missing value means "on").
  const accentOn = (v) => (v === undefined || v === null) ? true : !!v;

  // 
  // helpers
  // 
  function byId(id) { return document.getElementById(id); }
  // Extension path → chrome-extension:// URL (slash-stripped; see settings).
  function extUrl(p) {
    try { return chrome.runtime.getURL(String(p).replace(/^\/+/, '')); } catch (e) { return p; }
  }
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

  // CONSOLE NOISE FILTER
  function ensureConsoleFilter() {
    if (byId('ucp-shell-consoleFilter')) return;
    const s = document.createElement('script');
    s.id = 'ucp-shell-consoleFilter';
    s.textContent = `
      (function () {
        if (window.__ucpConsoleFiltered) return;
        window.__ucpConsoleFiltered = true;
        function isNoise(args) {
          for (var i = 0; i < args.length; i++) {
            var a = args[i];
            if (typeof a === 'string') {
              if (a === 'i fired') return true;
            } else if (a && typeof a === 'object') {
              // jQuery objects logged by the portal's debug code: they carry
              // a .jquery version string (plus fn.init in the console view).
              if (typeof a.jquery === 'string') return true;
              if (a.fn && a.fn.init && typeof a.length === 'number') return true;
            }
          }
          return false;
        }
        ['log', 'info', 'debug'].forEach(function (m) {
          var orig = console[m].bind(console);
          console[m] = function () {
            var args = Array.prototype.slice.call(arguments);
            if (isNoise(args)) return;
            orig.apply(null, args);
          };
        });
      })();
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  // 
  // PREFERENCES (night / blur / stay / power) → body classes + switch UI
  // The switches themselves live on the Settings page (js/settings_page.js);
  // syncSwitch() is a no-op whenever that page is not open.
  // 
  // Dark Mode (ucp_night_mode, default ON): the dark THEME  dark glass
  // surfaces, white text, the wallpaper dimmed + veiled (the wallpaper is
  // KEPT). Night Mode (ucp_night_mode_deep, default OFF): SEPARATE  it
  // removes the wallpaper entirely (flat dark ground). Night Mode implies the
  // Dark Mode styling, so body.ucp-night applies when EITHER is on, and
  // body.ucp-night-deep only when Night Mode is on.
  function applyModes(dark, deep) {
    document.body.classList.toggle('ucp-night', !!(dark || deep));
    document.body.classList.toggle('ucp-night-deep', !!deep);
    syncSwitch('ucp-shell-nightToggle', !!dark);
    syncSwitch('ucp-shell-nightDeepToggle', !!deep);
  }
  // Blur is now a manual AMOUNT (0–10 px, ucp_blur_amount) set by the slider
  // in the Settings Background card  the body.ucp-blur class enables the
  // filter and --ucp-blur-px picks its strength (shell.css / settings_page.css
  // read the variable; 10px is the old fixed default).
  const BLUR_KEY = 'ucp_blur_amount';
  function blurAmount(r) {
    if (r && typeof r[BLUR_KEY] === 'number') return Math.min(10, Math.max(0, r[BLUR_KEY]));
    return (r && r.ucp_blur_bg) ? 10 : 0; // legacy on/off toggle
  }
  function applyBlur(amount) {
    const on = amount > 0;
    document.body.classList.toggle('ucp-blur', on);
    try {
      if (on) document.body.style.setProperty('--ucp-blur-px', amount + 'px');
      else document.body.style.removeProperty('--ucp-blur-px');
    } catch (e) {}
  }
  // 
  // ACCENT COLOR  GLOBAL (default ON)
  // When the mode is on, <body> gets body.ucp-bg-accent + --ucp-accent so the
  // CSS (styles/shell.css + the pages' own sheets) can tint icons, the
  // sidebar text and the shell buttons with the current background's accent
  // color  on EVERY page, not just Settings/Notification. The color is
  // sampled from the current wallpaper (same technique as settings_page.js)
  // and cached in ucp_bg_accent_color so page loads apply it instantly.
  // 
  const ACCENT_KEY = 'ucp_bg_accent';
  const ACCENT_COLOR_KEY = 'ucp_bg_accent_color';
  const BG_KEY = 'background-wallpaper-path';
  // Color/contrast-aware sidebar veil (day mode): sampled from the wallpaper
  // like the accent  a translucent dark tint of the image, stronger over
  // bright wallpapers and lighter over dark ones so the image shows through.
  const TINT_KEY = 'ucp_bg_sidebar_tint';
  function applySidebarTint(tint) {
    if (!tint) return;
    try { document.body.style.setProperty('--ucp-sidebar-bg', `rgba(${tint})`); } catch (e) {}
  }
  // Contrast-aware drop shadow for the sidebar text: a DARK shadow for light
  // text (day-mode white, or a light accent) and a LIGHT shadow for dark
  // text, so the shadow always sits opposite the letters' own color and the
  // text stays readable over ANY wallpaper. No color → day-mode white text.
  function contrastShadow(color) {
    let lum = 1;
    if (color) {
      const p = String(color).split(',').map(Number);
      if (p.length === 3 && p.every((x) => Number.isFinite(x))) {
        lum = (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255;
      }
    }
    // Kept SUBTLE  a bit lower opacity + a tighter soft layer than the
    // first pass: enough to lift the text off any wallpaper, not a halo.
    // Accent OFF always lands here with a dark (black) shadow  white text
    // is the only text color in that mode, so black is the contrast-aware
    // choice.
    return lum >= 0.4
      ? '0 1px 2px rgba(0,0,0,0.7), 0 1px 5px rgba(0,0,0,0.3)'
      : '0 1px 2px rgba(255,255,255,0.75), 0 1px 5px rgba(255,255,255,0.35)';
  }
  function applySidebarShadow(color) {
    try { document.body.style.setProperty('--ucp-sidebar-shadow', contrastShadow(color)); } catch (e) {}
  }
  function applyAccentStyle(color) {
    if (!color) return;
    try {
      document.body.style.setProperty('--ucp-accent', `rgb(${color})`);
      document.body.classList.add('ucp-bg-accent');
    } catch (e) {}
  }
  function clearAccent() {
    try {
      document.body.classList.remove('ucp-bg-accent');
      document.body.style.removeProperty('--ucp-accent');
    } catch (e) {}
  }
  function sampleAccent(img) {
    const S = 48;
    try {
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, S, S);
      const d = ctx.getImageData(0, 0, S, S).data;
      // Coarse buckets scored by saturation → the dominant VIBRANT hue.
      const buckets = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        const lum = (mx + mn) / 510;
        if (sat < 0.22 || lum < 0.12 || lum > 0.95) continue;
        const key = ((r >> 5) << 4) | ((g >> 5) << 2) | (b >> 5);
        const k = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0, s: 0 };
        k.n++; k.r += r; k.g += g; k.b += b; k.s += sat;
        buckets.set(key, k);
      }
      let best = null, bestScore = -1;
      for (const k of buckets.values()) {
        const score = (k.s / k.n) * Math.sqrt(k.n);
        if (score > bestScore) { bestScore = score; best = k; }
      }
      if (!best) return null;
      let r = Math.round(best.r / best.n), g = Math.round(best.g / best.n), b = Math.round(best.b / best.n);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum < 0.45) { // brighten a too-dark accent for legibility
        const f = 0.45 / Math.max(lum, 0.05);
        r = Math.min(255, Math.round(r * f));
        g = Math.min(255, Math.round(g * f));
        b = Math.min(255, Math.round(b * f));
      }
      return r + ',' + g + ',' + b;
    } catch (e) { return null; } // tainted canvas / no 2d → keep cached/white
  }
  // Sample the wallpaper's AVERAGE color + brightness → the day-mode sidebar
  // veil ("r,g,b,alpha"): the image's hue mixed into a neutral dark base
  // (color-aware), with the alpha scaled by the image's brightness so bright
  // wallpapers get a stronger veil and dark ones a lighter one (contrast-
  // aware)  always translucent so the wallpaper shows through.
  function sampleSidebarTint(img) {
    const S = 48;
    try {
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, S, S);
      const d = ctx.getImageData(0, 0, S, S).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const base = [10, 14, 20], mix = 0.3; // 30% of the image's hue survives
      const v = [0, 1, 2].map((i, idx) => {
        const imgC = [r, g, b][idx], baseC = base[idx];
        return Math.max(0, Math.min(255, Math.round(baseC * (1 - mix) + imgC * mix)));
      });
      const alpha = Math.round((0.3 + Math.min(1, Math.max(0, lum)) * 0.34) * 100) / 100;
      return v[0] + ',' + v[1] + ',' + v[2] + ',' + alpha;
    } catch (e) { return null; } // tainted canvas / no 2d → keep cached/fallback
  }
  function sampleCurrentBg() {
    return new Promise((resolve) => {
      let s;
      try { s = chrome.storage.local; } catch (e) { return resolve(null); }
      try {
        s.get(BG_KEY, (res) => {
          const path = res && res[BG_KEY];
          if (!path) return resolve(null);
          let src;
          try { src = /^data:|^https?:/i.test(path) ? path : extUrl(path); } catch (e) { return resolve(null); }
          const withImg = (imgSrc) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = imgSrc;
          };
          if (/^chrome-extension:/i.test(src)) {
            // Cross-origin from the page's point of view → fetch the bundled
            // file (web-accessible) and sample from a same-origin object URL.
            try {
              fetch(src).then((r2) => (r2 && r2.ok ? r2.blob() : null))
                .then((blob) => {
                  if (!blob) return resolve(null);
                  const obj = URL.createObjectURL(blob);
                  const img = new Image();
                  img.onload = () => { URL.revokeObjectURL(obj); resolve(img); };
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
  // Apply the cached tints immediately, then re-sample the current wallpaper
  // so both stay in sync (and get re-cached). The accent clears itself when
  // its mode is off; the sidebar veil is INDEPENDENT of the accent toggle 
  // it is the day-mode base the white/accent text sits on. Called on every
  // page load and on accent/background changes.
  function refreshAccent() {
    let s;
    try { s = chrome.storage.local; } catch (e) { return; }
    try {
      s.get([ACCENT_KEY, ACCENT_COLOR_KEY, TINT_KEY], (res) => {
        const on = !!(res && accentOn(res[ACCENT_KEY]));
        if (!res || !on) {
          clearAccent(); applySidebarShadow(null); // white text → dark shadow
        } else {
          if (res[ACCENT_COLOR_KEY]) applyAccentStyle(res[ACCENT_COLOR_KEY]);
          applySidebarShadow(res[ACCENT_COLOR_KEY] || null); // contrast-aware
        }
        if (res && res[TINT_KEY]) applySidebarTint(res[TINT_KEY]);
        sampleCurrentBg().then((img) => {
          if (!img) return; // keep the cached values
          const out = {};
          if (on) {
            const color = sampleAccent(img);
            if (color && color !== res[ACCENT_COLOR_KEY]) {
              applyAccentStyle(color); applySidebarShadow(color);
              out[ACCENT_COLOR_KEY] = color;
            }
          }
          const tint = sampleSidebarTint(img);
          if (tint && tint !== res[TINT_KEY]) {
            applySidebarTint(tint); out[TINT_KEY] = tint;
          }
          if (Object.keys(out).length) { try { s.set(out); } catch (e) {} }
        });
      });
    } catch (e) {}
  }

  function initPrefs() {
    chrome.storage.local.get(['ucp_night_mode', 'ucp_night_mode_deep', 'ucp_blur_bg', BLUR_KEY, 'toggle_stay', 'toggle_power', 'ucp_enrollment_ui_new'], (r) => {
      // Dark Mode is the default now: on the first run (value never set) seed
      // it ON and apply it  every reader already treats a truthy value as on,
      // so no other logic changes. Night Mode (deep) seeds OFF (missing = off).
      let night = !!(r && r.ucp_night_mode);
      if (r && r.ucp_night_mode === undefined) {
        night = true;
        try { chrome.storage.local.set({ ucp_night_mode: true, ucp_night_mode_deep: false }); } catch (e) {}
      }
      applyModes(night, !!(r && r.ucp_night_mode_deep));
      applyBlur(blurAmount(r));
      syncSwitch('ucp-shell-stayToggle', r ? stayOn(r.toggle_stay) : true);
      syncSwitch('ucp-shell-powerToggle', r ? powerOn(r.toggle_power) : true);
      // Default is the OLD portal enrollment UI unless the user opted in.
      syncSwitch('ucp-shell-enrollToggle', !!(r && r.ucp_enrollment_ui_new));
      // Global accent tint (ON by default; clears itself when turned off).
      refreshAccent();
    });
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.ucp_night_mode || changes.ucp_night_mode_deep) {
      // Re-read both so the class combo stays consistent (either/both on).
      chrome.storage.local.get(['ucp_night_mode', 'ucp_night_mode_deep'], (r) => {
        applyModes(
          (r && r.ucp_night_mode === undefined) ? true : !!r.ucp_night_mode,
          !!(r && r.ucp_night_mode_deep),
        );
      });
    }
    if (changes[BLUR_KEY] || changes.ucp_blur_bg) {
      chrome.storage.local.get([BLUR_KEY, 'ucp_blur_bg'], (r) => applyBlur(blurAmount(r)));
    }
    if (changes.toggle_stay) syncSwitch('ucp-shell-stayToggle', stayOn(changes.toggle_stay.newValue));
    if (changes.toggle_power) syncSwitch('ucp-shell-powerToggle', powerOn(changes.toggle_power.newValue));
    if (changes.ucp_enrollment_ui_new) syncSwitch('ucp-shell-enrollToggle', !!changes.ucp_enrollment_ui_new.newValue);
    // Accent mode toggled, its color re-cached, or the wallpaper changed 
    // re-apply / re-sample the tint.
    if (changes[ACCENT_KEY] || changes[ACCENT_COLOR_KEY] || changes[BG_KEY]) {
      refreshAccent();
    }
  });


  // SIDEBAR ENTRIES (sized to match the portal's own menu items)
  // 
  // Two entries live in the sidebar: Notifications (the standalone
  // Notification & Updates page  openShell('notif') pushes
  // /student/notifications and js/notification_page.js renders it into
  // #ucp-shell-root) and Settings. The dashboard keeps its embedded
  // "Notification & Updates" widget too (js/student_dashboard.js)  the
  // sidebar entry is the full-page view, not a duplicate of the widget. The
  // unread count (js/notification_page.js writes ucp_notif_unread) badges the
  // dashboard section head.

  function injectSidebarItems() {
    const ul = document.querySelector('.menu_section ul');
    if (!ul) return;
    if (!document.querySelector('.ucp-shell-nav--settings')) {
      // Markup mirrors the portal's own items EXACTLY (.menu_icon / .menu_title
      // spans, same as Dashboard / Timetable / the injected Logout entry) so the
      // portal's own menu CSS sizes/fonts/colors them identically  no separate
      // font or text styling is applied to these entries.
      const makeItem = (cls, icon, label, which, title) => {
        const li = document.createElement('li');
        li.className = 'ucp-shell-nav ' + cls;
        li.setAttribute('title', title);
        li.innerHTML = `<a class="ucp-shell-nav-link" href="#"><span class="menu_icon"><i class="material-icons">${icon}</i></span><span class="menu_title">${label}</span></a>`;
        li.querySelector('.ucp-shell-nav-link').addEventListener('click', (e) => { e.preventDefault(); openShell(which); });
        return li;
      };

      const settingsLi = makeItem('ucp-shell-nav--settings', 'settings', 'Settings', 'settings', 'Extension Settings');

      const logout = document.querySelector('.logout-btn');
      if (logout && logout.parentElement === ul) {
        ul.insertBefore(settingsLi, logout);
      } else {
        ul.appendChild(settingsLi);
      }
    }

    // About Extension: bottom of the sidebar. Shows the installed version,
    // the project links (GitHub = current dev version, Chrome Web Store = the
    // older store version, Firefox = coming soon) and the tagline. Clicking
    // anywhere EXCEPT a real link opens Settings scrolled to the credits
    // card (#ucp-shell-credits).
    const sidebar = document.getElementById('sidebar_main');
    if (sidebar && !sidebar.querySelector('#ucp-sidebar-credits')) {
      const sc = document.createElement('div');
      sc.className = 'ucp-sidebar-credits';
      sc.id = 'ucp-sidebar-credits';
      sc.title = 'About the extension opens Settings';
      let extVersion = '';
      try { extVersion = chrome.runtime.getManifest().version; } catch (e) {}
      sc.innerHTML = `
        <div class="ucp-sidebar-credits-title">About Extension</div>
        <div class="ucp-sidebar-credits-version">UCP Smart Portal v${extVersion || 'dev'}</div>
        <div class="ucp-sidebar-credits-links">
          <a href="https://github.com/bakrx12/UCP-Smart-Portal" target="_blank" rel="noopener">GitHub</a>
          <!-- store search: the unpacked/dev build is the current one; the
               store listing is the older version (swap in the exact item URL
               if the listing ever changes) -->
          <a href="https://chromewebstore.google.com/search/UCP%20Smart%20Portal" target="_blank" rel="noopener" title="Older (store) version">Chrome Extension</a>
          <a class="ucp-sidebar-credits-soon" href="#" title="Coming soon">Firefox</a>
        </div>
      `;
      sc.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (a) {
          if (a.classList.contains('ucp-sidebar-credits-soon')) { e.preventDefault(); return; }
          return; // a real link  let it open in a new tab
        }
        e.preventDefault();
        openShell('settings');
        setTimeout(() => {
          const el = document.getElementById('ucp-shell-credits');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 120);
      });
      sidebar.appendChild(sc);
    }
  }

  // SIGNED-IN LABEL

  function injectSignedInAs() {
    try {
      const header = document.querySelector('#sidebar_main .sidebar_main_header');
      if (!header) return false;
      if (header.querySelector('.ucp-signed-in')) return true; // already done
      const label = document.createElement('span');
      label.className = 'ucp-signed-in';
      label.textContent = 'Signed in as';
      const avatar = header.querySelector('img');
      if (!avatar) {
        header.insertBefore(label, header.firstChild);
        return true;
      }
      // Hide the WHOLE placeholder, not just the <img>: the photo usually sits
      // inside a fixed-size frame (.user-image / .avatar / nested wrappers) that
      // keeps showing as an empty box once the image is gone. Walk up from the
      // image through any text-less ancestors (stopping at the header, or at the
      // first ancestor that carries the student's name) and hide the outermost
      // one  that removes every nested frame at once. Hiding a wrapper that
      // still holds text is avoided so the name is never taken out with the box.
      let target = avatar;
      let parent = avatar.parentElement;
      while (parent && parent !== header && !parent.textContent.trim()) {
        target = parent;
        parent = parent.parentElement;
      }
      target.style.display = 'none';
      target.insertAdjacentElement('beforebegin', label); // take the photo's spot
      return true;
    } catch (e) { return false; }
  }
  // The sidebar header (and its avatar) can render a beat after the page is
  // ready on some routes, so retry a handful of times if it isn't there yet.
  function scheduleSignedInAs(attempt) {
    if (injectSignedInAs()) return;
    if (attempt > 10) return;
    setTimeout(() => scheduleSignedInAs(attempt + 1), 50);
  }
  function scheduleSidebarItems(attempt) {
    injectSidebarItems();
    if (attempt > 10) return;
    setTimeout(() => scheduleSidebarItems(attempt + 1), 100);
  }

  // SIDEBAR ACTIVE COLOR (night mode)
  // Read the red the portal itself paints on the open section's items and
  // expose it as --ucp-active-red, so the selected top-level item can show
  // the SAME red at night even when the portal only styles the expanded
  // sub-items. Day mode is untouched (the CSS var is only used under
  // body.ucp-night).

  function syncActiveRed() {
    const ul = document.querySelector('#sidebar_main .menu_section ul');
    if (!ul) return;
    const els = ul.querySelectorAll('li.current_section a, li.current_section a *');
    for (const el of els) {
      let c;
      try { c = getComputedStyle(el).color; } catch (e) { continue; }
      const m = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(c);
      if (!m) continue;
      const r = +m[1], g = +m[2], b = +m[3];
      // A clearly reddish ink (red-dominant, low green/blue) = the portal's
      // active highlight, e.g. #ef4444 / #e74c3c / crimson.
      if (r >= 150 && g <= 120 && b <= 120) {
        document.body.style.setProperty('--ucp-active-red', c);
        return;
      }
    }
  }

  // 
  // PAGE FRAME  the shell's pages render INTO #page_content (the portal's
  // content column) so the sidebar + wallpaper stay visible, exactly like
  // the dashboard / profile pages. Opening a page hides the portal's own
  // page content; its children's display values are saved and restored on
  // close. (If #page_content is absent, the root falls back to <body> and
  // nothing is hidden.)
  // 
  function contentHost() {
    return document.getElementById('page_content') || document.body;
  }
  function ensurePageRoot() {
    let root = byId('ucp-shell-root');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'ucp-shell-root';
    root.hidden = true;
    contentHost().appendChild(root);
    return root;
  }
  function hideOriginalContent() {
    if (originalContent) return;
    const host = contentHost();
    if (host === document.body) return; // no content column  nothing to hide
    const root = ensurePageRoot();
    originalContent = [];
    Array.from(host.children).forEach((child) => {
      if (child === root) return;
      originalContent.push([child, child.style.display]);
      child.style.display = 'none';
    });
  }
  function restoreOriginalContent() {
    if (!originalContent) return;
    originalContent.forEach(([child, disp]) => {
      if (disp === '') child.style.removeProperty('display');
      else child.style.display = disp;
    });
    originalContent = null;
  }
  function setSidebarActive(which, on) {
    const sel = which === 'notif' ? '.ucp-shell-nav--notif' : '.ucp-shell-nav--settings';
    const li = document.querySelector(sel);
    if (li) li.classList.toggle('current_section', on);
  }


  // OPEN / CLOSE + history (own URLs)
  function openShell(which) {
    ensureMaterialIcons();
    const root = ensurePageRoot();
    hideOriginalContent();
    root.hidden = false;
    root.innerHTML = '';

    // The page's own script builds the header + content (its CSS is loaded
    // by the page script itself). Both are plain objects in this same
    // isolated world  no cross-world messaging needed.
    const page = (which === 'settings') ? window.__ucpSettingsPage : window.__ucpNotifPage;
    if (page && typeof page.render === 'function') {
      try { page.render(root); } catch (e) { console.warn('UCP shell: page render failed', e); }
    }

    setSidebarActive(which, true);

    // Give the page its own URL  but only when it's not already there (a
    // Back-into-the-page via popstate must not stack duplicate entries).
    if (!history.state || history.state.ucpShellPage !== which) {
      history.pushState({ ucpShellPage: which }, '', PAGE_URLS[which]);
    }
  }
  function closeShell() {
    // Revert any UNsaved Settings previews so a preview (night mode, blur,
    // wallpaper…) doesn't leak onto the portal page the user returns to.
    if (window.__ucpSettingsPage && typeof window.__ucpSettingsPage.revertPending === 'function') {
      try { window.__ucpSettingsPage.revertPending(); } catch (e) {}
    }
    const root = byId('ucp-shell-root');
    if (root) root.hidden = true;
    restoreOriginalContent();
    setSidebarActive('notif', false);
    setSidebarActive('settings', false);
    // Unwind the pushed URL (Back button / history).
    if (history.state && history.state.ucpShellPage) {
      history.back();
    } else if (location.pathname === PAGE_URLS.settings || location.pathname === PAGE_URLS.notif) {
      // The page was loaded directly (or the tab was refreshed ON the pushed
      // URL). history.back() is NOT reliable here: a refresh pushes another
      // copy of the same settings/notifications URL, so Back would just land
      // on the shell page again (it appears to do nothing). Leave straight
      // for the portal home instead.
      location.href = BASE + '/student/dashboard';
    }
  }

  document.addEventListener('popstate', () => {
    const which = history.state && history.state.ucpShellPage;
    if (which === 'settings' || which === 'notif') {
      openShell(which); // state already matches → no duplicate pushState
    } else {
      const root = byId('ucp-shell-root');
      if (root && !root.hidden) root.hidden = true;
      restoreOriginalContent();
      setSidebarActive('notif', false);
      setSidebarActive('settings', false);
    }
  });

  document.addEventListener('keydown', (e) => {
    const r = byId('ucp-shell-root');
    if (e.key === 'Escape' && r && !r.hidden) closeShell();
  });

  // The pages' own "Back" buttons call this (same isolated world).
  window.__ucpShellClose = closeShell;
  // Public open hook for other content scripts (e.g. the scan-bar
  // "Notifications" label on the notifications page)  same isolated world.
  window.__ucpShellOpen = (which) => {
    if (which !== 'settings' && which !== 'notif') return;
    try { openShell(which); } catch (e) {}
  };

  // 
  // init
  // 
  (function init() {
    ensureConsoleFilter();
    ensureMaterialIcons();
    scheduleSidebarItems(1);
    scheduleSignedInAs(1);
    syncActiveRed();
    initPrefs();
  })();
});
