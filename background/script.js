// background.js (MV3 service worker) — robust parsing + default ON

const INJECTION_MAP = [
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/(?:student(?:\/|$)|join(?:\/|$)|election(?:\/|$))/i, files: ['styles/student.css'] },
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
    { pattern: /^https:\/\/horizon\.ucp\.edu\.pk\/student\/enrollment\/cards/i, files: ['styles/new_enrollment.css'] }
];

let currentEnabled = true; // ✅ default to ON

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
            await chrome.scripting.insertCSS({
                target: { tabId: tab.id, allFrames: true },
                files
            });
            console.debug('inserted css', files, 'into', tab.id, tab.url);
        } else {
            await chrome.scripting.removeCSS({
                target: { tabId: tab.id, allFrames: true },
                files
            });
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
    if (changeInfo.status === 'complete' || changeInfo.url) {
        updateTabCss(tab, true);
    }
});

// service worker lifecycle: sync on activation/startup/install
self.addEventListener('activate', () => {
    console.info('background service worker activated — syncing storage');
    syncAllTabsWithStorage();
});

chrome.runtime.onStartup?.addListener(() => {
    console.info('runtime.onStartup — syncing storage');
    syncAllTabsWithStorage();
});
chrome.runtime.onInstalled?.addListener(() => {
    console.info('runtime.onInstalled — syncing storage');
    syncAllTabsWithStorage();
});

// optional: allow popup to request immediate sync
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'SYNC_TOGGLE') {
        syncAllTabsWithStorage()
            .then(() => sendResponse({ ok: true }))
            .catch(() => sendResponse({ ok: false }));
        return true; // async
    }
});

// Allow content scripts to request tab reload
chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg?.type === 'RELOAD_ME' && sender?.tab?.id) {
        console.info('Reloading tab due to toggle change:', sender.tab.id);
        chrome.tabs.reload(sender.tab.id);
    }
});

