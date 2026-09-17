//UCP Smart Portal  Notification PAGE

chrome.storage.local.get('toggle_power', (result) => {
  if (!result || !result['toggle_power']) return;

  const BASE = 'https://horizon.ucp.edu.pk';
  const SNAP_KEY = 'ucp_course_snapshots_v1';
  // Course updates are PERSISTED (1C) so the feed survives a reload; everything
  // else in this widget is fetched live and never written to storage.
  const UPD_KEY = 'ucp_course_updates';
  const COURSE_UPDATES_PAGE_SIZE = 6;
  let courseUpdatesItems = [];
  let courseUpdatesShown = 0;
  let scanning = false;

  // Course-updates scan bar
  const FILTER_KEY = 'ucp_notif_course_filter';
  
  const PUSH_KEY = 'ucp_push_notify';
  const INSTANT_KEY = 'ucp_instant_push';
  // The scan-bar quick toggle re-enables the LAST-USED mode when flipped ON
  // (Settings → Notifications writes it; 'push' | 'instant').
  const LAST_MODE_KEY = 'ucp_notif_last_mode';
  // SEEN  last "Mark all as read" per feed; an item is unread while its
  // detected-at timestamp (it.at, set when the scan first finds it) is newer.
  const SEEN_KEY = 'ucp_notif_seen';
  // UNREAD  the unread count, written so js/shell.js can badge the sidebar
  // "Notification" entry on every page (the widget itself isn't present
  // everywhere).
  const UNREAD_KEY = 'ucp_notif_unread';
  // ACADEMIC CALENDAR  which terms' "previous activities" were expanded.
  // term-name → true; the initial render re-applies the saved expansion so
  // past items stay greyed/revealed exactly where the user left them.
  const ACAD_EXPANDED_KEY = 'ucp_acad_expanded_terms';
  let acadExpanded = {};
  let courseFilter = 'all';
  let seenCoursesAt = 0; // ms  items detected after this are unread

  // helpers
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"'`=\/]/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
      "'": '&#39;', '`': '&#x60;', '=': '&#x3D;', '/': '&#x2F;',
    }[c]));
  }
  function parseHtml(html) { return new DOMParser().parseFromString(html, 'text/html'); }
  function byId(id) { return document.getElementById(id); }
  function ensureMaterialIcons() {
    if (byId('ucp-shell-icons')) return;
    const l = document.createElement('link');
    l.id = 'ucp-shell-icons';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
    document.head.appendChild(l);
  }
  // Page stylesheet (shared frame/card rules already come from shell.css).
  function ensurePageCss() {
    if (byId('ucp-shell-notif-css')) return;
    const l = document.createElement('link');
    l.id = 'ucp-shell-notif-css';
    l.rel = 'stylesheet';
    try { l.href = chrome.runtime.getURL('styles/notification_page.css'); } catch (e) { return; }
    document.head.appendChild(l);
  }
  // Widget stylesheet  the embeddable Course Updates / UCP Notification widget
  // styles (tabs, scan bar, feed, placeholder). Shared by BOTH the standalone
  // page (below) and the dashboard "Notification & Updates" section
  // (js/student_dashboard.js). Loaded separately from ensurePageCss() because
  // the dashboard must NOT pull in notification_page.css's page-level rules
  // (e.g. #page_content { background: transparent }), only the widget's.
  function ensureWidgetCss() {
    if (byId('ucp-shell-notif-widget-css')) return;
    const l = document.createElement('link');
    l.id = 'ucp-shell-notif-widget-css';
    l.rel = 'stylesheet';
    try { l.href = chrome.runtime.getURL('styles/notification_widget.css'); } catch (e) { return; }
    document.head.appendChild(l);
  }

  // ACCENT-COLOR MODE (set in Settings → Background; ON by default)
  // The color is sampled + cached by js/shell.js (every page) /
  // js/settings_page.js. On render, restore the cached tint so this page's
  // icons/headings pick it up too (body class + --ucp-accent, read by
  // styles/notification_page.css).
  const ACCENT_KEY = 'ucp_bg_accent';
  const ACCENT_COLOR_KEY = 'ucp_bg_accent_color';
  // ON unless explicitly turned off (missing value = on).
  const accentOn = (v) => (v === undefined || v === null) ? true : !!v;
  function applyAccent() {
    try {
      chrome.storage.local.get([ACCENT_KEY, ACCENT_COLOR_KEY], (r) => {
        if (!r || !accentOn(r[ACCENT_KEY]) || !r[ACCENT_COLOR_KEY]) return;
        document.body.style.setProperty('--ucp-accent', `rgb(${r[ACCENT_COLOR_KEY]})`);
        document.body.classList.add('ucp-bg-accent');
      });
    } catch (e) {}
  }
  function clearAccent() {
    try {
      document.body.classList.remove('ucp-bg-accent');
      document.body.style.removeProperty('--ucp-accent');
    } catch (e) {}
  }
  try {
    // Keep the tint in sync if the mode is switched in another tab / page.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[ACCENT_KEY]) return;
      if (accentOn(changes[ACCENT_KEY].newValue)) applyAccent();
      else clearAccent();
    });
    // Cross-tab sync of the widget's own prefs: a filter / push / read-state
    // change made in ANOTHER tab repaints this tab's widget (when it's
    // present there). renderCourseUpdates also rewrites UNREAD_KEY, but that
    // key is not watched here, so there is no loop.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[FILTER_KEY]) syncFilterUi(changes[FILTER_KEY].newValue || 'all');
      if (changes[PUSH_KEY]) {
        setPushUi(!!changes[PUSH_KEY].newValue);
        // Enabled from the Settings page (or another tab) → run the first
        // check here right away instead of waiting for the next alarm tick.
        if (changes[PUSH_KEY].newValue) { try { scanCourses(); } catch (e) {} }
      }
      if (changes[SEEN_KEY]) {
        const v = changes[SEEN_KEY].newValue && changes[SEEN_KEY].newValue.courses;
        seenCoursesAt = v ? (Date.parse(v) || 0) : 0;
        renderCourseUpdates(); // dots + badges follow the new read state
      }
    });
  } catch (e) {}

  // The service worker's Instant-Push alarm pings ONE open portal tab to run
  // the scan in the background (the parsing lives here, not in the SW). ANY
  // /student page answers: the scan + storage merge work with or without the
  // widget on screen, and the feed / badges update if this tab happens to
  // show them. (The whole module is gated on toggle_power, so power-off means

  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === 'UCP_PUSH_SCAN') {
        scanCourses();
        sendResponse({ ok: true });
      }
    });
  } catch (e) {}

  // WIDGET MARKUP  the embeddable Course Updates / UCP Notification widget
  // (tabs + both tabpanels). Wrapped in .ucp-notif-widget so the shared widget
  // CSS (styles/notification_widget.css) can scope its night/accent icon
  // rules. Reused by BOTH the standalone page (buildPageHtml) and the
  // dashboard "Notification & Updates" section (embed).
  const widgetHtml = `
    <div class="ucp-notif-widget">
      <div class="ucp-shell-card ucp-shell-notif-head">
        <div class="ucp-shell-tabs" id="ucp-shell-tabs">
          <div class="ucp-shell-tab ucp-shell-tab-active" data-tab="ucp-shell-notif-acad">
            <span class="material-icons">calendar_month</span> Academic Calendar
          </div>
          <div class="ucp-shell-tab" data-tab="ucp-shell-notif-news">
            <span class="material-icons">newspaper</span> Portal News
          </div>
          <div class="ucp-shell-tab" data-tab="ucp-shell-notif-courses">
            <span class="material-icons">campaign</span> Course Updates
            <span class="ucp-notif-badge" id="ucp-shell-courseUnread" hidden></span>
          </div>
          <div class="ucp-shell-tab" data-tab="ucp-shell-notif-ucp">
            <span class="material-icons">category</span> Miscellaneous
          </div>
          <div class="ucp-shell-tab" data-tab="ucp-shell-notif-ucptoday">
            <span class="material-icons">rss_feed</span> UCP Feed
          </div>
          <div class="ucp-shell-tab-indicator" id="ucp-shell-tab-indicator"></div>
        </div>
      </div>

      <div class="ucp-shell-tabpanel ucp-shell-tab-active" id="ucp-shell-notif-acad">
        <div class="ucp-shell-card">
          <div class="ucp-shell-acad-mini" id="ucp-shell-acad-mini"></div>
          <div class="ucp-shell-feed" id="ucp-shell-acad-feed"></div>
        </div>
      </div>

      <div class="ucp-shell-tabpanel" id="ucp-shell-notif-news">
        <div class="ucp-shell-card">
          <div class="ucp-shell-scan-bar">
            <button class="ucp-shell-btn ucp-shell-refresh-btn" id="ucp-shell-newsRefresh" type="button">
              <span class="material-icons">refresh</span>
              <span class="ucp-shell-refresh-col">
                <span class="ucp-shell-refresh-title">Refresh</span>
                <span class="ucp-shell-refresh-status" id="ucp-shell-newsStatus"></span>
              </span>
            </button>
          </div>
          <div class="ucp-shell-feed" id="ucp-shell-news-feed"></div>
        </div>
      </div>

      <div class="ucp-shell-tabpanel" id="ucp-shell-notif-courses">
        <div class="ucp-shell-card">
          <div class="ucp-shell-scan-bar">
            <!-- Scan now  LEFT end of the scan bar. Two lines (title +
                 transient status). -->
            <button class="ucp-shell-btn ucp-shell-btn-primary ucp-shell-refresh-btn" id="ucp-shell-scanBtn" type="button">
              <span class="material-icons">refresh</span>
              <span class="ucp-shell-refresh-col">
                <span class="ucp-shell-refresh-title">Scan now</span>
                <span class="ucp-shell-refresh-status" id="ucp-shell-scanStatus"></span>
              </span>
            </button>
            <!-- Type filter: which update types the scan REPORTS (feed + push).
                 CENTERED between Scan now (left) and the Notifications block
                 (right) via margin:auto on both sides. Static control in the
                 scan bar (never re-created), so a direct click listener works
                  same as the Refresh buttons. All = the default; the stored
                 value survives reloads (ucp_notif_course_filter). -->
            <div class="ucp-wseg ucp-shell-scan-filter" id="ucp-shell-courseFilter" role="radiogroup" aria-label="Update types to check">
              <div class="ucp-wseg-opt is-on" data-cfilter="all" role="radio" aria-checked="true" tabindex="0">All</div>
              <div class="ucp-wseg-opt" data-cfilter="submission" role="radio" aria-checked="false" tabindex="0">Submissions</div>
              <div class="ucp-wseg-opt" data-cfilter="content" role="radio" aria-checked="false" tabindex="0">Content</div>
              <div class="ucp-wseg-opt" data-cfilter="grade" role="radio" aria-checked="false" tabindex="0">Grades</div>
            </div>
            <!-- Unread state: shown only while items are unread. -->
            <button class="ucp-shell-btn ucp-wmark" id="ucp-shell-markRead" type="button" hidden>
              <span class="material-icons">done_all</span> Mark all as read
            </button>
            <!-- Notifications  RIGHT end (margin-left:auto). The quick on/off
                 for the background course-update checks. The SWITCH is a real
                 quick-toggle: ON re-enables the last-used mode (Push, when the
                 mode was never chosen in Settings  ucp_notif_last_mode) and
                 OFF disables ALL checks. Clicking the LABEL (not the switch)
                 opens Settings scrolled to the Notifications card, where
                 Off / Push / Instant Push is chosen. The switch is a plain
                 div with role="switch" (NO role="button"  the portal's
                 aarsol bundle swallows that markup); the label is tabindex=0
                 with Enter/Space for the keyboard path. -->
            <div class="ucp-push" id="ucp-shell-pushWrap" title="Background course-update checks  click the label to open Settings">
              <div class="ucp-push-col">
                <span class="ucp-push-title ucp-push-link" id="ucp-shell-pushLabel" tabindex="0">Notifications</span>
                <span class="ucp-push-state" id="ucp-shell-pushState">OFF</span>
                <span class="ucp-push-status" id="ucp-shell-pushStatus"></span>
              </div>
              <div class="ucp-push-switch" id="ucp-shell-pushToggle" role="switch" aria-checked="false" tabindex="0"><div class="ucp-push-thumb"></div></div>
            </div>
          </div>
          <div class="ucp-shell-feed" id="ucp-shell-feed"></div>
          <div class="ucp-shell-loadmore-bar">
            <button class="ucp-shell-btn ucp-shell-loadmore-btn" id="ucp-shell-courseLoadMore" type="button" hidden>
              <span class="material-icons">unfold_more</span> Load more
            </button>
          </div>
        </div>
      </div>

      <div class="ucp-shell-tabpanel" id="ucp-shell-notif-ucp">
        <div class="ucp-shell-card">
          <div class="ucp-shell-feed" id="ucp-shell-ucp-feed"></div>
        </div>
      </div>

      <div class="ucp-shell-tabpanel" id="ucp-shell-notif-ucptoday">
        <div class="ucp-shell-card">
          <div class="ucp-shell-scan-bar">
            <button class="ucp-shell-btn ucp-shell-refresh-btn" id="ucp-shell-ucpTodayRefresh" type="button">
              <span class="material-icons">refresh</span>
              <span class="ucp-shell-refresh-col">
                <span class="ucp-shell-refresh-title">Refresh</span>
                <span class="ucp-shell-refresh-status" id="ucp-shell-ucpTodayStatus"></span>
              </span>
            </button>
          </div>
          <div class="ucp-shell-feed ucp-shell-ucptoday-feed" id="ucp-shell-ucpToday-feed"></div>
          <div class="ucp-shell-loadmore-bar">
            <button class="ucp-shell-btn ucp-shell-loadmore-btn" id="ucp-shell-ucpTodayLoadMore" type="button" hidden>
              <span class="material-icons">unfold_more</span> Load more
            </button>
          </div>
        </div>
      </div>
    </div>`;

  // The standalone page frame: a page header (title + a compact print action
  // docked at the RIGHT end of the row  the title's flex:1 leaves it room)
  // + the shared widget.
  const buildPageHtml = () => `
    <div class="ucp-shell-page">
      <header class="ucp-shell-page-header">
        <h1 class="ucp-shell-page-title">Notification &amp; Updates</h1>
        <button class="ucp-shell-page-print" id="ucp-shell-pagePrint" type="button" title="Print this page" aria-label="Print this page">
          <span class="material-icons" aria-hidden="true">print</span>
        </button>
      </header>
      ${widgetHtml}
    </div>`;

  // wireWidget(root)  tab switching, the "Scan now" button, and the
  // automatic first scan. Takes the widget's root element so it works for BOTH
  // the standalone page and the embedded dashboard section. (The feed / status
  // / scan-button ids are document-global by design: only one widget ever
  // exists in a given document  the standalone page is a different URL from
  // the dashboard.)
  function wireWidget(root, opts) {
    // The index passed to setShellView is the position among the VISIBLE tabs
    // (Settings can hide some of the five), so compute it at click time from
    // the live .ucp-shell-tab-hidden state rather than a fixed DOM order.
    Array.from(root.querySelectorAll('#ucp-shell-tabs .ucp-shell-tab')).forEach((tab) =>
      tab.addEventListener('click', () => {
        const tabs = Array.from(root.querySelectorAll('#ucp-shell-tabs .ucp-shell-tab'))
          .filter((t) => !t.classList.contains('ucp-shell-tab-hidden'));
        setShellView(tabs.indexOf(tab));
      }));

    const scanBtn = root.querySelector('#ucp-shell-scanBtn');
    if (scanBtn) scanBtn.addEventListener('click', () => {
      const f = byId('ucp-shell-feed'); if (f) f.dataset.initialized = '1';
      scanCourses();
    });

    // Type filter (All / Submissions / Content / Grades)  static segment in
    // the scan bar, direct listeners (as above).
    root.querySelectorAll('#ucp-shell-courseFilter .ucp-wseg-opt').forEach((o) =>
      o.addEventListener('click', () => setCourseFilter(o.dataset.cfilter)));

    // Instant Push quick-toggle (site-permission gated  see togglePush()).
    const pushToggle = root.querySelector('#ucp-shell-pushToggle');
    if (pushToggle) pushToggle.addEventListener('click', togglePush);

    // The "Notifications" LABEL opens Settings scrolled to the Notifications
    // card (the mode choice lives there); the switch beside it is the quick
    // on/off. Keyboard: the label is tabindex=0, Enter/Space = the same.
    const pushLabel = root.querySelector('#ucp-shell-pushLabel');
    if (pushLabel) {
      const openNotifSettings = () => {
        if (typeof window.__ucpShellOpen === 'function') {
          window.__ucpShellOpen('settings');
          setTimeout(() => {
            const el = document.getElementById('ucp-shell-notifSettingsBlock');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 150);
        }
      };
      pushLabel.addEventListener('click', (e) => { e.preventDefault(); openNotifSettings(); });
      pushLabel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNotifSettings(); }
      });
    }

    // "Mark all as read" (shown only while items are unread).
    const markReadBtn = root.querySelector('#ucp-shell-markRead');
    if (markReadBtn) markReadBtn.addEventListener('click', markAllRead);

    // Restore the widget's own prefs (filter + push state) so a reload shows
    // the stored choices, not the markup defaults. The switch is ON when
    // EITHER check runs (Push = tab scan, Instant = worker scan).
    try {
      chrome.storage.local.get([FILTER_KEY, PUSH_KEY, INSTANT_KEY], (r) => {
        if (!r) return;
        syncFilterUi(r[FILTER_KEY] || 'all');
        setPushUi(!!(r[PUSH_KEY] || r[INSTANT_KEY]));
      });
    } catch (e) {}
    // Mode changed from Settings while this widget is mounted (the shell
    // hides the widget's page but its listeners stay alive)  repaint.
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || (!changes[PUSH_KEY] && !changes[INSTANT_KEY])) return;
        chrome.storage.local.get([PUSH_KEY, INSTANT_KEY], (r) => {
          setPushUi(!!(r && (r[PUSH_KEY] || r[INSTANT_KEY])));
        });
      });
    } catch (e) {}

    // Portal News: the two-line "Refresh" button re-reads the live
    // "News and Announcement" section. (Static button  a direct listener is
    // fine; it is NOT re-created on re-render.)
    const newsRefresh = root.querySelector('#ucp-shell-newsRefresh');
    if (newsRefresh) newsRefresh.addEventListener('click', () => fetchPortalNews(true));

    // UCP News: the "Refresh" button re-fetches ucp.edu.pk/ucp-today (cross-origin
    // via the service worker); "Load more" reveals the next batch of cards. Both
    // are static (in the panel's scan-bar / load-more bar  never re-created by
    // render), so direct listeners are fine. The tab itself fetches only on open
    // (see setShellView), so nothing loads until the user clicks it.
    const ucpTodayRefresh = root.querySelector('#ucp-shell-ucpTodayRefresh');
    if (ucpTodayRefresh) ucpTodayRefresh.addEventListener('click', () => fetchUcpToday(true));
    const ucpTodayLoadMore = root.querySelector('#ucp-shell-ucpTodayLoadMore');
    if (ucpTodayLoadMore) ucpTodayLoadMore.addEventListener('click', () => showMoreUcpToday());

    // Course Updates "Load more" reveals the next batch of persisted updates.
    const courseLoadMore = root.querySelector('#ucp-shell-courseLoadMore');
    if (courseLoadMore) courseLoadMore.addEventListener('click', () => showMoreCourseUpdates());

    // Academic Calendar: the "Refresh" button lives INSIDE the Next-up mini-card
    // and is re-created on every render, so delegate on the stable panel  a
    // direct listener would bind to the first button only. It forces a live
    // re-fetch (bypassing the date-based auto-refresh gate). The same delegated
    // handler also covers the ongoing-term collapse toggle below it.
    const acadPanel = root.querySelector('#ucp-shell-notif-acad');
    if (acadPanel) acadPanel.addEventListener('click', (e) => {
      if (e.target.closest('#ucp-shell-acadRefresh')) { renderAcademicCalendar(true); return; }
      const toggle = e.target.closest('.ucp-acad-toggle');
      if (!toggle) return;
      const term = toggle.closest('.ucp-acad-term');
      if (!term) return;
      const expanded = term.classList.toggle('is-expanded');
      toggle.classList.toggle('is-expanded', expanded);
      const label = toggle.querySelector('.ucp-acad-toggle-label');
      const icon = toggle.querySelector('.material-icons');
      if (label) label.textContent = expanded ? 'Hide previous activities' : 'Show previous activities';
      if (icon) icon.textContent = expanded ? 'expand_less' : 'expand_more';
      // Remember the expansion (term name → true) so the next render 
      // including the first paint after a reload  greys/reveals the past
      // items exactly where the user left them.
      const termName = term.dataset.acadTerm;
      if (termName != null) {
        if (expanded) acadExpanded[termName] = true;
        else delete acadExpanded[termName];
        try {
          const snapshot = Object.assign({}, acadExpanded);
          chrome.storage.local.set({ [ACAD_EXPANDED_KEY]: snapshot });
        } catch (e2) {}
      }
    });

    // Show any persisted course updates immediately (paginated 6 at a time),
    // then kick off the first scan (which merges in anything newer). The
    // read-state (SEEN_KEY) is loaded first so the unread dots / badges are
    // correct on the very first paint (not one render late).
    const feed = root.querySelector('#ucp-shell-feed');
    if (feed && !feed.dataset.initialized) {
      feed.dataset.initialized = '1';
      Promise.all([loadStoredUpdates(), loadSeen()]).then((res) => {
        courseUpdatesItems = res[0];
        courseUpdatesShown = COURSE_UPDATES_PAGE_SIZE;
        renderCourseUpdates();
      });
      scanCourses();
    }

    // Default view: the user's saved default tab (Settings → Dashboard items →
    // "Notification widget · tabs"), falling back to the first visible tab.
    // applyNotifTabPrefs also hides any disabled tabs, sizes the sliding
    // indicator to the visible count, and calls setShellView()  which
    // populates the default tab on load (the Academic Calendar Next-up card +
    // feed when it is the default; the other tabs refresh on open as before).
    //
    // The DASHBOARD embed forces ONE live calendar refresh here so the calendar
    // is fresh the moment the dashboard loads (not the possibly-stale cache) 
    // only meaningful when the default tab IS the Academic Calendar.
    applyNotifTabPrefs(root, !!(opts && opts.forceAcad));
  }

  // render(container)  the standalone page, called by shell.js (and on a
  // direct load of /student/notifications). Rebuilds the page fresh.
  function render(container) {
    ensureMaterialIcons();
    ensureWidgetCss();
    ensurePageCss();
    applyAccent(); // restore the cached tint (if the accent mode is on)
    container.innerHTML = buildPageHtml();
    // Page-header print action (standalone page only  the dashboard embed
    // has no page header). Plain <button> + addEventListener: the reliable
    // path (no role="button" markup, so the portal's click interceptor
    // never sees it).
    const printBtn = container.querySelector('#ucp-shell-pagePrint');
    if (printBtn) printBtn.addEventListener('click', () => { window.print(); });
    wireWidget(container);
  }

  // embed(container)  the widget only, for the dashboard "Notification &
  // Updates" section (js/student_dashboard.js). Loads ONLY the widget
  // stylesheet (never notification_page.css, whose page-level rules would
  // restyle the dashboard's #page_content / body) and skips the page header.
  function embed(container) {
    ensureMaterialIcons();
    ensureWidgetCss();
    applyAccent();
    container.innerHTML = widgetHtml;
    // Force a one-time live calendar refresh on dashboard load (see wireWidget).
    wireWidget(container, { forceAcad: true });
  }
  window.__ucpNotifPage = { render, embed };

  // TAB VISIBILITY + DEFAULT TAB  driven by the Settings page ("Dashboard
  // items" → "Notification widget · tabs"). Prefs live in
  // chrome.storage.local under ucp_notif_tabs as
  //   { default: <original index 0-4>, tabs: { <original index>: bool } }
  // A missing key = all five tabs ON and the default is the Academic Calendar
  // (index 0)  the original behavior. `index` everywhere in this widget is a
  // POSITION AMONG THE VISIBLE TABS; the panels are mapped back to the original
  // index (the tab order in the DOM is fixed, so indexOf is the mapping).
  const NOTIF_PREFS_KEY = 'ucp_notif_tabs';
  const NOTIF_PANEL_IDS = [
    'ucp-shell-notif-acad',
    'ucp-shell-notif-news',
    'ucp-shell-notif-courses',
    'ucp-shell-notif-ucp',
    'ucp-shell-notif-ucptoday',
  ];
  function setShellView(index, opts) {
    const allTabs = Array.from(document.querySelectorAll('#ucp-shell-tabs .ucp-shell-tab'));
    const tabs = allTabs.filter((t) => !t.classList.contains('ucp-shell-tab-hidden'));
    const indicator = byId('ucp-shell-tab-indicator');
    tabs.forEach((t, i) => t.classList.toggle('ucp-shell-tab-active', i === index));
    const origIndex = (index >= 0 && index < tabs.length)
      ? allTabs.indexOf(tabs[index])
      : -1;
    NOTIF_PANEL_IDS.forEach((id, oi) => {
      const p = byId(id);
      if (p) p.classList.toggle('ucp-shell-tab-active', oi === origIndex);
    });
    if (indicator) indicator.style.transform = `translateX(${index * 100}%)`;
    // Each live tab refreshes on open: Academic Calendar (0) is lazy-loaded from
    // ucp.edu.pk (date-gated cache in js/academic_calendar.js  the only cached tab);
    // Portal News (1) re-reads the live "News and Announcement" section;
    // Miscellaneous (3) re-fetches the ucp-news feed; UCP Feed (4) re-fetches
    // ucp.edu.pk/announcement (only on click, never cached).
    if (origIndex === 0) renderAcademicCalendar(!!(opts && opts.forceAcad));
    if (origIndex === 1) fetchPortalNews();
    if (origIndex === 3) fetchUcpNews();
    if (origIndex === 4) fetchUcpToday();
  }
  // Read the stored prefs, hide the disabled tabs, size the indicator to the
  // visible count, then open the default tab (the stored one if it is visible,
  // else the first visible tab). forceAcad only matters when the default IS
  // the Academic Calendar (dashboard embed's one-time live refresh).
  function applyNotifTabPrefs(root, forceAcad) {
    const all = Array.from(root.querySelectorAll('#ucp-shell-tabs .ucp-shell-tab'));
    const tabBar = root.querySelector('#ucp-shell-tabs');
    const paint = (s) => {
      s = s || {};
      const tabsState = s.tabs || {};
      const enabled = all.map((_, i) => tabsState[i] === undefined ? true : !!tabsState[i]);
      // All tabs disabled → the widget would be empty; show everything instead.
      if (enabled.every((v) => !v)) enabled.fill(true);
      all.forEach((t, i) => t.classList.toggle('ucp-shell-tab-hidden', !enabled[i]));
      if (tabBar) tabBar.style.setProperty('--n', String(enabled.filter(Boolean).length));
      const origDefault = (() => {
        const d = Number(s.default);
        return (isFinite(d) && d >= 0 && d < all.length) ? d : 0;
      })();
      const visibleOrigs = all.map((_, i) => i).filter((i) => enabled[i]);
      const pos = Math.max(0, visibleOrigs.indexOf(origDefault));
      setShellView(pos, { forceAcad: !!forceAcad && origDefault === 0 });
    };
    try {
      chrome.storage.local.get(NOTIF_PREFS_KEY, (r) => paint((r && r[NOTIF_PREFS_KEY]) || {}));
    } catch (e) { paint({}); } // stale extension context → default layout
  }

  // COURSE UPDATES  scanner (moved in from shell.js)
  //Quiet portal-page fetch
  // Runs in the SERVICE WORKER (GET_PORTAL_PAGE): when a gradebook 503s or a
  // page 404s the failure comes back as plain data  no "Failed to load
  // resource" line in the page console on every scan. A short negative cache
  // keeps a recently-failed page from being re-fetched at all.
  const failedScanFetches = new Map(); // url -> { status, ts }
  const scanFailTtlMs = (status) =>
    (status === 404 || status === 410) ? 30 * 60 * 1000
      : (status >= 500 ? 5 * 60 * 1000 : 10 * 60 * 1000);
  const scanFailCacheHit = (url) => {
    const f = failedScanFetches.get(url);
    if (!f) return false;
    if (Date.now() - f.ts < scanFailTtlMs(f.status)) return true;
    failedScanFetches.delete(url);
    return false;
  };
  async function fetchPage(path) {
    const url = location.origin + path;
    if (scanFailCacheHit(url)) return null;
    let text = null;
    try {
      if (chrome.runtime && chrome.runtime.id) {
        const resp = await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage({ type: 'GET_PORTAL_PAGE', url }, (r) => {
              resolve(chrome.runtime.lastError ? null : r);
            });
          } catch (e) { resolve(null); }
        });
        // status > 0 = the SW actually fetched it (ok or an HTTP error);
        // status 0 = network failure / refused answer → use the fallback.
        if (resp && typeof resp.ok === 'boolean' && resp.status > 0) {
          if (!resp.ok) failedScanFetches.set(url, { status: resp.status, ts: Date.now() });
          text = resp.ok ? resp.text : null;
        }
      }
    } catch (e) { /* stale extension context  fall through to a direct fetch */ }
    if (text === null) {
      try {
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) { failedScanFetches.set(url, { status: r.status, ts: Date.now() }); return null; }
        text = await r.text();
      } catch (e) { return null; }
    }
    return parseHtml(text);
  }
  async function getCourseList() {
    const doc = await fetchPage('/student/dashboard');
    if (!doc) return [];
    const courses = [];
    doc.querySelectorAll('div a > .card').forEach((container) => {
      try {
        const name = (container.children[0].textContent || '').trim();
        const codeEl = container.children[1] && container.children[1].children[1]
          ? container.children[1].children[1].children[0] : null;
        let code = codeEl ? codeEl.textContent.trim() : '';
        const link = container.parentElement.getAttribute('href') || '';
        if (!code && link) { const p = link.split('/'); if (p.length > 4) code = p[4]; }
        if (code) courses.push({ code, name, link });
      } catch (e) {}
    });
    return courses;
  }
  function extractSubmissions(doc, code) {
    const items = []; if (!doc) return items;
    doc.querySelectorAll('table tbody tr').forEach((row) => {
      const txt = row.textContent.toLowerCase();
      if (txt.includes('no submission uploaded')) return;
      const titleCell = row.querySelector('td.rec_submission_title') || row.querySelector('td');
      const title = titleCell ? titleCell.textContent.trim() : '';
      if (!title) return;
      items.push({ code, type: 'submission', icon: '📝', title, url: `/student/course/submission/${code}` });
    });
    return items;
  }
  function extractMaterials(doc, code) {
    const items = []; if (!doc) return items;
    doc.querySelectorAll('table.table_tree tbody tr').forEach((row) => {
      const cols = row.querySelectorAll('td');
      if (cols.length < 2) return;
      const title = (cols[1].textContent || '').trim();
      if (!title) return;
      items.push({ code, type: 'content', icon: '📄', title, url: `/student/course/material/${code}` });
    });
    return items;
  }
  function extractGrades(doc, code) {
    const items = []; if (!doc) return items;
    const table = doc.querySelector('table.table_tree') || doc.querySelector('table');
    if (!table) return items;
    table.querySelectorAll('tbody > tr').forEach((row) => {
      if (!row.classList.contains('table-child-row')) return;
      const tds = Array.from(row.querySelectorAll('td'));
      if (!tds.length) return;
      const label = (tds[0].textContent || '').trim();
      const value = (tds[tds.length - 1].textContent || '').trim();
      if (!label) return;
      items.push({ code, type: 'grade', icon: '🏆', title: label, value, url: `/student/course/gradebook/${code}` });
    });
    return items;
  }
  async function scanCourse(course) {
    const code = course.code;
    const out = { submissions: [], materials: [], grades: [] };
    out.submissions = extractSubmissions(await fetchPage(`/student/course/submission/${code}`), code);
    out.materials = extractMaterials(await fetchPage(`/student/course/material/${code}`), code);
    out.grades = extractGrades(await fetchPage(`/student/course/gradebook/${code}`), code);
    return out;
  }
  async function runPool(items, limit, fn) {
    const results = new Array(items.length);
    let i = 0;
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      while (i < items.length) {
        const idx = i++;
        try { results[idx] = await fn(items[idx], idx); } catch (e) { results[idx] = null; }
      }
    });
    await Promise.all(workers);
    return results;
  }
  function loadSnapshot() {
    return new Promise((resolve) => {
      try { chrome.storage.local.get(SNAP_KEY, (r) => resolve(r && r[SNAP_KEY] ? r[SNAP_KEY] : null)); }
      catch (e) { resolve(null); }
    });
  }
  function saveSnapshot(snap) { try { chrome.storage.local.set({ [SNAP_KEY]: snap }); } catch (e) {} }
  function diffCourse(code, current, snapshot) {
    const out = [];
    const prev = snapshot[code];
    if (!prev) return out; // first run = baseline
    const seenSub = new Set(prev.submissions || []);
    (current.submissions || []).forEach((it) => { if (!seenSub.has(it.title)) out.push(it); });
    const seenMat = new Set(prev.materials || []);
    (current.materials || []).forEach((it) => { if (!seenMat.has(it.title)) out.push(it); });
    const prevGrades = prev.grades || {};
    (current.grades || []).forEach((it) => { if (!(it.title in prevGrades) || prevGrades[it.title] !== it.value) out.push(it); });
    return out;
  }
  function toSnapshotEntry(current) {
    return {
      submissions: (current.submissions || []).map((i) => i.title),
      materials: (current.materials || []).map((i) => i.title),
      grades: Object.fromEntries((current.grades || []).map((i) => [i.title, i.value])),
      updatedAt: new Date().toISOString(),
    };
  }
  async function scanCourses() {
    if (scanning) return;
    scanning = true;
    const status = byId('ucp-shell-scanStatus');
    const feed = byId('ucp-shell-feed');
    if (status) status.textContent = 'Scanning your courses…';
    // Keep any persisted updates on screen during the scan; only show a spinner
    // when there's nothing to display yet.
    if (feed && !courseUpdatesItems.length) feed.innerHTML = feedStateHtml('loading');
    try {
      const courses = await getCourseList();
      if (!courses.length) {
        if (feed && !courseUpdatesItems.length) feed.innerHTML = feedStateHtml('empty', 'No courses found.');
        if (status) status.textContent = '';
        scanning = false;
        return;
      }
      const snapshot = (await loadSnapshot()) || {};
      const firstRun = Object.keys(snapshot).length === 0;
      const fresh = [];
      // The button's status line reports live per-course progress  the pool
      // runs up to 4 courses concurrently, so this ticks up as each resolves.
      let done = 0;
      const total = courses.length;
      await runPool(courses, 4, async (course) => {
        const current = await scanCourse(course);
        diffCourse(course.code, current, snapshot).forEach((it) => fresh.push(it));
        snapshot[course.code] = toSnapshotEntry(current);
        done += 1;
        if (status) status.textContent = `Checking ${done}/${total} courses for updates`;
        return current;
      });
      saveSnapshot(snapshot);
      // Merge the new deltas into the persisted updates list (dedup, newest
      // first), persist it, then render the paginated feed (6 at a time).
      // The merge base is the LATEST STORED list, not this tab's in-memory
      // view: a background Instant-Push scan can run in a tab where the widget
      // was never rendered (empty view)  merging against that would WIPE the
      // stored feed.
      if (fresh.length) {
        const stored = await loadStoredUpdates();
        const seen = new Set(stored.map(updKey));
        const nowIso = new Date().toISOString();
        const merged = [];
        fresh.forEach((it) => {
          if (seen.has(updKey(it))) return;
          it.at = nowIso; // detected-at  the unread state compares against it
          merged.push(it);
        });
        if (merged.length) {
          courseUpdatesItems = merged.concat(stored).slice(0, 120);
          saveStoredUpdates(courseUpdatesItems);
          // Instant Push: announce the NEW items (already filtered through the
          // user's type filter)  the service worker shows the notification.
          try {
            chrome.storage.local.get(PUSH_KEY, (r) => {
              if (!r || !r[PUSH_KEY]) return;
              const matching = merged.filter(filterMatches);
              if (!matching.length) return;
              try {
                chrome.runtime.sendMessage({ type: 'SHOW_COURSE_NOTIF', items: matching },
                  () => void chrome.runtime.lastError);
              } catch (e) {}
            });
          } catch (e) {}
        }
      }
      courseUpdatesShown = COURSE_UPDATES_PAGE_SIZE;
      renderCourseUpdates(firstRun);
      if (status) status.textContent = fresh.length
        ? `${fresh.length} new update${fresh.length > 1 ? 's' : ''}`
        : (firstRun ? 'Baseline saved' : 'Up to date');
    } catch (e) {
      if (feed && !courseUpdatesItems.length) feed.innerHTML = feedStateHtml('error', 'Scan failed. Try again in a moment.');
      if (status) status.textContent = '';
      console.warn('UCP shell: course scan failed', e);
    } finally {
      scanning = false;
    }
  }
  function feedStateHtml(kind, msg) {
    const icon = { loading: 'hourglass_top', empty: 'inbox', ok: 'check_circle', error: 'error' }[kind] || 'info';
    return `<div class="ucp-shell-feed-state"><span class="material-icons">${icon}</span><div>${esc(msg || '')}</div></div>`;
  }
  // Stable identity for deduping persisted course updates across scans.
  function updKey(it) { return `${it.type}|${it.code}|${it.title}`; }
  function loadStoredUpdates() {
    return new Promise((resolve) => {
      try { chrome.storage.local.get(UPD_KEY, (r) => resolve(r && Array.isArray(r[UPD_KEY]) ? r[UPD_KEY] : [])); }
      catch (e) { resolve([]); }
    });
  }
  function saveStoredUpdates(list) { try { chrome.storage.local.set({ [UPD_KEY]: list }); } catch (e) {} }
  // One course-update card. Unread items (detected after the last "Mark all
  // as read") get the is-unread class  a blue dot + a brighter edge.
  function feedItemHtml(it) {
    const unreadCls = isUnread(it) ? ' is-unread' : '';
    return `
      <a class="ucp-shell-feed-item${unreadCls}" href="${BASE}${esc(it.url)}" title="${esc(it.title)}">
        <div class="ucp-shell-feed-icon">${esc(it.icon || '•')}</div>
        <div class="ucp-shell-feed-main">
          <div class="ucp-shell-feed-title">${esc(it.title)}</div>
          <div class="ucp-shell-feed-meta">
            <span class="ucp-shell-feed-code">${esc(it.code)}</span>
            <span class="ucp-shell-feed-type">${it.type === 'grade' ? 'Grade' : (it.type === 'content' ? 'New content' : 'New submission')}</span>
            ${it.value ? `<span class="ucp-shell-feed-grade">${esc(it.value)}</span>` : ''}
          </div>
        </div>
      </a>`;
  }
  // Render the current slice of persisted course updates (paginated) and toggle
  // the "Load more" button. `firstRun` tunes the empty-state copy. The list is
  // filtered by the user's type filter (All / Submissions / Content / Grades).
  function renderCourseUpdates(firstRun) {
    updateUnreadBadges(); // tab / section-head / sidebar badges  this runs
                          // even when the widget DOM is absent (a background
                          // Instant-Push scan in a tab without the widget).
    const feed = byId('ucp-shell-feed');
    if (!feed) return;
    const items = filteredItems(courseUpdatesItems);
    if (!items.length) {
      const all = courseFilter === 'all';
      const noun = courseFilter === 'submission' ? 'submission' : courseFilter === 'content' ? 'content' : 'grade' ;
      feed.innerHTML = feedStateHtml('empty',
        all
          ? (firstRun
              ? 'Baseline saved. New updates (content, submissions, grades) will appear here on the next scan.'
              : 'No course updates yet. Scan to check for new submissions, content, and grades.')
          : `No ${noun} updates yet. Scan to check for new ${noun} updates.`);
      toggleCourseUpdatesLoadMore(false);
      return;
    }
    const slice = items.slice(0, courseUpdatesShown);
    feed.innerHTML = slice.map(feedItemHtml).join('');
    toggleCourseUpdatesLoadMore(courseUpdatesShown < items.length);
  }
  function toggleCourseUpdatesLoadMore(show) {
    const btn = byId('ucp-shell-courseLoadMore');
    if (btn) btn.hidden = !show;
  }
  function showMoreCourseUpdates() {
    const items = filteredItems(courseUpdatesItems);
    courseUpdatesShown = Math.min(items.length, courseUpdatesShown + COURSE_UPDATES_PAGE_SIZE);
    renderCourseUpdates();
  }

  // TYPE FILTER  which update types the scan REPORTS (the feed shows them,
  // Instant Push announces them). Stored under FILTER_KEY; the snapshot still
  // advances for every type, so switching back to "All" never re-surfaces
  // items that were reported while another filter was active.
  function syncFilterUi(f) {
    if (f !== 'submission' && f !== 'content' && f !== 'grade') f = 'all';
    courseFilter = f;
    document.querySelectorAll('#ucp-shell-courseFilter .ucp-wseg-opt').forEach((o) => {
      const on = o.dataset.cfilter === f;
      o.classList.toggle('is-on', on);
      o.setAttribute('aria-checked', String(on));
    });
  }
  function setCourseFilter(f) {
    syncFilterUi(f);
    try { chrome.storage.local.set({ [FILTER_KEY]: f }); } catch (e) {}
    renderCourseUpdates(); // feed + unread badges follow the new filter
  }
  const filterMatches = (it) => (courseFilter === 'all' || it.type === courseFilter);
  const filteredItems = (list) => (courseFilter === 'all' ? (list || []) : (list || []).filter(filterMatches));

  // INSTANT PUSH  background scans + browser notification (default OFF).
  // Enabling it first checks the SITE's notification permission (the browser
  // "site settings" gate): granted → on; default → ask (inside the click
  // gesture); denied → stay off with an explanation. The scan itself rides on
  // scanCourses()  the service worker's alarm pings a portal tab with
  // UCP_PUSH_SCAN (see the onMessage listener below), and the new-items merge
  // in scanCourses() reports SHOW_COURSE_NOTIF to the worker, which shows the
  // notification (chrome.notifications is worker-only).
  let pushBusy = false;
  let pushStatusTimer = null;
  function setPushUi(on) {
    const el = byId('ucp-shell-pushToggle');
    if (el) {
      el.classList.toggle('on', !!on);
      el.setAttribute('aria-checked', String(!!on));
    }
    const state = byId('ucp-shell-pushState');
    if (state) {
      state.textContent = on ? 'ON' : 'OFF';
      state.classList.toggle('is-on', !!on);
    }
  }
  function setPushStatus(t, isError) {
    const el = byId('ucp-shell-pushStatus');
    if (!el) return;
    el.textContent = t;
    el.classList.toggle('is-error', !!isError);
    if (pushStatusTimer) { clearTimeout(pushStatusTimer); pushStatusTimer = null; }
    if (!isError) pushStatusTimer = setTimeout(() => { el.textContent = ''; }, 5000);
  }
  // Quick on/off. ON re-enables the LAST-USED mode (Settings →
  // Notifications; ucp_notif_last_mode)  Push when the mode was never
  // chosen there  and OFF disables ALL background checks (both keys).
  async function togglePush() {
    const el = byId('ucp-shell-pushToggle');
    if (!el || pushBusy) return;
    const turningOn = !el.classList.contains('on');
    pushBusy = true;
    try {
      if (turningOn) {
        if (typeof Notification === 'undefined') {
          setPushStatus('Not supported in this browser.', true);
          return;
        }
        // Gate on the site's permission (the browser "site settings" check):
        // only turn it on when this site is actually allowed to notify.
        let perm = Notification.permission;
        if (perm === 'default') {
          try { perm = await Notification.requestPermission(); } catch (e) { perm = Notification.permission; }
        }
        if (perm !== 'granted') {
          setPushStatus(perm === 'denied'
            ? 'Blocked in site settings  allow notifications for this site, then retry.'
            : 'Not allowed for this site yet  allow it in the browser settings, then retry.', true);
          return;
        }
        // Last-used mode (default: Push).
        let mode = 'push';
        try {
          const r = await new Promise((res) => {
            try { chrome.storage.local.get(LAST_MODE_KEY, (rr) => res(rr)); } catch (e) { res(null); }
          });
          if (r && (r[LAST_MODE_KEY] === 'push' || r[LAST_MODE_KEY] === 'instant')) mode = r[LAST_MODE_KEY];
        } catch (e) {}
        setPushUi(true);
        try {
          chrome.storage.local.set({
            [PUSH_KEY]: true,
            [INSTANT_KEY]: mode === 'instant',
            [LAST_MODE_KEY]: mode,
          });
        } catch (e) {}
        try { chrome.runtime.sendMessage({ type: 'UCP_PUSH_ENABLED', on: true }); } catch (e) {}
        setPushStatus(mode === 'instant' ? 'Background checks on (instant).' : 'Background checks on.');
        scanCourses(); // immediate first check  don't wait for the next alarm
      } else {
        setPushUi(false);
        try {
          chrome.storage.local.set({ [PUSH_KEY]: false, [INSTANT_KEY]: false });
        } catch (e) {}
        try { chrome.runtime.sendMessage({ type: 'UCP_PUSH_ENABLED', on: false }); } catch (e) {}
        setPushStatus('Background checks off.');
      }
    } finally { pushBusy = false; }
  }

  // UNREAD STATE  items detected after the last "Mark all as read"
  // (SEEN_KEY.courses) count as unread: the feed dots them, and the count
  // badges the Course Updates tab, the dashboard section head and the
  // sidebar entry (UNREAD_KEY  js/shell.js reads it). Counted over the
  // FILTERED list (what the feed actually shows).
  function loadSeen() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(SEEN_KEY, (r) => {
          const v = r && r[SEEN_KEY] && r[SEEN_KEY].courses;
          seenCoursesAt = v ? (Date.parse(v) || 0) : 0;
          resolve();
        });
      } catch (e) { resolve(); }
    });
  }
  const isUnread = (it) => !!(it && it.at) && Date.parse(it.at) > seenCoursesAt;
  function updateUnreadBadges() {
    const n = filteredItems(courseUpdatesItems).filter(isUnread).length;
    const text = n > 99 ? '99+' : String(n);
    const tab = byId('ucp-shell-courseUnread');
    if (tab) { tab.hidden = n <= 0; tab.textContent = text; }
    const mark = byId('ucp-shell-markRead');
    if (mark) mark.hidden = n <= 0;
    // Dashboard section head badge (#my-notifications is built by
    // student_dashboard.js  absent on the standalone page, which is fine).
    const head = byId('my-notifications');
    if (head) {
      let b = byId('ucp-dash-notif-badge');
      if (!b) {
        b = document.createElement('span');
        b.id = 'ucp-dash-notif-badge';
        b.className = 'ucp-notif-badge';
        head.appendChild(b);
      }
      b.hidden = n <= 0;
      b.textContent = text;
    }
    // Sidebar badge (shell.js)  written from every /student page so the
    // count reaches pages where the widget itself isn't present.
    try { chrome.storage.local.set({ [UNREAD_KEY]: n }); } catch (e) {}
  }
  function markAllRead() {
    const now = new Date().toISOString();
    seenCoursesAt = Date.parse(now);
    try { chrome.storage.local.set({ [SEEN_KEY]: { courses: now } }); } catch (e) {}
    updateUnreadBadges();
    const st = byId('ucp-shell-scanStatus');
    if (st) { st.textContent = 'All marked as read'; setTimeout(() => { st.textContent = ''; }, 4000); }
  }

  // PORTAL NEWS  the portal's own "Notification & Announcement" section from
  // the live dashboard, shown as cards. (Earlier this scraped the whole
  // dashboard generically and latched onto the Classes section; now it targets
  // the notification/announcement section specifically.) When embedded on the
  // dashboard we read that section straight out of the live DOM; on the
  // standalone notifications page we fetch /student/dashboard instead. If the
  // section is empty we show "No portal news found".
  let newsLoading = false;

  function extractPortalNews(doc) {
    const items = [];
    const seen = new Set();
    const push = (title, href, date) => {
      title = (title || '').replace(/\s+/g, ' ').trim();
      if (!title || title.length < 3) return;
      const k = title.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      items.push({ title, date: date || '', href: href || '' });
    };
    // Announcement timestamps, in the formats the portal tends to use.
    const DATE_RE = /\b(\d{1,2}(?:[\/\-.])\d{1,2}(?:[\/\-.])\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4})\b/;
    const stripDate = (full) => {
      const m = DATE_RE.exec(full);
      if (!m) return { title: full, date: '' };
      return { title: full.replace(m[0], '').replace(/\s{2,}/g, ' ').trim(), date: m[0] };
    };

    // 1. Locate the "News and Announcements" heading. The portal renders it as
    //    <h3 class="heading_a uk-tab">News and Announcements</h3>; prefer a
    //    classed "heading" (heading_a/c) over a bare <h*> in case there are
    //    several news-ish headings on the page.
    const heads = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="heading"], [class*="title"]'));
    const newsHeads = heads.filter((h) => {
      const t = (h.textContent || '').replace(/\s+/g, ' ').trim();
      return t && t.length < 60 && /news\s*(?:and|&)\s*announcement/i.test(t);
    });
    const heading = newsHeads.find((h) => /heading/i.test(h.className || '')) || newsHeads[0];
    if (!heading) {
      const cand = heads.map((h) => (h.textContent || '').trim()).filter(Boolean).slice(0, 25);
      console.log('UCP shell: Portal News  no "News and Announcements" heading found; headings =', cand);
      return items;
    }

    // 2. The announcement body sits AFTER the heading inside its card/panel.
    //    Scope to that nearest card so we never wander into the course list,
    //    and only read elements that follow the heading in document order
    //    (DOCUMENT_POSITION_FOLLOWING === 4).
    const scope =
      heading.closest('.md-card, .card, .card-panel, .panel, section, article, [class*="card"], [class*="panel"], [class*="box"], [class*="widget"]')
      || heading.parentElement
      || doc;
    const FOLLOWING = (typeof Node !== 'undefined' && Node.DOCUMENT_POSITION_FOLLOWING) || 4;
    const afterHeading = (el) => (heading.compareDocumentPosition(el) & FOLLOWING) === FOLLOWING;
    const cands = Array.from(
      scope.querySelectorAll('a[href], li, tr, .news-item, .announcement, .notice, .item')
    ).filter(afterHeading);

    // 3. Read the items, most-likely structure first: links (titles are usually
    //    links) → list items → table rows (title cell + date cell) → plain
    //    blocks. Captures a trailing date when one is present.
    const links = cands.filter((el) => el.matches('a[href]'));
    const lists = cands.filter((el) => el.matches('li'));
    const rows = cands.filter((el) => el.matches('tr'));

    if (links.length) {
      links.forEach((a) => {
        const { title, date } = stripDate((a.textContent || '').replace(/\s+/g, ' ').trim());
        if (title.length < 3) return;
        push(title, a.getAttribute('href') || '', date);
      });
    } else if (lists.length) {
      lists.forEach((li) => {
        const a = li.querySelector('a[href]');
        const { title, date } = stripDate((li.textContent || '').replace(/\s+/g, ' ').trim());
        if (title.length < 3) return;
        push(title, a ? (a.getAttribute('href') || '') : '', date);
      });
    } else if (rows.length) {
      rows.forEach((tr) => {
        const tds = Array.from(tr.children);
        const first = tds[0];
        const a = first && first.querySelector('a[href]');
        let date = '';
        if (tds.length > 1) { const m = DATE_RE.exec((tds[tds.length - 1].textContent || '').trim()); if (m) date = m[0]; }
        const { title } = stripDate((first.textContent || '').replace(/\s+/g, ' ').trim());
        if (title.length < 3) return;
        push(title, a ? (a.getAttribute('href') || '') : '', date);
      });
    } else {
      // Plain blocks only (no links / list / rows): take leaf-ish text blocks
      // that read like a short announcement, in document order.
      cands.forEach((el) => {
        const { title, date } = stripDate((el.textContent || '').replace(/\s+/g, ' ').trim());
        if (title.length < 3 || title.length > 180) return;
        push(title, '', date);
      });
    }
    return items.slice(0, 30);
  }

  function renderNewsItems(items) {
    const list = items.slice(0, 40);
    if (!list.length) return feedStateHtml('empty', 'No portal news found');
    return list.map((it) => {
      const rawHref = it.href || '';
      const href = rawHref
        ? (rawHref.startsWith('http') ? rawHref : BASE + (rawHref.startsWith('/') ? rawHref : '/' + rawHref))
        : '';
      const meta = it.date ? `<div class="ucp-shell-feed-meta"><span class="ucp-shell-feed-date">${esc(it.date)}</span></div>` : '';
      const inner = `
        <div class="ucp-shell-feed-icon">📰</div>
        <div class="ucp-shell-feed-main">
          <div class="ucp-shell-feed-title">${esc(it.title)}</div>
          ${meta}
        </div>`;
      return href
        ? `<a class="ucp-shell-feed-item ucp-shell-news-item" href="${esc(href)}" title="${esc(it.title)}">${inner}</a>`
        : `<div class="ucp-shell-feed-item ucp-shell-news-item" title="${esc(it.title)}">${inner}</div>`;
    }).join('');
  }

  async function fetchPortalNews(force) {
    // `force` documents a manual refresh; the read is near-instant on the live
    // dashboard, so we still guard on newsLoading to avoid a redundant double
    // fetch if the user re-clicks mid-read.
    if (newsLoading) return;
    newsLoading = true;
    const feed = byId('ucp-shell-news-feed');
    const status = byId('ucp-shell-newsStatus');
    if (feed) feed.innerHTML = feedStateHtml('loading');
    if (status) status.textContent = 'Fetching…';
    let ok = false;
    let items = [];
    try {
      // On the live dashboard the "News and Announcement" section is already in
      // the DOM (below this widget)  read it directly. On the standalone
      // notifications page, fetch the dashboard HTML instead.
      let doc;
      if (/\/student\/dashboard/i.test(location.pathname)) doc = document;
      else doc = await fetchPage('/student/dashboard');
      if (doc) { ok = true; items = extractPortalNews(doc); }
    } catch (e) {
      console.warn('UCP shell: portal news read failed', e);
    }
    newsLoading = false;
    if (status) status.textContent = !ok ? 'Failed to load'
      : (items.length ? `Updated just now • ${items.length}` : 'No items found');
    if (!feed) return;
    if (!ok) feed.innerHTML = feedStateHtml('error', "Couldn't load portal news. Try again in a moment.");
    else if (items.length) feed.innerHTML = renderNewsItems(items);
    else feed.innerHTML = feedStateHtml('empty', 'No portal news found');
  }

  // MISCELLANEOUS (was "UCP Notification")  the ucp-news feed (a single
  // { headline, subtitle } item, the same source the login page's "Latest UCP
  // News" box uses). raw .githubusercontent.com sends Access-Control-Allow-Origin:*,
  // so a content script fetch works directly (no service worker needed).
  // No cache (1C): re-fetched on every open.
  const UCP_NEWS_URL = 'https://raw.githubusercontent.com/bakrx12/ucp-news/refs/heads/patch-1/news.json';
  // No cache (1C): the feed is re-fetched on every tab open / refresh.
  let ucpNewsLoading = false;

  function renderUcpNews(data) {
    const feed = byId('ucp-shell-ucp-feed');
    if (!feed) return;
    const headline = (data && (data.headline || data.title)) || '';
    const subtitle = (data && (data.subtitle || data.description || data.body)) || '';
    if (!headline && !subtitle) { feed.innerHTML = feedStateHtml('empty', 'No UCP Smart Portal updates found.'); return; }
    feed.innerHTML = `
      <div class="ucp-shell-feed-item ucp-shell-news-item" title="${esc(headline)}">
        <div class="ucp-shell-feed-icon">📣</div>
        <div class="ucp-shell-feed-main">
          <div class="ucp-shell-feed-title">${esc(headline)}</div>
          ${subtitle ? `<div class="ucp-shell-feed-sub">${esc(subtitle)}</div>` : ''}
        </div>
      </div>`;
  }

  async function fetchUcpNews() {
    if (ucpNewsLoading) return;
    ucpNewsLoading = true;
    const feed = byId('ucp-shell-ucp-feed');
    if (feed) feed.innerHTML = feedStateHtml('loading');
    try {
      const r = await fetch(UCP_NEWS_URL, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      renderUcpNews(data);
    } catch (e) {
      console.warn('UCP shell: ucp-news feed failed', e);
      if (feed) feed.innerHTML = feedStateHtml('error', "Couldn't load. Try again in a moment.");
    }
    ucpNewsLoading = false;
  }

  // UCP FEED (was "UCP News")  the right-most tab. Live-fetched from the
  // PUBLIC ucp.edu.pk/announcement/ listing (a different origin than the
  // portal), so the service worker does the cross-origin fetch (background
  // GET_UCP_TODAY) and we parse the raw HTML here. Populated ONLY when the
  // user clicks the tab (setShellView index 4)  never on load. NO caching (1C):
  // every open / refresh re-fetches live and nothing is written to storage.
  // Shows 5 cards at a time with a "Load more" button (5 more); "Refresh"
  // re-fetches. Each card shows the title, the listing excerpt, and the publish
  // date + author (best-effort from the listing); articles link out in a new tab.
  const UCP_TODAY_PAGE_SIZE = 5;
  let ucpTodayItems = [];     // all parsed items (page order, most recent first)
  let ucpTodayShown = 0;      // how many are currently rendered
  let ucpTodayLoading = false;

  // Cross-origin fetch via the service worker (it holds the ucp.edu.pk host
  // permission); returns '' on failure / stale context so callers degrade.
  function swFetchUcpTodayHtml() {
    return new Promise((resolve) => {
      try {
        const alive = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
        if (!alive) { resolve(''); return; }
        let answered = false;
        chrome.runtime.sendMessage({ type: 'GET_UCP_TODAY' }, (resp) => {
          if (chrome.runtime.lastError) { /* stale/absent SW */ }
          answered = true;
          resolve((resp && resp.html) || '');
        });
        setTimeout(() => { if (!answered) resolve(''); }, 8000);
      } catch (e) { resolve(''); }
    });
  }

  // Best-effort author read from one listing <article>: a rel="author" link, an
  // author/byline-classed element, or a "By Name" lead-in. '' when unknown.
  function authorFrom(art) {
    try {
      const clean = (t) => (t || '').replace(/^by\s+/i, '').replace(/\s+/g, ' ').trim();
      const relA = art.querySelector('a[rel="author"]');
      if (relA && relA.textContent.trim()) return clean(relA.textContent);
      const byEl = art.querySelector('[class*="author"], [class*="byline"], [class*="writer"], [class*="posted-by"]');
      if (byEl) { const t = clean(byEl.textContent); if (t && t.length < 60 && !/^\d/.test(t)) return t; }
      const m = (art.textContent || '').match(/\bby\s+([A-Z][\w.]+(?:\s+[A-Z][\w.]+)+)/);
      if (m && m[1].trim().length < 60) return m[1].trim();
      return '';
    } catch (e) { return ''; }
  }

  // Parse the announcement listing: <article> blocks each carrying a title link,
  // an excerpt <p>, a publish date (<time> or a date in the meta), and an author.
  // Falls back to collecting announcement links when the <article> markup is absent.
  function parseUcpToday(doc) {
    const items = [];
    const seen = new Set();
    const push = (title, href, excerpt, date, author) => {
      title = (title || '').replace(/\s+/g, ' ').trim();
      if (!title || title.length < 3) return;
      const k = title.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      items.push({
        title,
        href: href || '',
        excerpt: (excerpt || '').replace(/\s+/g, ' ').trim(),
        date: date || '',
        author: (author || '').replace(/\s+/g, ' ').trim(),
      });
    };
    const DATE_RE = /\b(\d{1,2}(?:[\/\-.])\d{1,2}(?:[\/\-.])\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s*,?\s*\d{4}|[A-Za-z]{3,9}\s+\d{1,2}\s*,?\s*\d{4})\b/;
    doc.querySelectorAll('article').forEach((art) => {
      const h = art.querySelector('h1, h2, h3, h4');
      const a = (h && h.querySelector('a[href]')) || art.querySelector('a[href]');
      const title = h ? h.textContent : '';
      const href = a ? (a.getAttribute('href') || '') : '';
      const p = art.querySelector('p');
      const excerpt = p ? p.textContent : '';
      let date = '';
      const time = art.querySelector('time');
      if (time) {
        const dt = time.getAttribute('datetime');
        if (dt) { const d = new Date(dt); date = isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
        else date = (time.textContent || '').replace(/\s+/g, ' ').trim();
      }
      if (!date) {
        const meta = art.querySelector('footer, [class*="date"], [class*="time"], .entry-meta, .post-meta, .meta');
        const m = DATE_RE.exec((meta || art).textContent || '');
        if (m) date = m[0];
      }
      push(title, href, excerpt, date, authorFrom(art));
    });
    if (!items.length) {
      doc.querySelectorAll('a[href*="/announcement/"]').forEach((a) => {
        const t = (a.textContent || '').replace(/\s+/g, ' ').trim();
        if (t.length < 8) return; // skip image-only / nav links
        push(t, a.getAttribute('href') || '', '', '', '');
      });
    }
    return items.slice(0, 60);
  }

  // Render the current slice (ucpTodayShown) of items as cards; toggle the
  // "Load more" button based on whether more remain.
  function renderUcpToday() {
    const feed = byId('ucp-shell-ucpToday-feed');
    if (!feed) return;
    if (!ucpTodayItems.length) {
      feed.innerHTML = feedStateHtml('empty', 'No UCP news found.');
      toggleUcpTodayLoadMore(false);
      return;
    }
    const slice = ucpTodayItems.slice(0, ucpTodayShown);
    feed.innerHTML = slice.map((it) => {
      const meta = (it.author || it.date)
        ? `<div class="ucp-shell-feed-meta">${it.author ? `<span class="ucp-shell-feed-author">${esc(it.author)}</span>` : ''}${it.date ? `<span class="ucp-shell-feed-date">${esc(it.date)}</span>` : ''}</div>`
        : '';
      const inner = `
        <div class="ucp-shell-feed-main">
          <div class="ucp-shell-feed-title">${esc(it.title)}</div>
          ${it.excerpt ? `<div class="ucp-shell-feed-sub">${esc(it.excerpt)}</div>` : ''}
          ${meta}
        </div>`;
      return it.href
        ? `<a class="ucp-shell-feed-item ucp-shell-ucptoday-item" href="${esc(it.href)}" target="_blank" rel="noopener" title="${esc(it.title)}">${inner}</a>`
        : `<div class="ucp-shell-feed-item ucp-shell-ucptoday-item" title="${esc(it.title)}">${inner}</div>`;
    }).join('');
    toggleUcpTodayLoadMore(ucpTodayShown < ucpTodayItems.length);
  }
  function toggleUcpTodayLoadMore(show) {
    const btn = byId('ucp-shell-ucpTodayLoadMore');
    if (btn) btn.hidden = !show;
  }
  // "Load more": reveal the next batch of 5 (clamped to the total).
  function showMoreUcpToday() {
    ucpTodayShown = Math.min(ucpTodayItems.length, ucpTodayShown + UCP_TODAY_PAGE_SIZE);
    renderUcpToday();
  }

  async function fetchUcpToday() {
    if (ucpTodayLoading) return;
    const feed = byId('ucp-shell-ucpToday-feed');
    const status = byId('ucp-shell-ucpTodayStatus');
    // No caching (1C): every tab open AND every manual "Refresh" re-fetches the
    // live announcement listing. `ucpTodayItems` is only kept in memory for the
    // "Load more" pagination of the current fetch  it is never written to storage.
    ucpTodayLoading = true;
    if (status) status.textContent = 'Fetching…';
    if (feed) feed.innerHTML = feedStateHtml('loading');
    let html = '';
    try { html = await swFetchUcpTodayHtml(); }
    catch (e) { console.warn('UCP shell: ucp-feed fetch failed', e); }
    ucpTodayLoading = false;
    if (!html) {
      if (status) status.textContent = ucpTodayItems.length ? '' : 'Failed to load';
      if (feed && !ucpTodayItems.length) feed.innerHTML = feedStateHtml('error', "Couldn't load the UCP feed. Try again in a moment.");
      return;
    }
    const items = parseUcpToday(parseHtml(html));
    if (!items.length) {
      if (status) status.textContent = 'No items found';
      if (feed) feed.innerHTML = feedStateHtml('empty', 'No UCP feed items found.');
      toggleUcpTodayLoadMore(false);
      return;
    }
    ucpTodayItems = items;
    ucpTodayShown = UCP_TODAY_PAGE_SIZE; // show the first 5
    if (status) status.textContent = `Updated just now • ${items.length}`;
    renderUcpToday();
  }

  // ACADEMIC CALENDAR  the left-most (default) tab. Live-fetched from
  // ucp.edu.pk via the service worker (js/academic_calendar.js owns the fetch +
  // parse + model; background's GET_ACADEMIC_CALENDAR does the cross-origin
  // fetch). Shows a mini-card (with the Refresh button docked inside it) for the
  // nearest upcoming near-term milestone and the full calendar (milestones +
  // holidays) in chronological order. Convocation is shown only when the
  // student is in the final (8th) semester. Populated on load (the default tab)
  // and re-fetched on every tab open (setShellView index 0); the module caches
  // the model, re-fetching only once its date-gate is reached or on a manual
  // refresh.
  let acadRendering = false;
  async function renderAcademicCalendar(force) {
    if (acadRendering) return;
    acadRendering = true;
    const mini = byId('ucp-shell-acad-mini');
    const feed = byId('ucp-shell-acad-feed');
    if (!mini || !feed) { acadRendering = false; return; }
    // If a mini-card (or loading shell) is already showing, keep its button +
    // status visible and only update the status line  so a manual refresh shows
    // "Refreshing…" INSIDE the button instead of wiping the card to a spinner.
    const hasMini = !!mini.querySelector('.ucp-acad-mini-card');
    const setStatus = (t) => { const st = byId('ucp-shell-acadStatus'); if (st) st.textContent = t; };
    if (hasMini) setStatus('Refreshing…');
    else mini.innerHTML = acadMiniShell(acadMiniState('hourglass_top', 'Loading calendar…'));
    const ac = window.__ucpAcadCal;
    if (!ac) {
      if (hasMini) setStatus('Unavailable');
      else mini.innerHTML = acadMiniShell(acadMiniState('error', 'Academic calendar is unavailable.', true));
      acadRendering = false;
      return;
    }
    try {
      const [model, semNum] = await Promise.all([ac.fetchCalendar(force), ac.getSemesterNumber()]);
      if (!ac.hasContent(model)) {
        mini.innerHTML = acadMiniShell(acadMiniState('event_busy', 'No academic calendar data found.'));
        feed.innerHTML = '';
        setStatus('');
      } else {
        // Re-apply the saved per-term expansion before the feed renders, so
        // the first paint greys/reveals past items where the user left them.
        try {
          const r = await chrome.storage.local.get(ACAD_EXPANDED_KEY);
          acadExpanded = (r && r[ACAD_EXPANDED_KEY]) || {};
        } catch (e) {}
        mini.innerHTML = renderAcadMiniCard(model);
        feed.innerHTML = renderAcadFeed(model, semNum);
        // Reflect the data provenance so the manual refresh gives feedback  the
        // text lands inside the button, under its "Refresh" title.
        setStatus(
          model._source === 'live' ? 'Updated just now'
          : model._source === 'cache' ? 'From cache'
          : model._source === 'stale' ? 'From cache (last fetch failed)'
          : ''
        );
      }
    } catch (e) {
      console.warn('UCP shell: academic calendar failed', e);
      if (hasMini) setStatus('Refresh failed');
      else {
        mini.innerHTML = acadMiniShell(acadMiniState('error', "Couldn't load the academic calendar. Try again in a moment.", true));
        feed.innerHTML = '';
      }
    }
    acadRendering = false;
  }

  // The Next-up mini-card shell: a left info column (stretches, truncates) + the
  // two-line "Refresh" button docked on the right. The button carries the id
  // (#ucp-shell-acadRefresh) and its own status span (#ucp-shell-acadStatus) 
  // both are re-created on every render, so the click is handled by DELEGATION on
  // the stable panel (see wireWidget), not a direct listener.
  function acadMiniShell(inner) {
    return `
      <div class="ucp-acad-mini-card ucp-acad-mini-with-refresh">
        <div class="ucp-acad-mini-info">${inner}</div>
        <button class="ucp-shell-btn ucp-shell-refresh-btn ucp-shell-acad-refresh" id="ucp-shell-acadRefresh" type="button">
          <span class="material-icons">refresh</span>
          <span class="ucp-shell-refresh-col">
            <span class="ucp-shell-refresh-title">Refresh</span>
            <span class="ucp-shell-refresh-status" id="ucp-shell-acadStatus"></span>
          </span>
        </button>
      </div>`;
  }
  // A compact loading / empty / error placeholder for the shell's left column.
  function acadMiniState(icon, text, isError) {
    return `<div class="ucp-acad-mini-state${isError ? ' is-error' : ''}"><span class="material-icons">${icon}</span><span>${esc(text || '')}</span></div>`;
  }

  // Mini-card: the nearest UPCOMING dated item across all terms (headlines +
  // milestones + holidays), labelled with its term  e.g. "Next up • Fall 2026".
  function renderAcadMiniCard(model) {
    const ac = window.__ucpAcadCal;
    // Prefer the cached "Next up" (captured at the page-load refresh and stored
    // in the model's snapshot) so the mini-card is stable across a reload within
    // the cache's lifetime; fall back to a live recompute when there's no
    // snapshot or the cached item is no longer in the future.
    const snap = model && model._snapshot;
    const cachedNext = snap && snap.nextUp;
    const nearest = (cachedNext && ac.ts(cachedNext.dateISO) > Date.now())
      ? cachedNext
      : ac.nearestUpcoming(model, new Date());
    if (!nearest) return acadMiniShell(acadMiniState('event_busy', 'No upcoming dates on the calendar.'));
    return acadMiniShell(renderAcadMiniItem(nearest, 'Next up'));
  }
  function renderAcadMiniItem(item, label) {
    const ac = window.__ucpAcadCal;
    const short = ac.formatShortDate(item.dateISO);
    const term = item.term ? ` • ${esc(item.term)}` : '';
    return `
      <div class="ucp-acad-mini-label">${esc(label)}${term}</div>
      <div class="ucp-acad-mini-name" title="${esc(item.name)}">${esc(item.name)}</div>
      <div class="ucp-acad-mini-date">
        <span class="material-icons">event</span>
        <span>${esc(short || item.dateText || '')}</span>
        ${item.dateISO ? `<span class="ucp-acad-mini-when">• ${esc(ac.countdown(item.dateISO))}</span>` : ''}
      </div>`;
  }

  // A season+year ("Fall 2026", "Summer 2026") embedded in a row's NAME, in the
  // same normalized form the term headings use. Used to spot the trailing
  // "Registration / Commencement of Classes for <next term>" rows a term's table
  // tacks on  they actually belong to the NEXT term.
  const ACADEM_SEASON_RE = /\b(autumn|fall|spring|summer|winter)\s+(\d{4})\b/i;
  function termInName(name) {
    const m = ACADEM_SEASON_RE.exec(name || '');
    if (!m) return null;
    const s = m[1];
    return s.charAt(0).toUpperCase() + s.slice(1) + ' ' + m[2];
  }

  // Build the per-term row lists (milestones + semester-filtered holidays), then
  // reassign the trailing next-term rows. For each row whose NAME names a
  // different term than the section it sits in: if that referenced term already
  // has its OWN section (its table is rendered on the page), DROP the row
  // (redundant  that section shows the same event). Otherwise the referenced
  // term is only reached via these preview rows, so MOVE every preview row for
  // it  registration AND commencement  into its (possibly freshly created)
  // section. (Dropping after the first row created the section would otherwise
  // leave the third term missing its "Commencement of Classes" card.)
  function buildTermSections(model, keepHoliday) {
    const sections = (model.sections || []).map((s) => ({
      term: s.term,
      rows: (s.milestones || []).map((m) => ({ ...m, _src: 'milestone' }))
        .concat((s.holidays || []).filter(keepHoliday).map((h) => ({ ...h, _src: 'holiday' }))),
    }));
    const byTerm = {};
    const hasOwnSection = {}; // terms the page actually lists a table for
    sections.forEach((s) => { byTerm[s.term] = s; hasOwnSection[s.term] = true; });

    sections.forEach((s) => {
      const own = [];
      s.rows.forEach((it) => {
        const ref = termInName(it.name);
        if (ref && ref !== s.term) {
          if (hasOwnSection[ref]) return; // referenced term has its own table → drop
          let target = byTerm[ref];
          if (!target) {
            target = { term: ref, rows: [] };
            byTerm[ref] = target;
            sections.push(target); // forEach only visits the ORIGINAL sections, so
          }                           // freshly-created ones are never re-scanned.
          target.rows.push(it);
          return;
        }
        own.push(it);
      });
      s.rows = own;
    });
    return sections;
  }

  // Order terms: the ONGOING term (whose date range contains "now") first, then
  // upcoming terms (earliest first), then past terms (most-recent first).
  function orderTerms(sections, nowMs) {
    const ts = window.__ucpAcadCal.ts;
    const ranked = sections.map((s) => {
      const dates = s.rows.map((r) => ts(r.dateISO)).filter((t) => t !== Infinity);
      const min = dates.length ? Math.min.apply(null, dates) : null;
      const max = dates.length ? Math.max.apply(null, dates) : null;
      let rank;
      if (min === null) rank = 3;        // no dated rows → last
      else if (nowMs < min) rank = 1;    // fully upcoming
      else if (nowMs > max) rank = 2;    // fully past
      else rank = 0;                     // ongoing (now within the span)
      return { s, rank, key: min };
    });
    ranked.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.rank === 2) return (b.key || 0) - (a.key || 0);       // past: most recent first
      return (a.key || Infinity) - (b.key || Infinity);           // upcoming/ongoing: earliest first
    });
    return ranked.map((r) => ({ s: r.s, ongoing: r.rank === 0 }));
  }
  // Order terms using the CACHED render order (model._snapshot.termOrder) so a
  // reload shows the same term-first layout the page-load refresh produced.
  // Terms missing from the snapshot fall back to date order; `ongoing` is
  // recomputed from each term's date span so the "previous activities" toggle
  // stays correct even when the display order comes from the cache.
  function orderSectionsBy(sections, termOrder, nowMs) {
    const ts = window.__ucpAcadCal.ts;
    const rankOf = (term) => { const i = termOrder.indexOf(term); return i === -1 ? 1e9 : i; };
    return sections.map((s) => {
      const dates = s.rows.map((r) => ts(r.dateISO)).filter((t) => t !== Infinity);
      const min = dates.length ? Math.min.apply(null, dates) : null;
      const max = dates.length ? Math.max.apply(null, dates) : null;
      const ongoing = min !== null && nowMs >= min && nowMs <= max;
      return { s, ongoing, rank: rankOf(s.term), key: min };
    }).sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return (a.key || Infinity) - (b.key || Infinity); // date fallback within a rank
    });
  }

  // Render one term block. The ONGOING term hides its past activities except the
  // single most-recent one (shown greyed); a toggle reveals the rest. Other
  // terms show everything. A Title / Date / Week column-header row sits under
  // the term heading.
  function renderTermBlock({ s, ongoing }, nowMs) {
    const ts = window.__ucpAcadCal.ts;
    const rows = s.rows.slice().sort(byDate);
    if (!rows.length) return '';

    const past = rows.filter((r) => ts(r.dateISO) < nowMs);   // dated & before now (asc)
    const olderPasts = ongoing ? new Set(past.slice(0, past.length - 1)) : new Set();

    const rowsHtml = rows.map((r) => {
      let extra = '';
      if (past.includes(r)) {
        extra = 'is-past';                                 // most recent past → greyed
        if (olderPasts.has(r)) extra += ' is-hidden-past'; // older pasts → hidden until expanded
      }
      return renderAcadRow(r, extra);
    }).join('');

    // Saved expansion (ucp_acad_expanded_terms): if the user left this term's
    // previous activities open, start expanded  the older past rows stay
    // revealed (CSS: .ucp-acad-term.is-expanded shows .is-hidden-past).
    const wasExpanded = !!acadExpanded[s.term];

    const toggleHtml = (ongoing && past.length > 1)
      ? `<button class="ucp-acad-toggle${wasExpanded ? ' is-expanded' : ''}" type="button">
           <span class="material-icons">${wasExpanded ? 'expand_less' : 'expand_more'}</span>
           <span class="ucp-acad-toggle-label">${wasExpanded ? 'Hide previous activities' : 'Show previous activities'}</span>
         </button>`
      : '';

    return `
      <div class="ucp-acad-term${ongoing ? ' ucp-acad-term-ongoing' : ''}${wasExpanded ? ' is-expanded' : ''}" data-acad-term="${esc(s.term)}">
        <div class="ucp-acad-term-head">
          <span class="material-icons">calendar_month</span>
          <span>${esc(s.term)}</span>
        </div>
        <div class="ucp-acad-head">
          <span class="ucp-acad-col-title">Title</span>
          <span class="ucp-acad-col-date">Date</span>
          <span class="ucp-acad-col-day">Day</span>
          <span class="ucp-acad-col-week">Week</span>
        </div>
        <div class="ucp-acad-list">${rowsHtml}</div>
        ${toggleHtml}
      </div>`;
  }

  // Full calendar, grouped by TERM. Convocation shows only when the student is
  // in the final (8th) semester; otherwise it's omitted entirely.
  function renderAcadFeed(model, semNum) {
    const now = new Date();
    const nowMs = now.getTime();
    const keepHoliday = (h) => !h.isConvocation || semNum === 8;

    // Fallback for a model that predates per-term sections: one undated group.
    if (!(model.sections || []).length) {
      const rows = (model.milestones || []).map((m) => ({ ...m, _src: 'milestone' }))
        .concat((model.holidays || []).filter(keepHoliday).map((h) => ({ ...h, _src: 'holiday' })));
      if (!rows.length) return feedStateHtml('empty', 'No calendar entries found.');
      return '<div class="ucp-acad-list">' + rows.sort(byDate).map((r) => renderAcadRow(r)).join('') + '</div>';
    }

    const sections = buildTermSections(model, keepHoliday);
    // Use the cached term order (which term to render first) when the model
    // carries a snapshot; otherwise derive it live from the dates.
    const snap = model && model._snapshot;
    const termOrder = snap && Array.isArray(snap.termOrder) && snap.termOrder.length ? snap.termOrder : null;
    const ordered = termOrder ? orderSectionsBy(sections, termOrder, nowMs) : orderTerms(sections, nowMs);
    return ordered.map((block) => renderTermBlock(block, nowMs)).join('');
  }
  function byDate(a, b) {
    const ts = window.__ucpAcadCal.ts;
    const da = ts(a.dateISO), db = ts(b.dateISO);
    if (da === db) return 0;
    if (da === Infinity) return 1;   // undated items sort to the end
    if (db === Infinity) return -1;
    return da - db;
  }
  function renderAcadRow(r, extraCls) {
    const ac = window.__ucpAcadCal;
    const week = (r.week && r.week !== '–' && r.week !== '' && r.week !== '-') ? r.week : '';
    // Split the date into a DATE cell and a separate DAY (weekday) cell. Both sit
    // on the LEFT side of the row (before the Week column) and are right-aligned.
    // Ranges / "To be announced" fall back to the raw date text (in the title).
    const hasDate = ac.ts(r.dateISO) !== Infinity;
    const dateStr = hasDate ? ac.formatShortDate(r.dateISO) : (r.dateText || 'To be announced');
    const dayStr = hasDate ? ac.formatDayOfWeek(r.dateISO) : '';
    const cls = r._src === 'holiday' ? 'ucp-acad-holiday' : 'ucp-acad-milestone';
    return `
      <div class="ucp-acad-row ${cls}${extraCls ? ' ' + extraCls : ''}">
        <div class="ucp-acad-row-name" title="${esc(r.name)}">${esc(r.name)}</div>
        <div class="ucp-acad-row-date" title="${esc(r.dateText || dateStr)}">${esc(dateStr)}</div>
        <div class="ucp-acad-row-day">${esc(dayStr)}</div>
        <div class="ucp-acad-week${week ? ' is-set' : ''}">${week ? esc(week) : ''}</div>
      </div>`;
  }

  // Direct load  a refresh on /student/notifications still shows the page.
  if (location.pathname === '/student/notifications') {
    const ensureRoot = () => {
      let root = byId('ucp-shell-root');
      if (root) return root;
      root = document.createElement('div');
      root.id = 'ucp-shell-root';
      (document.getElementById('page_content') || document.body).appendChild(root);
      return root;
    };
    render(ensureRoot());
  }
});
