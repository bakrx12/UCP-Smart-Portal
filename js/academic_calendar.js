(function () {
  if (window.__ucpAcadCal) return; // guard against double injection

  const CACHE_KEY = 'ucp_academic_calendar';
  let inflight = null;

  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function monthIndex(name) {
    const k = String(name || '').trim().toLowerCase().slice(0, 3);
    return MONTHS[k] !== undefined ? MONTHS[k] : -1;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"'`=\/]/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
      "'": '&#39;', '`': '&#x60;', '=': '&#x3D;', '/': '&#x2F;',
    }[c]));
  }

  function emptyModel() {
    return { sections: [], headlines: [], milestones: [], holidays: [], _source: 'empty' };
  }
  function hasContent(m) {
    return !!(m && (m.headlines.length || m.milestones.length || m.holidays.length));
  }

  // Earliest calendar date mentioned in a date cell. Handles single dates and
  // ranges ("23-28 Nov 2026", "25 Jan – 03 Feb 2027"); for a range it returns
  // the START date so ordering (nearest-upcoming) is correct.
  function parseDate(text) {
    if (!text) return null;
    const s = String(text);
    const found = [];
    // Same-month range: "23-28 November 2026" -> day 23.
    const range = s.match(/\b(\d{1,2})\s*[-–—]\s*\d{1,2}\s+([A-Za-z]{3,9})\s+(\d{4})\b/);
    if (range) {
      const d = new Date(+range[3], monthIndex(range[2]), +range[1]);
      if (!isNaN(d.getTime())) found.push(d);
    }
    // Every single "DD Month YYYY" occurrence (covers cross-month ranges too).
    const re = /\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const d = new Date(+m[3], monthIndex(m[2]), +m[1]);
      if (!isNaN(d.getTime())) found.push(d);
    }
    if (!found.length) return null;
    return found.reduce((a, b) => (b < a ? b : a));
  }

  // Split "Allama Iqbal Day* 09 November 2026 (Monday)" into name + date text.
  function splitNameDate(text) {
    const tba = /to be announced/i.exec(text);
    const dm = text.match(/\b\d{1,2}\s*(?:[-–—]\s*\d{1,2})?\s+[A-Za-z]{3,9}\s+\d{4}\b/);
    let cut = -1;
    if (dm && dm.index != null) cut = dm.index;
    else if (tba) cut = tba.index;
    if (cut < 0) return null;
    const name = text.slice(0, cut).replace(/[•·\-*–—:\s]+$/, '').trim();
    const dateText = text.slice(cut).replace(/^[\s•·\-*–—]+/, '').trim();
    return { name, dateText, dateISO: parseDate(dateText) };
  }

  // term
  const SEASON_RE = /\b(autumn|fall|spring|summer|winter)\s+(\d{4})\b/i;
  function termFromHeading(el) {
    const m = SEASON_RE.exec(el.textContent || '');
    if (!m) return null;
    const s = m[1];
    return s.charAt(0).toUpperCase() + s.slice(1) + ' ' + m[2];
  }

  //
  function tableIsMilestones(table) {
    const rows = Array.from(table.querySelectorAll('tr'));
    const body = rows.find((r) => !r.querySelector('th')) || rows[0];
    if (!body) return false;
    const c = Array.from(body.children).map((td) => (td.textContent || '').trim());
    const d1 = parseDate(c[1]);
    const d2 = parseDate(c[2]);
    if (d1 && !d2) return true;                       // date in the middle column
    if (d2 && c[0] && /^\d{1,3}$/.test(c[0])) return false; // date last, int first
    return false;
  }

  function parseTableRows(table, isMilestones, term) {
    const rows = [];
    table.querySelectorAll('tr').forEach((tr) => {
      if (tr.querySelector('th')) return; // header row
      const cells = Array.from(tr.children).map((td) => (td.textContent || '').trim());
      if (cells.length < 2) return;
      if (isMilestones) {
        const name = cells[0], dateText = cells[1], week = cells[2] || '';
        if (name && name.length >= 3) rows.push({ name, dateText, dateISO: parseDate(dateText), week, term });
      } else {
        const name = cells[1], dateText = cells[2];
        if (name && name.length >= 3) rows.push({ name, dateText, dateISO: parseDate(dateText), week: '', term });
      }
    });
    return rows;
  }

  // A holiday/convocation bullet item must carry a date (or tba)
  const HOLIDAY_KW = /\b(day|convocation|announced|holiday|break|ceremony|fair|eid|milad)\b/i;
  function parseHolidayList(ul, term) {
    const out = [];
    ul.querySelectorAll('li').forEach((li) => {
      const text = (li.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length < 5 || text.length > 160) return;
      if (!HOLIDAY_KW.test(text)) return;
      const d = parseDate(text);
      if (!d && !/to be announced/i.test(text)) return;
      const parts = splitNameDate(text);
      if (!parts || !parts.name || parts.name.length < 3) return;
      out.push({ name: parts.name, dateText: parts.dateText, dateISO: d, term, isConvocation: /convocation/i.test(text) });
    });
    return out;
  }

  function parseCalendarHtml(doc) {
    const model = emptyModel();
    const sections = [];
    let current = null;
    const ensure = (term) => {
      let s = sections.find((x) => x.term === term);
      if (!s) { s = { term, headlines: [], milestones: [], holidays: [] }; sections.push(s); }
      return s;
    };

    doc.querySelectorAll('h1,h2,h3,h4,h5,h6,table,ul').forEach((el) => {
      const tag = el.tagName;
      if (/^H[1-6]$/.test(tag)) {
        const t = termFromHeading(el);
        if (t) current = ensure(t);
        return;
      }
      if (!current) return;
      if (tag === 'TABLE') {
        const isM = tableIsMilestones(el);
        const rows = parseTableRows(el, isM, current.term);
        if (!rows.length) return;
        if (isM) current.milestones.push(...rows);
        else current.headlines.push(...rows);
      } else if (tag === 'UL') {
        const h = parseHolidayList(el, current.term);
        if (h.length) current.holidays.push(...h);
      }
    });

    sections.forEach((s) => { s.items = s.milestones.concat(s.holidays); });

    // Flatten for the term-agnostic consumers (dashboard Term-Progress overlay,
    // the "Next up" mini-card) that don't care which term an item belongs to.
    model.sections = sections;
    model.milestones = sections.flatMap((s) => s.milestones);
    model.headlines = sections.flatMap((s) => s.headlines);
    model.holidays = sections.flatMap((s) => s.holidays);
    const seen = new Set();
    model.holidays = model.holidays.filter((h) => {
      const k = h.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    model._source = 'live';
    if (!hasContent(model)) {
      console.warn('[UCP academic calendar] no recognizable data — term headings & tables:');
      doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) =>
        console.log('  heading: ' + (h.textContent || '').trim().slice(0, 70)));
      doc.querySelectorAll('table').forEach((t, i) =>
        console.log('  table[' + i + '] rows=' + t.querySelectorAll('tr').length));
    }
    return model;
  }

  // SW fetch (cross-origin) with a stale-context / no-response fallback
  function swFetchHtml() {
    return new Promise((resolve) => {
      try {
        const alive = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
        if (!alive) { resolve(''); return; }
        let answered = false;
        chrome.runtime.sendMessage({ type: 'GET_ACADEMIC_CALENDAR' }, (resp) => {
          if (chrome.runtime.lastError) { /* stale/absent SW — resolve '' */ }
          answered = true;
          resolve((resp && resp.html) || '');
        });
        setTimeout(() => { if (!answered) resolve(''); }, 8000);
      } catch (e) {
        resolve('');
      }
    });
  }

  function readCache() {
    return new Promise((resolve) => {
      try { chrome.storage.local.get(CACHE_KEY, (r) => resolve(r && r[CACHE_KEY] ? r[CACHE_KEY] : null)); }
      catch (e) { resolve(null); }
    });
  }
  function writeCache(model) {
    try {
      const at = Date.now();
      // Cache the FULL display state, not just the raw model: the "Next up"
      // item + which term to render first (term order) are stored so a later
      // load serving the cache shows the SAME next-up / term order the page-load
      // refresh produced, instead of recomputing from a possibly-shifted "now".
      const snapshot = deriveSnapshot(model, at);
      model._snapshot = snapshot; // round-trips with the model; render reads it
      chrome.storage.local.set({ [CACHE_KEY]: { model, at, snapshot } });
    } catch (e) {}
  }

  // Drop the cached calendar (extension's own chrome.storage.local only) so the
  // next fetch re-parses live. Exposed for the Settings "clear cache" action.
  function clearCache() {
    try { chrome.storage.local.remove(CACHE_KEY); } catch (e) {}
  }

  // chrome.storage.local round-trips the model as JSON, which turns the Date
  // objects parseDate() produced into ISO strings. Anything that later calls
  // dateISO.getTime() (nearestUpcoming, the term-grouping feed) would throw on
  // a cached model, so rehydrate the dates to real Date objects right after
  // reading from storage. Idempotent — a fresh in-memory model already holds
  // Dates, so normalizing it is a no-op.
  function toDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function normalizeDates(model) {
    if (!model) return model;
    const fix = (list) => (Array.isArray(list)
      ? list.map((it) => (it ? { ...it, dateISO: toDate(it.dateISO) } : it))
      : list);
    model.headlines = fix(model.headlines);
    model.milestones = fix(model.milestones);
    model.holidays = fix(model.holidays);
    if (Array.isArray(model.sections)) {
      model.sections = model.sections.map((s) => (s ? {
        ...s,
        headlines: fix(s.headlines),
        milestones: fix(s.milestones),
        holidays: fix(s.holidays),
        items: fix(s.items),
      } : s));
    }
    return model;
  }

  // The calendar's "refresh point": the THIRD-LAST dated entry across the whole
  // model. The annual calendar is effectively static until the terms it shows
  // wind down, so auto-refresh is gated on "now" having reached this date —
  // i.e. we let the already-rendered terms run their course before re-fetching.
  // (ts() coerces the string dates a cached model carries.) Falls back to the
  // last date when there are fewer than three dated entries; null when there
  // are none (a cache with no dates can't gate a refresh → we re-fetch).
  function calendarRefreshThreshold(model) {
    const dates = [].concat(model.headlines || [], model.milestones || [], model.holidays || [])
      .map((i) => ts(i.dateISO))
      .filter((t) => t !== Infinity)
      .sort((a, b) => a - b);
    if (!dates.length) return null;
    return dates.length >= 3 ? dates[dates.length - 3] : dates[dates.length - 1];
  }

  // Return the calendar model. Serves the cache unless we've been told to force
  // a refresh (the manual refresh button), the cache is empty/missing, or the
  // refresh point (third-last date) has been reached. _source marks provenance
  // ('live' | 'cache' | 'stale' | 'empty'); every model that leaves this
  // function has real Date objects (normalizeDates).
  async function fetchCalendar(force) {
    const cached = await readCache();
    const cachedModel = cached && cached.model;
    const cacheUsable = !!(cachedModel && hasContent(cachedModel));
    let pastRefreshPoint = false;
    if (cacheUsable) {
      const threshold = calendarRefreshThreshold(cachedModel);
      pastRefreshPoint = threshold !== null && Date.now() >= threshold;
    }
    if (!force && cacheUsable && !pastRefreshPoint) {
      const model = normalizeDates(cached.model);
      model._source = 'cache';
      return model;
    }
    if (inflight) return inflight;
    inflight = (async () => {
      const html = await swFetchHtml();
      if (html) {
        const model = normalizeDates(parseCalendarHtml(new DOMParser().parseFromString(html, 'text/html')));
        if (hasContent(model)) { writeCache(model); return model; }
      }
      // Live fetch/parse failed: fall back to a stale cache if we have one,
      // else an empty model (the caller then shows its error state).
      const stale = cached && cached.model;
      if (stale) { stale._source = 'stale'; return normalizeDates(stale); }
      return emptyModel();
    })().finally(() => { inflight = null; });
    return inflight;
  }

  // Best-effort read of the student's current semester number (1..12) from the
  // LMS profile. Returns null when it can't be determined (Convocation then
  // stays hidden). (?<!\d)/(?!\d) keep the match from latching onto a year.
  async function getSemesterNumber() {
    try {
      const res = await fetch('/student/profile', { credentials: 'include' });
      if (!res.ok) return null;
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const text = doc.body ? doc.body.textContent
        : (doc.documentElement && doc.documentElement.textContent) || '';
      const patterns = [
        /semester[:\s–—\-]*(?<!\d)(\d{1,2})(?!\d)/i,
        /\b(\d{1,2})\s*(?:st|nd|rd|th)\s+semester\b/i,
        /\bterm[:\s–—\-]*(?<!\d)(\d{1,2})(?!\d)/i,
        /(\d{1,2})\s*(?:st|nd|rd|th)\s+(?:term|semester)\b/i,
      ];
      for (const re of patterns) {
        const m = text.match(re);
        if (m && m[1]) {
          const n = parseInt(m[1], 10);
          if (n >= 1 && n <= 12) return n;
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  //small render helpers (reused by both pages)
  // Coerce a date value (Date or, defensively, a JSON-round-tripped ISO string)
  // to a timestamp; unparseable/absent → Infinity so it sorts to the end and is
  // dropped by "> t" filters. normalizeDates() already hands back real Dates,
  // so this is a belt-and-braces backstop against any old-shaped cached model.
  function ts(v) {
    if (!v) return Infinity;
    const d = v instanceof Date ? v : new Date(v);
    const n = d.getTime();
    return isNaN(n) ? Infinity : n;
  }
  function nearestHeadline(model, now) {
    const t = (now || new Date()).getTime();
    const upcoming = (model.headlines || []).filter((h) => { const x = ts(h.dateISO); return x !== Infinity && x > t; });
    if (!upcoming.length) return null;
    upcoming.sort((a, b) => ts(a.dateISO) - ts(b.dateISO));
    return upcoming[0];
  }
  // Nearest UPCOMING dated item across every term (headlines + milestones +
  // holidays) — used by the "Next up" mini-card so it reflects the actual next
  // event (and carries its .term label).
  function nearestUpcoming(model, now) {
    const t = (now || new Date()).getTime();
    const all = [].concat(model.headlines || [], model.milestones || [], model.holidays || [])
      .filter((i) => { const x = ts(i.dateISO); return x !== Infinity && x > t; })
      .sort((a, b) => ts(a.dateISO) - ts(b.dateISO));
    if (!all.length) return null;
    return all[0];
  }
  // Plain, JSON-serializable snapshot of the DISPLAY state as of `at`: the
  // "Next up" item, the nearest upcoming headline, and the term render order
  // (ongoing first, then upcoming, then past) — i.e. which term to render first.
  // Stored with the model in the cache (see writeCache). Dates are rehydrated to
  // real Dates by normalizeDates before this runs; the snapshot keeps them as ISO
  // strings so they survive the storage round-trip (ts() coerces them back).
  function deriveSnapshot(model, nowMs) {
    nowMs = nowMs != null ? nowMs : Date.now();
    const plain = (i) => (i ? {
      name: i.name, term: i.term, dateText: i.dateText,
      dateISO: i.dateISO ? (i.dateISO instanceof Date ? i.dateISO.toISOString() : i.dateISO) : null,
    } : null);
    // Rank each term's date span exactly like orderTerms() does at render:
    // ongoing (now inside the span) first, then upcoming, then past, then undated.
    const sections = model.sections || [];
    const ranked = sections.map((s) => {
      const dates = [].concat(s.headlines || [], s.milestones || [], s.holidays || [])
        .map((i) => ts(i.dateISO)).filter((x) => x !== Infinity);
      const min = dates.length ? Math.min.apply(null, dates) : null;
      const max = dates.length ? Math.max.apply(null, dates) : null;
      let rank;
      if (min === null) rank = 3;        // no dated rows → last
      else if (nowMs < min) rank = 1;    // fully upcoming
      else if (nowMs > max) rank = 2;    // fully past
      else rank = 0;                     // ongoing
      return { s, rank, key: min };
    });
    ranked.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.rank === 2) return (b.key || 0) - (a.key || 0);       // past: most recent first
      return (a.key || Infinity) - (b.key || Infinity);           // upcoming/ongoing: earliest first
    });
    const ongoing = ranked.find((r) => r.rank === 0);
    return {
      at: nowMs,
      nextUp: plain(nearestUpcoming(model, new Date(nowMs))),
      nearestHeadline: plain(nearestHeadline(model, new Date(nowMs))),
      firstTerm: ranked.length ? ranked[0].s.term : null,
      ongoingTerm: ongoing ? ongoing.s.term : null,
      termOrder: ranked.map((r) => r.s.term),
    };
  }
  function daysUntil(d, now) {
    const start = new Date(d); start.setHours(0, 0, 0, 0);
    const base = new Date(now || new Date()); base.setHours(0, 0, 0, 0);
    return Math.round((start - base) / 86400000);
  }
  function countdown(d, now) {
    const n = daysUntil(d, now);
    if (n < 0) return 'passed';
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    return 'in ' + n + ' days';
  }
  function formatShortDate(d) {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  // Just the day-of-week ("Mon"), same locale as formatShortDate() so the two
  // always agree. The calendar page tacks "(Monday)" onto each date; this lets
  // the feed split the date and the weekday into separate right-aligned cells.
  function formatDayOfWeek(d) {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString(undefined, { weekday: 'short' });
  }

  window.__ucpAcadCal = {
    fetchCalendar, getSemesterNumber, nearestHeadline, nearestUpcoming, hasContent,
    calendarRefreshThreshold, daysUntil, countdown, formatShortDate, formatDayOfWeek, ts, esc,
    clearCache,
  };
})();
