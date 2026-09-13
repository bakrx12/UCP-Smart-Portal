// UCP Smart Portal — Enrollment Timetable (display-only)
//
// /student/enrollment/timetable — shows the live schedule the portal renders
// on this very page (li.cd-schedule__group — the SAME source and parse the
// class-schedule page uses) inside the class-schedule grid/card design
// (styles/student_timetable.css, injected by the background worker for this
// URL). Profile / Local Cache / Edit details are intentionally NOT part of
// this view — it is a pure display of the fetched timetable.
//
// NOTE: content script in an ISOLATED world — no inline onclick handlers.

chrome.storage.local.get('toggle_power', (result) => {
    const enabled = result['toggle_power'];
    if (!enabled) return;
    if (!/\/student\/enrollment\/timetable/i.test(location.pathname)) return;

    const MAKEUP_CLASS = "MAKEUP CLASS";
    const days = 6;      // MON..SAT (same grid as the class-schedule page)
    const timeSlots = 10; // 08:00..17:00
    const dayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const timeNames = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

    // =========================================================================
    // FETCH — unchanged from the class-schedule page ("as it does currently"):
    // the schedule is server-rendered into this page's DOM.
    // =========================================================================
    function extractTimeTableInfo() {
        const timeTable = [];
        const dayLists = document.querySelectorAll("li.cd-schedule__group ul");

        for (const [index, day] of dayLists.entries()) {
            for (const entry of day.children) {
                const child = entry.children[0];
                if (!child) continue;

                const startTime = child.getAttribute("data-start");
                const endTime = child.getAttribute("data-end");
                const instructorName = child.children[0]?.textContent.trim() ?? "Instructor";
                const courseName = child.children[1]?.textContent.trim() ?? "Course";
                const sectionDetails = child.children[2]?.textContent.trim() ?? "Section";
                const roomNo = child.children[3]?.textContent.trim() ?? MAKEUP_CLASS;

                timeTable.push({
                    day: index,
                    startTime,
                    endTime,
                    instructorName,
                    courseName,
                    sectionDetails,
                    roomNo
                });
            }
        }

        return timeTable;
    }

    // =========================================================================
    // HELPERS
    // =========================================================================
    function toMinutes(t) {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    }

    function deriveCode(title) {
        const m = (title || '').match(/^([A-Za-z]{1,5}\d{1,4}[A-Za-z]*)/);
        return m ? m[1] : '';
    }

    function cleanRoomName(roomStr) {
        if (!roomStr) return '';
        return roomStr.replace(/\s*\(\s*(Lecture|Lab)\s*\)/gi, '').trim();
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    function getTimeRangeString(timeIndex) {
        const startTimeStr = timeNames[timeIndex];
        if (!startTimeStr) return '';
        const [hours, minutes] = startTimeStr.split(':').map(Number);
        const endTotalMinutes = hours * 60 + minutes + 55;
        const endHours = Math.floor(endTotalMinutes / 60);
        const endMins = endTotalMinutes % 60;
        const formattedEnd = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
        return `${startTimeStr} - ${formattedEnd}`;
    }

    function calculateSemesterTerm() {
        const d = new Date();
        return (d.getMonth() >= 7) ? `TERM: Fall ${d.getFullYear()}` : `TERM: Spring ${d.getFullYear()}`;
    }

    // =========================================================================
    // INJECT DOM — the class-schedule design, trimmed: no profile controls,
    // no Local Cache, no field toggles, no Edit/Print/Import (display only).
    // =========================================================================
    const appHtml = `
<div id="ucp-tt-root" class="ucp-tt-app">
  <div class="ucp-tt-timetable-container">
    <div class="ucp-tt-profile-bar">
      <div class="ucp-tt-profile-controls-left">
        <label class="ucp-tt-profile-label">📅 Enrollment Timetable</label>
      </div>
      <div class="ucp-tt-profile-controls-right">
        <div class="ucp-tt-zoom-controls" role="group" aria-label="Timetable zoom">
          <button class="ucp-tt-btn-action ucp-tt-zoom-btn" id="ucp-et-zoomOutBtn" type="button" aria-label="Zoom out timetable" title="Zoom out">−</button>
          <button class="ucp-tt-zoom-level" id="ucp-et-zoomResetBtn" type="button" aria-label="Reset timetable zoom" title="Reset zoom">115%</button>
          <button class="ucp-tt-btn-action ucp-tt-zoom-btn" id="ucp-et-zoomInBtn" type="button" aria-label="Zoom in timetable" title="Zoom in">+</button>
        </div>
        <div class="ucp-tt-header-center-term">${calculateSemesterTerm()}</div>
      </div>
    </div>

    <div class="ucp-tt-timetable-content" id="ucp-et-timetableContent">
      <div class="ucp-tt-sidebar">
        <div class="ucp-tt-sidebar-header">📅</div>
        ${dayNames.map((d, i) => `<div class="ucp-tt-day-label" data-day="${i}">${d}</div>`).join('')}
      </div>
      <div class="ucp-tt-main-grid">
        <div class="ucp-tt-time-header">
          ${timeNames.map((t, i) => `<div class="ucp-tt-time-slot" data-time="${i}">${t}</div>`).join('')}
        </div>
        <div class="ucp-tt-grid-body" id="ucp-et-gridBody"></div>
      </div>
    </div>

    <div class="ucp-tt-empty-state-overlay" id="ucp-et-empty">
      <div class="ucp-tt-empty-state-card">
        <h4>📅 No classes found</h4>
        <p>No classes are available in the portal schedule right now.</p>
      </div>
    </div>
  </div>
</div>`;

    const cardParent = document.querySelector('div.md-card');
    if (cardParent) cardParent.insertAdjacentHTML('beforebegin', appHtml);
    else document.body.insertAdjacentHTML('beforeend', appHtml);

    const root = document.getElementById('ucp-tt-root');
    if (!root) return;

    let timetableZoom = 115;

    function applyTimetableZoom() {
      const content = document.getElementById('ucp-et-timetableContent');
      const level = document.getElementById('ucp-et-zoomResetBtn');
      if (content) content.style.zoom = `${timetableZoom}%`;
      if (level) level.innerText = `${timetableZoom}%`;
      const zoomOut = document.getElementById('ucp-et-zoomOutBtn');
      const zoomIn = document.getElementById('ucp-et-zoomInBtn');
      if (zoomOut) zoomOut.disabled = timetableZoom <= 70;
      if (zoomIn) zoomIn.disabled = timetableZoom >= 130;
    }

    function changeTimetableZoom(amount) {
      timetableZoom = Math.max(70, Math.min(130, timetableZoom + amount));
      applyTimetableZoom();
    }

    function resetTimetableZoom() {
      timetableZoom = 115;
      applyTimetableZoom();
    }

    document.getElementById('ucp-et-zoomOutBtn').addEventListener('click', () => changeTimetableZoom(-10));
    document.getElementById('ucp-et-zoomResetBtn').addEventListener('click', resetTimetableZoom);
    document.getElementById('ucp-et-zoomInBtn').addEventListener('click', () => changeTimetableZoom(10));
    applyTimetableZoom();

    // The design replaces the original list (same as the class-schedule page,
    // whose stylesheet already hides .md-card on this URL).
    document.querySelectorAll('.cd-schedule').forEach((el) => { el.style.display = 'none'; });

    // =========================================================================
    // NIGHT MODE — single source of truth = Settings → Night Mode
    // (same key the class-schedule timetable reads; kept live via onChanged)
    // =========================================================================
    chrome.storage.local.get('ucp_night_mode', (r) => {
        root.classList.toggle('ucp-tt-night', !!(r && r.ucp_night_mode));
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.ucp_night_mode) {
            root.classList.toggle('ucp-tt-night', !!changes.ucp_night_mode.newValue);
        }
    });

    // =========================================================================
    // RENDER (read-only grid)
    // =========================================================================
    function createCardElement(code, section, title, room, teacher, timeIndex) {
        const card = document.createElement('div');
        card.className = 'ucp-tt-card';

        card.dataset.code = code || '';
        card.dataset.section = section || 'B1';
        card.dataset.room = cleanRoomName(room);
        card.dataset.teacher = teacher || '';
        card.dataset.title = title || '';
                        const trimmedTitle = (title || '').slice(-2);

        const timeRange = getTimeRangeString(timeIndex);

        card.innerHTML = `
          <div class="ucp-tt-card-meta-row">
            <span class="ucp-tt-mini-badge ucp-tt-card-code-badge">${escapeHtml(code)}</span>
            <span class="ucp-tt-mini-badge ucp-tt-card-section-badge">${escapeHtml(trimmedTitle)}</span>
            <span class="ucp-tt-mini-badge ucp-tt-card-time-badge" style="display:none;">${timeRange}</span>
          </div>
          <div class="ucp-tt-card-title">${escapeHtml(teacher)}</div>
          <div class="ucp-tt-card-details">
            <span class="ucp-tt-mini-badge ucp-tt-card-room-badge">${escapeHtml(cleanRoomName(section)) || 'Room Unspecified'}</span>
          </div>
        `;
        return card;
    }

    const gridBody = document.getElementById('ucp-et-gridBody');
    gridBody.innerHTML = '';

    for (let d = 0; d < days; d++) {
        const row = document.createElement('div');
        row.className = 'ucp-tt-day-row';
        for (let t = 0; t < timeSlots; t++) {
            const cell = document.createElement('div');
            cell.className = 'ucp-tt-cell';
            cell.dataset.day = d;
            cell.dataset.time = t;
            row.appendChild(cell);
        }
        gridBody.appendChild(row);
    }

    const entries = extractTimeTableInfo();
    let placed = 0;
    entries.forEach((e) => {
        if (e.day == null || e.day >= days) return;
        let slot = Math.round((toMinutes(e.startTime) - 8 * 60) / 60);
        slot = Math.max(0, Math.min(timeSlots - 1, slot));
        const target = gridBody.querySelector(`.ucp-tt-cell[data-day="${e.day}"][data-time="${slot}"]`);
        if (!target) return;
        target.appendChild(createCardElement(
            deriveCode(e.courseName),
            e.sectionDetails || '',
            e.courseName || '',
            e.roomNo || '',
            e.instructorName || '',
            slot
        ));
        placed++;
    });

    if (placed === 0) {
        document.getElementById('ucp-et-empty').classList.add('visible');
    }
    console.log(`📅 UCP Smart Portal: rendered ${placed} enrollment timetable entries in the class-schedule design.`);
});
