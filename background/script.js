// background.js (MV3 service worker) — robust parsing + default ON

const INJECTION_MAP = [
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/(?:student(?:\/|$)|join(?:\/|$)|election(?:\/|$))/i, files: ['styles/student.css', 'styles/shell.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/web\/login/i, files: ['styles/homepage.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/dashboard/i, files: ['styles/student_dashboard.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/profile/i, files: ['styles/student_profile.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/class\/schedule/i, files: ['styles/student_timetable.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/attendance/i, files: ['styles/student_attendance.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/results/i, files: ['styles/student_results.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/invoices/i, files: ['styles/student_invoices.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/societies/i, files: ['styles/student_societies.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/course(\/|$)/i, files: ['styles/course/dockbar.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/course\/material/i, files: ['styles/course/course_material.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/course\/(?:submission|assessment|info|outline|gradebook)/i, files: ['styles/course/course_submission.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/course\/outline/i, files: ['styles/course/course_outline.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/enrolled\/courses/i, files: ['styles/student_enrolled.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/course\/gradebook/i, files: ['styles/course/course_gradebook.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/exam\/datesheet/i, files: ['styles/student_datesheet.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/qa\/feedback/i, files: ['styles/student_feedback.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/enrollment\/cards/i, files: ['styles/new_enrollment.css', 'styles/portal_glass.css', 'styles/enrollment_nav.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/complaints/i, files: ['styles/student_complaints.css'] },
    // Portal-native pages (no dedicated extension UI) — glassify the
    // university's own cards/tables/forms, dark translucent like complaints.
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/vis(?:\/|$)/i, files: ['styles/portal_glass.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/request\//i, files: ['styles/portal_glass.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/transcript(?:\/|$)/i, files: ['styles/portal_glass.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/enrollment\/schedule/i, files: ['styles/portal_glass.css'] },
    // Enrollment cart + available-timetable pages — glassify the portal's own
    // content (dark translucent panel) and add the shared enrollment nav bar.
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/enrollment\/cart/i, files: ['styles/portal_glass.css', 'styles/enrollment_nav.css'] },
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/enrollment\/available_timetable/i, files: ['styles/portal_glass.css', 'styles/enrollment_nav.css'] },
    // Enrollment timetable page — reuse the class-schedule design (the content
    // script js/enrollment_timetable.js renders the live schedule into it) +
    // the shared enrollment nav bar.
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/enrollment\/timetable/i, files: ['styles/student_timetable.css', 'styles/enrollment_nav.css'] }
];

let currentEnabled = true; // ✅ default to ON
const cssAppliedTabs = new Set();

/** Robust parsing — fallback to true (enabled) when not set */
function isEnabled(value) {
    // undefined or null → default ON
    if (value === undefined || value === null) return true;

    if (value === true) return true;
    if (value === false) return false;

    if (typeof value === 'number') return value !== 0;

    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
        if (v === 'false' || v === '0' || v === 'off' || v === 'no') return false;
        return true; // unknown strings -> treat as enabled
    }

    return true; // fallback safe default
}

function getFilesForUrl(url) {
    if (!url) return [];
    try {
        if (!/^https?:\/\//i.test(url)) return [];
        const matches = [];
        for (const rule of INJECTION_MAP) {
            if (rule.pattern.test(url)) matches.push(...rule.files);
        }
        return [...new Set(matches)];
    } catch (e) {
        console.error('getFilesForUrl error', e);
        return [];
    }
}

async function updateTabCss(tab, enabled) {
    if (!tab || !tab.id || !tab.url) return;
    const files = getFilesForUrl(tab.url);
    if (files.length === 0) return;

    try {
        if (enabled) {
                if (cssAppliedTabs.has(tab.id)) return;
            await chrome.scripting.insertCSS({
                target: { tabId: tab.id, allFrames: true },
                files
            });
            cssAppliedTabs.add(tab.id);
            console.debug('inserted css', files, 'into', tab.id, tab.url);
        } else {
            await chrome.scripting.removeCSS({
                target: { tabId: tab.id, allFrames: true },
                files
            });
            cssAppliedTabs.delete(tab.id);
            console.debug('removed css', files, 'from', tab.id, tab.url);
        }
    } catch (err) {
        console.warn('updateTabCss error for tab', tab.id, tab.url, err?.message || err);
    }
}

async function updateAllTabs(enabled) {
    try {
        const tabs = await chrome.tabs.query({});
        const promises = tabs.map(t => updateTabCss(t, enabled));
        await Promise.all(promises);
        console.info('updateAllTabs finished. enabled=', enabled);
    } catch (err) {
        console.error('updateAllTabs failed', err);
    }
}

async function syncAllTabsWithStorage() {
    try {
        const data = await chrome.storage.local.get('toggle_power');
        const raw = data.toggle_power;
        const parsed = isEnabled(raw);
        console.info('syncAllTabsWithStorage: raw toggle_power =', raw, 'parsed =', parsed);
        currentEnabled = parsed;

        // ✅ set default ON if not found in storage
        if (raw === undefined) {
            await chrome.storage.local.set({ toggle_power: true });
            console.info('toggle_power not found — set default true');
        }

        await updateAllTabs(currentEnabled);
    } catch (err) {
        console.error('syncAllTabsWithStorage error', err);
    }
}

// listen for storage changes and apply robust parsing
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    // Push / Instant Push was toggled from ANY UI (the widget's switch or the
    // Settings page's Save) → (re)arm the background scan alarms. Runs
    // independently of the toggle_power branch below.
    if ('ucp_push_notify' in changes) { try { syncPushAlarm(); } catch (e) { console.warn('UCP push: syncPushAlarm (storage) failed', e); } }
    if ('ucp_instant_push' in changes) {
        try { syncInstantAlarm(); } catch (e) { console.warn('UCP instant push: syncInstantAlarm (storage) failed', e); }
        // Turning it on → run a first scan NOW: the first run only baselines
        // the shared snapshot (no notifications), so the user doesn't wait a
        // full tick before the baseline exists.
        if (changes.ucp_instant_push.newValue) {
            runInstantCourseScan().catch((e) => console.warn('UCP instant push: first scan failed', e));
        }
    }
    if (!('toggle_power' in changes)) return;

    const newRaw = changes.toggle_power.newValue;
    const newVal = isEnabled(newRaw);
    console.info('storage.onChanged: toggle_power changed. raw=', newRaw, 'parsed=', newVal);

    currentEnabled = newVal;
    updateAllTabs(currentEnabled).catch(e => console.error(e));

    // 🔔 Notify all content scripts about the toggle change
    chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
            if (!tab.url || !/^https:\/\/horizon\.ucp\.edu\.pk\//.test(tab.url)) continue;

            chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_POWER_CHANGED', enabled: currentEnabled })
                .catch((err) => {
                    // This error just means no listener exists on that tab — not fatal
                    if (err?.message?.includes('Receiving end does not exist')) {
                        console.debug(`No content script found in tab ${tab.id} (${tab.url})`);
                    } else {
                        console.warn('sendMessage failed', tab.id, tab.url, err);
                    }
                });
        }
    });

});


// ensure new tabs / navigations get CSS if enabled
chrome.tabs.onCreated.addListener((tab) => {
    if (!currentEnabled) return;
    updateTabCss(tab, true);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!currentEnabled) return;
    if (changeInfo.status === 'loading') {
        cssAppliedTabs.delete(tabId);
        updateTabCss({ ...tab, id: tabId, url: changeInfo.url || tab.url }, true);
    } else if (changeInfo.status === 'complete' && !cssAppliedTabs.has(tabId)) {
        updateTabCss(tab, true);
    }
});

chrome.tabs.onRemoved.addListener((tabId) => cssAppliedTabs.delete(tabId));

// =========================================================================
// INSTANT PUSH — periodic background course-updates scan + browser
// notification. The toggle (Course Updates scan bar, js/notification_page.js)
// stores ucp_push_notify and asks this worker to (re)arm the alarm; the scan
// itself runs in an OPEN portal tab because the HTML parsing lives in the
// content script (the worker only fetches raw pages — it has no DOMParser),
// and the new items are then reported back as a chrome.notifications message.
// =========================================================================
const PUSH_ALARM = 'ucp-push-scan';
const PUSH_INTERVAL_MIN = 5; // chrome.alarms floors: 30s unpacked, 1min packed
async function syncPushAlarm() {
    try {
        const r = await chrome.storage.local.get('ucp_push_notify');
        if (r && r.ucp_push_notify) {
            await chrome.alarms.create(PUSH_ALARM, { periodInMinutes: PUSH_INTERVAL_MIN });
        } else {
            await chrome.alarms.clear(PUSH_ALARM);
        }
    } catch (e) { console.warn('UCP push: syncPushAlarm failed', e); }
}
chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm || alarm.name !== PUSH_ALARM) return;
    (async () => {
        try {
            const r = await chrome.storage.local.get(['ucp_push_notify', 'ucp_notif_enabled']);
            if (!(r && r.ucp_push_notify)) return; // switched off mid-flight
            if (r && r.ucp_notif_enabled === false) return; // master toggle off (Settings)
            // Pick ONE open portal tab to run the scan in (its content script
            // owns the parsing); a headless scan on any /student page works —
            // no widget needs to be visible. With none open, skip this tick.
            const tabs = await chrome.tabs.query({ url: 'https://horizon.ucp.edu.pk/student/*' });
            const tab = tabs.find((t) => t.id != null);
            if (!tab) return;
            try {
                await chrome.tabs.sendMessage(tab.id, { type: 'UCP_PUSH_SCAN' });
            } catch (e) { /* receiver not ready (still loading) — next tick retries */ }
        } catch (e) {}
    })();
});
// The worker's storage-write for the flag is the single source of truth; the
// content script's own write (toggle flip) can race this, so both converge on
// the same value.
// =========================================================================

// =========================================================================
// INSTANT PUSH — the tab-less twin of the scan above. Same cadence, but the
// scan runs ENTIRELY in the service worker: direct fetches with the browser's
// session cookies (host_permissions) + regex parsing (the SW has no
// DOMParser). Works with no portal tab — even when Chrome is closed. New
// items flow through the SAME shared snapshot (ucp_course_snapshots_v1) and
// stored-updates list (ucp_course_updates) as the tab-based scan, so both
// toggles on never double-notify: whichever scan runs first claims the new
// items and advances the shared baseline.
// =========================================================================
const INSTANT_ALARM = 'ucp-instant-scan';
const INSTANT_INTERVAL_MIN = 5; // chrome.alarms floors: 30s unpacked, 1min packed
const INSTANT_BASE = 'https://horizon.ucp.edu.pk';
// Negative cache for the SW-side page fetches (404s/5xx — same discipline as
// the content-script side: don't hammer failing URLs every tick).
const instantFetchFail = new Map();
const INSTANT_FAIL_TTL = 10 * 60 * 1000;

async function syncInstantAlarm() {
    try {
        const r = await chrome.storage.local.get('ucp_instant_push');
        if (r && r.ucp_instant_push) {
            await chrome.alarms.create(INSTANT_ALARM, { periodInMinutes: INSTANT_INTERVAL_MIN });
        } else {
            await chrome.alarms.clear(INSTANT_ALARM);
        }
    } catch (e) { console.warn('UCP instant push: syncInstantAlarm failed', e); }
}

// --- Raw-HTML helpers. The SW has no DOM: the tab-based scan's DOM
// selectors (js/notification_page.js) mirrored as regexes. The derived keys
// (course code) must match the tab scan exactly, or the two scans would keep
// separate snapshot entries and both could notify. --------------------------
function instantText(html) {
    return String(html == null ? '' : html)
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

async function instantFetchPage(path) {
    const url = INSTANT_BASE + path;
    const f = instantFetchFail.get(url);
    if (f && Date.now() - f.ts < INSTANT_FAIL_TTL) return '';
    try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) { instantFetchFail.set(url, { ts: Date.now() }); return ''; }
        instantFetchFail.delete(url);
        return await res.text();
    } catch (e) { instantFetchFail.set(url, { ts: Date.now() }); return ''; }
}

// Course list: the dashboard's course cards link to /student/course/<id>.
// The CODE (CS101-shaped) usually sits in card text right after the link —
// prefer it (the tab-based scan keys snapshots by the card's code cell, with
// the link id as fallback — same rule here so both scans share entries).
function extractInstantCourses(html) {
    const out = [];
    const seen = new Set();
    const re = /href="[^"]*?\/student\/course\/([A-Za-z0-9_-]{2,})/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const id = m[1];
        if (seen.has(id)) continue;
        seen.add(id);
        const context = html.slice(m.index, m.index + 900);
        const code = context.match(/(?<![A-Za-z0-9])([A-Z]{2,4}\d{3}[A-Z]?\d?)(?![A-Za-z0-9])/);
        out.push({ code: code ? code[1] : id, id });
    }
    return out;
}

// Submissions — /student/course/submission/<code>: one row per submission;
// the title cell carries the rec_submission_title class (tab-scan mirror:
// table tbody tr, td.rec_submission_title).
function extractInstantSubmissions(html) {
    const out = [];
    if (!html) return out;
    for (const row of String(html).split('<tr')) {
        if (row.toLowerCase().includes('no submission uploaded')) continue;
        const m = row.match(/<td[^>]*rec_submission_title[^>]*>([\s\S]*?)<\/td>/i);
        const title = m ? instantText(m[1]) : '';
        if (title) out.push(title);
    }
    return out;
}

// Materials — /student/course/material/<code>: table_tree rows, 2nd cell =
// the title (tab-scan mirror).
function extractInstantMaterials(html) {
    const out = [];
    if (!html) return out;
    const table = String(html).match(/<table[^>]*table_tree[^>]*>[\s\S]*?<\/table>/i);
    if (!table) return out;
    const body = table[0].match(/<tbody>([\s\S]*?)<\/tbody>/i);
    if (!body) return out;
    for (const row of body[1].split('<tr')) {
        const tds = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
        if (tds.length < 2) continue;
        const title = instantText(tds[1]);
        if (title) out.push(title);
    }
    return out;
}

// Grades — /student/course/gradebook/<code>: table_tree (else first table),
// child rows only; first cell = label, last cell = value (tab-scan mirror).
function extractInstantGrades(html) {
    const out = [];
    if (!html) return out;
    const table = String(html).match(/<table[^>]*table_tree[^>]*>[\s\S]*?<\/table>/i)
        || String(html).match(/<table[^>]*>[\s\S]*?<\/table>/i);
    if (!table) return out;
    const body = table[0].match(/<tbody>([\s\S]*?)<\/tbody>/i);
    if (!body) return out;
    for (const row of body[1].split('<tr')) {
        if (!/table-child-row/.test(row)) continue;
        const tds = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
        if (!tds.length) continue;
        const label = instantText(tds[0]);
        const value = instantText(tds[tds.length - 1]);
        if (label) out.push({ label, value });
    }
    return out;
}

async function runInstantCourseScan() {
    const dash = await instantFetchPage('/student/dashboard');
    if (!dash) return; // not logged in / page unavailable — next tick
    const courses = extractInstantCourses(dash);
    if (!courses.length) return;

    const st = await chrome.storage.local.get(['ucp_course_snapshots_v1', 'ucp_course_updates', 'ucp_notif_course_filter']);
    const snapshot = (st && st.ucp_course_snapshots_v1) || {};
    const storedUpdates = (st && Array.isArray(st.ucp_course_updates)) ? st.ucp_course_updates : [];
    const filter = (st && st.ucp_notif_course_filter) || 'all';

    // diffCourse equivalent (tab-scan contract): no previous snapshot for a
    // course → baseline only, no items.
    const fresh = [];
    let next = 0;
    const workers = Array.from({ length: Math.min(4, courses.length) }, async () => {
        while (next < courses.length) {
            const course = courses[next++];
            const code = course.code;
            const subHtml = await instantFetchPage(`/student/course/submission/${code}`);
            const matHtml = await instantFetchPage(`/student/course/material/${code}`);
            const gradeHtml = await instantFetchPage(`/student/course/gradebook/${code}`);
            const current = {
                submissions: extractInstantSubmissions(subHtml),
                materials: extractInstantMaterials(matHtml),
                grades: extractInstantGrades(gradeHtml),
            };
            const prev = snapshot[code];
            if (prev) {
                const seenSub = new Set(prev.submissions || []);
                const seenMat = new Set(prev.materials || []);
                const prevGrades = prev.grades || {};
                for (const t of current.submissions) {
                    if (!seenSub.has(t)) fresh.push({ code, type: 'submission', icon: '📝', title: t, url: `/student/course/submission/${code}` });
                }
                for (const t of current.materials) {
                    if (!seenMat.has(t)) fresh.push({ code, type: 'content', icon: '📄', title: t, url: `/student/course/material/${code}` });
                }
                for (const g of current.grades) {
                    if (!(g.label in prevGrades) || prevGrades[g.label] !== g.value) {
                        fresh.push({ code, type: 'grade', icon: '🏆', title: g.label, value: g.value, url: `/student/course/gradebook/${code}` });
                    }
                }
            }
            snapshot[code] = {
                submissions: current.submissions,
                materials: current.materials,
                grades: Object.fromEntries(current.grades.map((g) => [g.label, g.value])),
                updatedAt: new Date().toISOString(),
            };
        }
    });
    await Promise.all(workers);
    await chrome.storage.local.set({ ucp_course_snapshots_v1: snapshot });
    if (!fresh.length) return;

    // Merge into the persisted updates list — same dedup key, shape and 120
    // cap as the tab-based scan — so the Course Updates feed picks the items
    // up next time it renders.
    const nowIso = new Date().toISOString();
    const seen = new Set(storedUpdates.map((it) => `${it.type}|${it.code}|${it.title}`));
    const merged = [];
    for (const it of fresh) {
        const key = `${it.type}|${it.code}|${it.title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        it.at = nowIso;
        merged.push(it);
    }
    if (!merged.length) return;
    await chrome.storage.local.set({ ucp_course_updates: merged.concat(storedUpdates).slice(0, 120) });

    // Respect the user's type filter for the notification (mirror of
    // filterMatches in js/notification_page.js), then notify in the same
    // shape as the tab-based scan's SHOW_COURSE_NOTIF.
    const matching = merged.filter((it) => (filter === 'all' || it.type === filter));
    if (!matching.length) return;
    const typeLabel = { submission: 'New submission', content: 'New content', grade: 'Grade updated' };
    const lines = matching.slice(0, 3).map((it) => `${it.code || 'Course'} · ${typeLabel[it.type] || it.type}`);
    const extra = matching.length - lines.length;
    const title = `${matching.length} new course update${matching.length > 1 ? 's' : ''}`;
    const message = lines.join('\n') + (extra > 0 ? `\n+${extra} more` : '');
    await chrome.notifications.create('ucp-instant-' + Date.now(), {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title,
        message,
        priority: 2,
    });
    // Mirror the browser notification to the configured external targets
    // (phone via ntfy, Discord Webhook) — see pushExternalChannels.
    pushExternalChannels(title, message);
}

// =========================================================================
// EXTERNAL DELIVERY — ntfy (phones) + Discord Webhook, fired alongside the
// browser notification from BOTH scan paths (the background instant scan
// above and the tab scan's SHOW_COURSE_NOTIF handler). Both targets live in
// the extension's own storage (Settings → Notifications card); empty =
// disabled. The phone subscribes to a private topic (ucp-<24 hex> — the QR
// / link it opens is https://ntfy.sh/<topic>); ntfy and the Discord webhook
// API both allow cross-origin POSTs, so no extra permissions are needed.
// Fire-and-forget: a delivery hiccup must never break the browser notify.
// =========================================================================
async function pushExternalChannels(title, message) {
    try {
        const r = await chrome.storage.local.get(['ucp_ntfy_topic', 'ucp_discord_webhook']);
        const topic = r && r.ucp_ntfy_topic;
        if (topic) {
            await fetch('https://ntfy.sh/' + encodeURIComponent(topic), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, message, tag: 'bell', priority: 3 }),
            });
        }
        const hook = r && r.ucp_discord_webhook;
        if (hook && /^https:\/\//i.test(hook)) {
            await fetch(hook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'UCP Smart Portal', content: `${title}\n${message}` }),
            });
        }
    } catch (e) { console.warn('UCP external delivery failed', e); }
}

// First run (or a fresh install): default the notification mode to
// Background notification and the master toggle ON. Only seeds when NEITHER
// push key has ever been written (an explicit both-false pair is left
// alone). ucp_notif_enabled missing = ON everywhere (the gates check for an
// explicit false), so upgrading users need no migration.
async function seedNotifDefaults() {
    try {
        const r = await chrome.storage.local.get(['ucp_push_notify', 'ucp_instant_push']);
        if (r && r.ucp_push_notify === undefined && r.ucp_instant_push === undefined) {
            await chrome.storage.local.set({ ucp_push_notify: true, ucp_instant_push: true, ucp_notif_enabled: true });
        }
    } catch (e) {}
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm || alarm.name !== INSTANT_ALARM) return;
    (async () => {
        try {
            const r = await chrome.storage.local.get(['ucp_instant_push', 'ucp_notif_enabled']);
            if (!(r && r.ucp_instant_push)) return; // switched off mid-flight
            if (r && r.ucp_notif_enabled === false) return; // master toggle off (Settings)
            await runInstantCourseScan();
        } catch (e) { console.warn('UCP instant push: scan tick failed', e); }
    })();
});

// service worker lifecycle: sync on activation/startup/install
self.addEventListener('activate', () => {
    console.info('background service worker activated — syncing storage');
    syncAllTabsWithStorage();
    // Re-arm the scan alarms if either push toggle was left on (alarms don't
    // survive an extension reload).
    syncPushAlarm();
    syncInstantAlarm();
});
chrome.runtime.onStartup?.addListener(async () => {
    console.info('runtime.onStartup — syncing storage');
    await seedNotifDefaults();
    syncAllTabsWithStorage();
    syncPushAlarm();
    syncInstantAlarm();
});
chrome.runtime.onInstalled?.addListener(async () => {
    console.info('runtime.onInstalled — syncing storage');
    await seedNotifDefaults();
    syncAllTabsWithStorage();
    syncPushAlarm();
    syncInstantAlarm();
});

async function fetchCourseCodeQuietly(url) {
    try {
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) return '';

        const html = await response.text();
        const codeElement = html.match(
            /<[^>]*id=["']courseCode["'][^>]*>([\s\S]*?)<\/[^>]+>/i
        );
        const codeText = codeElement?.[1]
            ?.replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim() || '';
        const codeMatch = codeText.match(/[A-Z0-9]+(?:-[A-Z0-9]+){2,}/i);
        if (codeMatch) return codeMatch[0];

        return html.match(/[A-Z0-9]+(?:-[A-Z0-9]+){2,}/i)?.[0] || '';
    } catch (error) {
        return '';
    }
}

// Allow content scripts to request tab reload or rendered course-code lookup.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'GET_RENDERED_COURSE_CODE' && msg.url) {
        fetchCourseCodeQuietly(msg.url).then((courseCode) => {
            sendResponse({ courseCode });
        });
        return true;
    }

    if (msg?.type === 'RELOAD_ME' && sender?.tab?.id) {
        console.info('Reloading tab due to toggle change:', sender.tab.id);
        chrome.tabs.reload(sender.tab.id);
    }

    // Content script asks for the extension's own storage usage. The service
    // worker has full access to getUsage()/getBytesInUse() (not always exposed
    // to content scripts), so it computes the total + the background-image
    // share and returns both.
    if (msg?.type === 'GET_STORAGE_USAGE') {
        (async () => {
            let bytes = 0, quotaBytes = 10485760, bgBytes = 0;
            try {
                const u = await chrome.storage.local.getUsage();
                bytes = (u && u.bytes) || 0;
                quotaBytes = (u && u.quotaBytes) || 10485760;
            } catch (e) {}
            try {
                bgBytes = (await chrome.storage.local.getBytesInUse(['background-wallpaper-path'])) || 0;
            } catch (e) {}
            sendResponse({ bytes, quotaBytes, bgBytes });
        })();
        return true; // async response
    }

    // Content script requests a portal page (/student/course/announcement/<id>,
    // /student/course/gradebook/<code>, …). Fetched HERE, not in the page: a
    // page-context fetch of a 404/503-ing URL logs "Failed to load resource" in
    // the page console on every attempt (courses without an announcement page
    // always 404; the gradebook intermittently 503s). A service-worker fetch
    // returns the non-ok RESPONSE as plain data — no console noise at all.
    // Same-origin only (this is a generic fetch proxy — keep it tight).
    if (msg?.type === 'GET_PORTAL_PAGE' && msg.url) {
        (async () => {
            let ok = false, status = 0, text = '';
            try {
                const u = new URL(msg.url);
                if (u.origin === 'https://horizon.ucp.edu.pk') {
                    const res = await fetch(u.href, { credentials: 'include' });
                    ok = res.ok; status = res.status;
                    if (ok) text = await res.text();
                }
            } catch (e) {
                // Network error → ok=false, status=0 (caller treats as no-data).
            }
            sendResponse({ ok, status, text });
        })();
        return true; // async response
    }

    // Content script requests the public UCP academic calendar page
    // (https://ucp.edu.pk/academic-calendar/). That origin is cross-origin to the
    // portal, so the service worker — which holds the ucp.edu.pk host permission —
    // fetches it and returns the raw HTML for the content script to parse (the SW
    // has no DOMParser). No credentials: the page is public, no login required.
    if (msg?.type === 'GET_ACADEMIC_CALENDAR') {
        (async () => {
            let html = '';
            try {
                const res = await fetch('https://ucp.edu.pk/academic-calendar/', {
                    credentials: 'omit',
                });
                if (res.ok) html = await res.text();
            } catch (e) {
                console.warn('UCP: academic-calendar fetch failed', e);
            }
            sendResponse({ html });
        })();
        return true; // async response
    }

    // Content script requests the public UCP announcements listing
    // (https://ucp.edu.pk/announcement/). That origin is cross-origin to the portal,
    // so the service worker — which holds the ucp.edu.pk host permission — fetches
    // it and returns the raw HTML for the content script to parse (the SW has no
    // DOMParser). No credentials: the page is public, no login required.
    // (Message type kept as GET_UCP_TODAY for backward-compat with the caller.)
    if (msg?.type === 'GET_UCP_TODAY') {
        (async () => {
            let html = '';
            try {
                const res = await fetch('https://ucp.edu.pk/announcement/', {
                    credentials: 'omit',
                });
                if (res.ok) html = await res.text();
            } catch (e) {
                console.warn('UCP: announcement fetch failed', e);
            }
            sendResponse({ html });
        })();
        return true; // async response
    }

    // Instant Push was toggled in the Course Updates scan bar. The worker owns
    // the alarm (content scripts can't create chrome.alarms), so it also
    // mirrors the flag into storage as the single source of truth.
    if (msg?.type === 'UCP_PUSH_ENABLED') {
        (async () => {
            try {
                await chrome.storage.local.set({ ucp_push_notify: !!msg.on });
                await syncPushAlarm();
                await syncInstantAlarm(); // the quick toggle may have flipped the instant flag too
            } catch (e) { console.warn('UCP push: enable/disable failed', e); }
            sendResponse({ ok: true });
        })();
        return true; // async response
    }

    // A course scan (manual, on-load or the background alarm) found NEW items
    // and Instant Push is on: show a browser notification. The content script
    // already filtered `items` through the user's type filter (All /
    // Submissions / Content / Grades).
    if (msg?.type === 'SHOW_COURSE_NOTIF' && Array.isArray(msg.items) && msg.items.length) {
        (async () => {
            try {
                const typeLabel = { submission: 'New submission', content: 'New content', grade: 'Grade updated' };
                const lines = msg.items.slice(0, 3).map((it) => `${it.code || 'Course'} · ${typeLabel[it.type] || it.type}`);
                const extra = msg.items.length - lines.length;
                const n = msg.items.length;
                const title = `${n} new course update${n > 1 ? 's' : ''}`;
                const message = lines.join('\n') + (extra > 0 ? `\n+${extra} more` : '');
                await chrome.notifications.create('ucp-course-' + Date.now(), {
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title,
                    message,
                    priority: 2,
                });
                // Mirror to the configured external targets (phone via ntfy,
                // Discord Webhook) — fire-and-forget.
                pushExternalChannels(title, message);
            } catch (e) { console.warn('UCP push: notification failed', e); }
            sendResponse({ ok: true });
        })();
        return true; // async response
    }

    // "Send test" for the phone (ntfy) pairing + Discord Webhook, posted
    // from the Notifications card in Settings (js/settings_page.js).
    if (msg?.type === 'UCP_NTFY_TEST') {
        (async () => {
            try {
                const r = await chrome.storage.local.get('ucp_ntfy_topic');
                const topic = r && r.ucp_ntfy_topic;
                if (topic) {
                    await fetch('https://ntfy.sh/' + encodeURIComponent(topic), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title: 'UCP Smart Portal',
                            message: 'Phone push linked — if this reached your phone, you are all set.',
                            tag: 'white_check_mark',
                            priority: 4,
                        }),
                    });
                }
            } catch (e) { console.warn('UCP ntfy test failed', e); }
            sendResponse({ ok: true });
        })();
        return true; // async response
    }

    if (msg?.type === 'UCP_DISCORD_TEST') {
        (async () => {
            try {
                const r = await chrome.storage.local.get('ucp_discord_webhook');
                const hook = r && r.ucp_discord_webhook;
                if (hook && /^https:\/\//i.test(hook)) {
                    await fetch(hook, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username: 'UCP Smart Portal',
                            content: 'UCP Smart Portal — Discord delivery test. If this landed in the channel, the Webhook is set up.',
                        }),
                    });
                }
            } catch (e) { console.warn('UCP Discord test failed', e); }
            sendResponse({ ok: true });
        })();
        return true; // async response
    }
});

// Clicking a push notification opens the Notification & Updates page. Reuse an
// existing portal tab when one is open (navigate it); otherwise open one.
chrome.notifications.onClicked.addListener((id) => {
    try { chrome.notifications.clear(id); } catch (e) {}
    const url = 'https://horizon.ucp.edu.pk/student/notifications';
    try {
        chrome.tabs.query({ url: 'https://horizon.ucp.edu.pk/*' }, (tabs) => {
            const tab = (tabs || []).find((t) => t.id != null);
            if (tab) {
                chrome.tabs.update(tab.id, { url, active: true }, () => {
                    if (tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true });
                });
            } else {
                chrome.tabs.create({ url, active: true });
            }
        });
    } catch (e) {}
});

