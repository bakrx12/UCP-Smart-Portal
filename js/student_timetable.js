
// Data is fetched exactly as before (scrape the live schedule DOM), then rendered
// in the richer grid/card design. The full feature set (profiles, drag-drop edit,
// add/edit/delete, spreadsheet editor, JSON import/export, bulk paste, local-cache
// inspector, night mode, color coding, field toggles, print) is layered on top.
//
// NOTE: this runs as a content script in an ISOLATED world. Inline onclick="fn()"
// attributes execute in the PAGE world where our functions don't exist, so all
// interaction is wired via addEventListener / property handlers below.

chrome.storage.local.get('toggle_power', (result) => {
    const enabled = result['toggle_power'];
    const MAKEUP_CLASS = "MAKEUP CLASS";

    if (!enabled) return;
 
    // FETCH 
    function extractTimeTableInfo() {
        const timeTable = [];
        const days = document.querySelectorAll("li.cd-schedule__group ul");

        for (const [index, day] of days.entries()) {
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
 
    // mapping the fetched entries from portal

    function toMinutes(t) {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    }

    function getCourseSection(courseCode) {
      const normalizedCode = String(courseCode || "").trim();
      return normalizedCode.length >= 2 ? normalizedCode.slice(-2) : "N/A";
    }

    function formatInstructorName(instructorName) {
      const normalizedName = String(instructorName || "").replace(/\s+/g, " ").trim();
      if (!normalizedName) return "Not available";

      const muhammadIndex = normalizedName.search(/\bmuhammad\b/i);
      if (muhammadIndex === -1) return normalizedName;

      const nameAfterMuhammad = normalizedName
        .slice(muhammadIndex)
        .replace(/^muhammad\b\s*/i, "")
        .trim();
      return nameAfterMuhammad || instructorName;
    }

    function getCourseCode(courseCode) {
    const normalizedCode = String(courseCode || "").trim();
    
    const hyphenIndex = normalizedCode.indexOf('-');
    if (hyphenIndex !== -1) {
        return normalizedCode.slice(0, hyphenIndex);
    }
    
    return normalizedCode.length >= 2 ? normalizedCode : "N/A";
    }
    

    function cleanRoomName(roomStr) {
        if (!roomStr) return '';
        return roomStr.replace(/\s*\(\s*(Lecture|Lab)\s*\)/gi, '').trim();
    }

    function mapFetchedToAppData(entries) {
        const out = [];
        (entries || []).forEach(e => {
            const start = toMinutes(e.startTime);
            let slot = Math.round((start - 8 * 60) / 60);
            slot = Math.max(0, Math.min(9, slot));
            out.push({
                day: e.day,
                time: slot,
                code:  getCourseCode(e.sectionDetails) || '',  
                section: getCourseSection(e.sectionDetails) || '',
                title: e.courseName || '',
                room: cleanRoomName(e.roomNo),
                teacher: formatInstructorName(e.instructorName) || '',
                color: ''
            });
        });
        return out;
    }


    // INJECT DOM
    
    const appHtml = `
<div id="ucp-tt-root" class="ucp-tt-app">
  <div class="ucp-tt-widgets-bar">
    <div class="ucp-tt-widget ucp-tt-widget-next">
      <span class="material-icons ucp-tt-widget-icon">schedule</span>
      <div class="ucp-tt-widget-main">
        <div class="ucp-tt-widget-head">Next Class</div>
        <div class="ucp-tt-widget-title" id="ucp-tt-nextTitle">Loading…</div>
        <div class="ucp-tt-widget-sub" id="ucp-tt-nextSub">Reading your schedule…</div>
      </div>
    </div>
    <div class="ucp-tt-widget ucp-tt-widget-progress">
      <span class="material-icons ucp-tt-widget-icon">timeline</span>
      <div class="ucp-tt-widget-main">
        <div class="ucp-tt-widget-head">Term Progress</div>
        <div class="ucp-tt-widget-progress-row">
          <div class="ucp-tt-progress-track"><div class="ucp-tt-progress-fill" id="ucp-tt-progressFill"></div></div>
          <span class="ucp-tt-progress-pct" id="ucp-tt-progressPct">—</span>
        </div>
        <div class="ucp-tt-widget-sub" id="ucp-tt-progressSub">Calculating…</div>
      </div>
    </div>
  </div>
  <div class="ucp-tt-timetable-container" id="ucp-tt-printableArea">
    <div class="ucp-tt-profile-bar">
      <div class="ucp-tt-profile-controls-left">
        <label class="ucp-tt-profile-label">👤 Profile:</label>
        <div class="ucp-tt-custom-profile-dropdown" id="ucp-tt-profileDropdownContainer">
          <button class="ucp-tt-profile-dropdown-btn" id="ucp-tt-profileDropdownBtn">
            <span id="ucp-tt-currentProfileLabel"> </span>
            <span>▾</span>
          </button>
          <div class="ucp-tt-profile-dropdown-menu" id="ucp-tt-profileDropdownMenu">
            <div class="ucp-tt-dropdown-section-header">Select Profile</div>
            <div id="ucp-tt-profileOptionsList"></div>
            <div class="ucp-tt-dropdown-divider"></div>
            <div class="ucp-tt-dropdown-section-header">Actions</div>
            <div class="ucp-tt-dropdown-option-item" id="ucp-tt-profileNew">➕ New Profile</div>
            <div class="ucp-tt-dropdown-option-item" id="ucp-tt-profileDuplicate">📋 Duplicate Profile</div>
            <div class="ucp-tt-dropdown-option-item" id="ucp-tt-profileDelete"><span style="color:#f87171;">🗑️ Delete Profile</span></div>
            <div class="ucp-tt-dropdown-divider"></div>
            <div class="ucp-tt-dropdown-section-header">Timetable Data</div>
            <div class="ucp-tt-dropdown-option-item" id="ucp-tt-profileImport">📥 Import Timetable</div>
            <div class="ucp-tt-dropdown-option-item" id="ucp-tt-profileExport">📤 Export Timetable</div>
          </div>
        </div>
        <button class="ucp-tt-btn-action" id="ucp-tt-localCacheBtn">Local Cache</button>
      </div>
      <div class="ucp-tt-profile-controls-right">
        <button class="ucp-tt-btn-action" id="ucp-tt-fetchBtn">Fetch from Portal</button>
                <div class="ucp-tt-zoom-controls" role="group" aria-label="Timetable zoom">
                    <button class="ucp-tt-btn-action ucp-tt-zoom-btn" id="ucp-tt-zoomOutBtn" type="button" aria-label="Zoom out timetable" title="Zoom out">−</button>
                      <button class="ucp-tt-zoom-level" id="ucp-tt-zoomResetBtn" type="button" aria-label="Reset timetable zoom" title="Reset zoom">115%</button>
                    <button class="ucp-tt-btn-action ucp-tt-zoom-btn" id="ucp-tt-zoomInBtn" type="button" aria-label="Zoom in timetable" title="Zoom in">+</button>
                </div>
        <div class="ucp-tt-header-center-term" id="ucp-tt-headerTermText">TERM: Fall 2026</div>
      </div>
    </div>

    <div class="ucp-tt-timetable-content" id="ucp-tt-timetableContent">
      <div class="ucp-tt-sidebar">
        <div class="ucp-tt-sidebar-header">📅</div>
        <div class="ucp-tt-day-label" data-day="0">MON</div>
        <div class="ucp-tt-day-label" data-day="1">TUE</div>
        <div class="ucp-tt-day-label" data-day="2">WED</div>
        <div class="ucp-tt-day-label" data-day="3">THU</div>
        <div class="ucp-tt-day-label" data-day="4">FRI</div>
        <div class="ucp-tt-day-label" data-day="5">SAT</div>
      </div>
      <div class="ucp-tt-main-grid">
        <div class="ucp-tt-time-header">
          <div class="ucp-tt-time-slot" data-time="0">08:00</div>
          <div class="ucp-tt-time-slot" data-time="1">09:00</div>
          <div class="ucp-tt-time-slot" data-time="2">10:00</div>
          <div class="ucp-tt-time-slot" data-time="3">11:00</div>
          <div class="ucp-tt-time-slot" data-time="4">12:00</div>
          <div class="ucp-tt-time-slot" data-time="5">13:00</div>
          <div class="ucp-tt-time-slot" data-time="6">14:00</div>
          <div class="ucp-tt-time-slot" data-time="7">15:00</div>
          <div class="ucp-tt-time-slot" data-time="8">16:00</div>
          <div class="ucp-tt-time-slot" data-time="9">17:00</div>
        </div>
        <div class="ucp-tt-grid-body" id="ucp-tt-gridBody"></div>
      </div>
    </div>

    <div class="ucp-tt-empty-state-overlay" id="ucp-tt-emptyStateOverlay">
      <div class="ucp-tt-empty-state-card">
        <h4>📅 Timetable is Empty</h4>
        <p>Fetch the live timetable from the portal, import a saved timetable, or edit data manually.</p>
        <div class="ucp-tt-empty-state-actions">
          <button class="ucp-tt-btn-action" id="ucp-tt-emptyImport">📥 Import Timetable</button>
          <button class="ucp-tt-btn-action" id="ucp-tt-emptyEdit">Edit Data Manually</button>
        </div>
      </div>
    </div>

    <div class="ucp-tt-footer-bar">
      <div class="ucp-tt-footer-top-row">
        <div class="ucp-tt-toggles-line">
          <label class="ucp-tt-toggle-item"><input type="checkbox" id="ucp-tt-toggleCode" checked> Course Code</label>
          <label class="ucp-tt-toggle-item"><input type="checkbox" id="ucp-tt-toggleTitle" checked> Course Name</label>
          <label class="ucp-tt-toggle-item"><input type="checkbox" id="ucp-tt-toggleSection" checked> Section</label>
          <label class="ucp-tt-toggle-item"><input type="checkbox" id="ucp-tt-toggleRoom" checked> Room</label>
          <label class="ucp-tt-toggle-item"><input type="checkbox" id="ucp-tt-toggleTeacher" checked> Teacher</label>
          <label class="ucp-tt-toggle-item"><input type="checkbox" id="ucp-tt-toggleColorCoding"> Enable Color Coding</label>
        </div>
        <div class="ucp-tt-footer-actions-right">
          <button class="ucp-tt-btn-action" id="ucp-tt-printBtn">🖨️ Print</button>
          <button class="ucp-tt-btn-action" id="ucp-tt-editDataBtn">Edit Data</button>
        </div>
      </div>
    </div>
  </div>

  <div class="ucp-tt-acadcal" id="ucp-tt-acadcal">
    <button class="ucp-tt-acadcal-toggle" id="ucp-tt-acadcalToggle" type="button" aria-expanded="false" aria-controls="ucp-tt-acadcalBody">
      <span class="material-icons">calendar_month</span>
      <span class="ucp-tt-acadcal-toggle-label">Academic Calendar</span>
      <span class="material-icons ucp-tt-acadcal-chev">expand_more</span>
    </button>
    <div class="ucp-tt-acadcal-body" id="ucp-tt-acadcalBody" hidden>
      <div class="ucp-tt-acadcal-state" id="ucp-tt-acadcalState">Loading…</div>
      <div class="ucp-tt-acadcal-terms" id="ucp-tt-acadcalTerms"></div>
    </div>
  </div>

  <div class="ucp-tt-context-menu" id="ucp-tt-contextMenu"></div>

  <div class="ucp-tt-modal-overlay" id="ucp-tt-profileModalOverlay">
    <div class="ucp-tt-modal">
      <h3 id="ucp-tt-profileModalTitle">Profile Action</h3>
      <div class="ucp-tt-form-group" id="ucp-tt-profileModalGroup">
        <label id="ucp-tt-profileModalLabel" for="ucp-tt-profileModalInput">Profile Roll No. / ID</label>
        <input type="text" id="ucp-tt-profileModalInput" placeholder="e.g. L1S26BSCS0052">
      </div>
      <div class="ucp-tt-modal-actions">
        <div></div>
        <div class="ucp-tt-right-btns">
          <button class="ucp-tt-btn ucp-tt-btn-cancel" id="ucp-tt-profileModalCancel">Cancel</button>
          <button class="ucp-tt-btn ucp-tt-btn-save" id="ucp-tt-profileModalConfirm">Confirm</button>
        </div>
      </div>
    </div>
  </div>

  <div class="ucp-tt-modal-overlay" id="ucp-tt-modalOverlay">
    <div class="ucp-tt-modal">
      <h3 id="ucp-tt-modalTitle">Edit Class Details</h3>
      <div class="ucp-tt-form-row">
        <div class="ucp-tt-form-group"><label for="ucp-tt-inputCode">Course Code</label><input type="text" id="ucp-tt-inputCode" placeholder="CP113"></div>
        <div class="ucp-tt-form-group"><label for="ucp-tt-selectSection">Section</label>
          <select id="ucp-tt-selectSection">
            <option value="B1">B1</option><option value="B2">B2</option><option value="B3">B3</option><option value="B4">B4</option>
          </select>
        </div>
      </div>
      <div class="ucp-tt-form-group"><label for="ucp-tt-inputTitle">Course Title</label><input type="text" id="ucp-tt-inputTitle" placeholder="Programming Fundamentals"></div>
      <div class="ucp-tt-form-row">
        <div class="ucp-tt-form-group"><label for="ucp-tt-inputRoom">Room</label><input type="text" id="ucp-tt-inputRoom" placeholder="C-207"></div>
        <div class="ucp-tt-form-group"><label>Card Color</label>
          <div class="ucp-tt-color-dot-wrapper" style="margin-top:5px;"><input type="color" id="ucp-tt-inputColor" class="ucp-tt-color-dot-picker" value="#14191e"><span style="font-size:0.75rem;color:#aaa;">Assign Color</span></div>
        </div>
      </div>
      <div class="ucp-tt-form-group"><label for="ucp-tt-inputTeacher">Assigned Teacher</label><input type="text" id="ucp-tt-inputTeacher" placeholder="Dr. John Doe"></div>
      <div class="ucp-tt-form-row">
        <div class="ucp-tt-form-group"><label for="ucp-tt-selectDay">Day</label>
          <select id="ucp-tt-selectDay"><option value="0">MON</option><option value="1">TUE</option><option value="2">WED</option><option value="3">THU</option><option value="4">FRI</option><option value="5">SAT</option></select>
        </div>
        <div class="ucp-tt-form-group"><label for="ucp-tt-selectTime">Time Slot</label>
          <select id="ucp-tt-selectTime"><option value="0">08:00</option><option value="1">09:00</option><option value="2">10:00</option><option value="3">11:00</option><option value="4">12:00</option><option value="5">13:00</option><option value="6">14:00</option><option value="7">15:00</option><option value="8">16:00</option><option value="9">17:00</option></select>
        </div>
      </div>
      <div class="ucp-tt-modal-actions">
        <button class="ucp-tt-btn ucp-tt-btn-danger" id="ucp-tt-btnDelete">Delete</button>
        <div class="ucp-tt-right-btns">
          <button class="ucp-tt-btn ucp-tt-btn-cancel" id="ucp-tt-modalCancel">Cancel</button>
          <button class="ucp-tt-btn ucp-tt-btn-save" id="ucp-tt-modalSave">Save</button>
        </div>
      </div>
    </div>
  </div>

  <div class="ucp-tt-modal-overlay" id="ucp-tt-excelModalOverlay">
    <div class="ucp-tt-modal ucp-tt-modal-large">
      <h3>Edit Data</h3>
      <div style="display:flex;gap:15px;margin-bottom:12px;background:var(--input-bg);padding:12px;border-radius:6px;border:1px solid var(--border-color);">
        <div class="ucp-tt-form-group" style="margin-bottom:0;flex:1;"><label>Profile Created At</label><input type="text" id="ucp-tt-excelCreatedAtInput"></div>
        <div class="ucp-tt-form-group" style="margin-bottom:0;flex:1;"><label>Profile Last Modified At</label><input type="text" id="ucp-tt-excelModifiedAtInput"></div>
      </div>
      <div class="ucp-tt-excel-table-container">
        <table class="ucp-tt-excel-table">
          <thead><tr><th>Color</th><th>Day</th><th>Time</th><th>Course Code</th><th>Section</th><th>Title</th><th>Room</th><th>Teacher</th><th>Actions</th></tr></thead>
          <tbody id="ucp-tt-excelTableBody"></tbody>
        </table>
      </div>
      <div class="ucp-tt-modal-actions">
        <div class="ucp-tt-left-btns">
          <button class="ucp-tt-btn ucp-tt-btn-action" id="ucp-tt-exportBtn">💾 Export Data</button>
          <button class="ucp-tt-btn ucp-tt-btn-action" id="ucp-tt-importBtn">📥 Import Data</button>
          <input type="file" id="ucp-tt-importFileInput" accept=".json" style="display:none;">
        </div>
        <div class="ucp-tt-right-btns">
          <button class="ucp-tt-btn ucp-tt-btn-action" id="ucp-tt-addRowBtn">+ Add Row</button>
          <button class="ucp-tt-btn ucp-tt-btn-action" id="ucp-tt-bulkBtn">+ Add Data Manually / Paste</button>
          <button class="ucp-tt-btn ucp-tt-btn-cancel" id="ucp-tt-excelCancel">Cancel</button>
          <button class="ucp-tt-btn ucp-tt-btn-save" id="ucp-tt-excelSave">Save All Changes</button>
        </div>
      </div>
    </div>
  </div>

  <div class="ucp-tt-modal-overlay" id="ucp-tt-bulkImportModalOverlay">
    <div class="ucp-tt-modal" style="width:500px;">
      <h3>📥 Paste / Add Data Manually</h3>
      <p style="font-size:0.75rem;color:var(--subtext-color);margin-bottom:10px;">Paste tabular data (Tab- or Comma-separated) matching columns:<br><b>Day, Time, Code, Section, Title, Room, Teacher</b></p>
      <div class="ucp-tt-form-group"><textarea id="ucp-tt-bulkImportInput" rows="8" placeholder="MON, 08:00, CP113, B1, Programming Fundamentals, C-207, Dr. John Doe"></textarea></div>
      <div class="ucp-tt-modal-actions">
        <button class="ucp-tt-btn ucp-tt-btn-cancel" id="ucp-tt-bulkCancel">Cancel</button>
        <button class="ucp-tt-btn ucp-tt-btn-save" id="ucp-tt-bulkImport">Import Data</button>
      </div>
    </div>
  </div>

  <div class="ucp-tt-modal-overlay" id="ucp-tt-localStorageModalOverlay">
    <div class="ucp-tt-modal ucp-tt-modal-large" style="max-width:900px;">
      <h3>💾 Local Storage History &amp; Data Inspector</h3>
      <p style="font-size:0.8rem;color:var(--subtext-color);margin-bottom:10px;">View, inspect, or purge saved timetable data from local storage.</p>
      <div class="ucp-tt-excel-table-container" style="max-height:50vh;">
        <table class="ucp-tt-excel-table">
          <thead><tr><th>Storage Key</th><th>Roll No / Profile</th><th>Created At</th><th>Last Modified</th><th>Total Items</th><th>Actions</th></tr></thead>
          <tbody id="ucp-tt-localStorageTableBody"></tbody>
        </table>
      </div>
      <div class="ucp-tt-modal-actions">
        <button class="ucp-tt-btn ucp-tt-btn-danger" id="ucp-tt-purgeBtn">🗑️ Purge All Local Storage</button>
        <div class="ucp-tt-right-btns"><button class="ucp-tt-btn ucp-tt-btn-cancel" id="ucp-tt-localStorageClose">Close</button></div>
      </div>
    </div>
  </div>
</div>`;

    const cardParent = document.querySelector('div.md-card');
    if (cardParent) cardParent.insertAdjacentHTML('beforebegin', appHtml);
    else document.body.insertAdjacentHTML('beforeend', appHtml);

    const root = document.getElementById('ucp-tt-root');
    if (!root) return;

    const el = (id) => document.getElementById(id);
    const q = (sel) => root.querySelector(sel);
    const qa = (sel) => root.querySelectorAll(sel);
 
    // CONSTANTS & STATE 
    const days = 6;
    const timeSlots = 10;
    const DEFAULT_PROFILE = '__UCP_LIVE__';
    const dayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const timeNames = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    const LS_PROFILES = 'ucp_tt_profiles_v7';
    const LS_ACTIVE = 'ucp_tt_active_profile_v7';
    let activeCard = null;
    let contextTargetCard = null;
    let contextTargetCell = null;
    let targetCell = null;
    let draggedCard = null;
    let gridLocked = false;          // true while rendering the locked live profile
    let liveProfileLabel = '';       // detected logged-in account roll no / id 
    let timetableZoom = 115;

    let currentProfile = DEFAULT_PROFILE;
    let profilesData = {};
    let initialData = [];
    let currentProfileAction = '';

    // ---- live / locked profile helpers ----
    function isLiveProfile(rollNo) { return rollNo === DEFAULT_PROFILE; }
    function profileLabel(rollNo) { return isLiveProfile(rollNo) ? (liveProfileLabel || 'My Schedule (Live)') : rollNo; }

    function readCurrentPortalRegistration() {
        const direct = document.querySelector(
            '#user_profile .user_heading .user_heading_content .sub-heading'
        ) || document.querySelector('.user_heading_content .sub-heading')
          || document.querySelector('.user_heading_content h2 .sub-heading')
          || document.querySelector('.user_heading_content h2 span:nth-child(2)');

        const registration = (direct ? direct.textContent : '').replace(/\s+/g, ' ').trim();
        return (registration && registration !== '----') ? registration : '';
    }

    // Use the exact signed-in registration text. If the user has not visited the
    // profile page yet, fetch the dashboard and read it there instead of falling
    // back to a placeholder label.
    function detectLiveProfileLabel() {
        return new Promise((resolve) => {
            const finish = (label) => {
                const cleaned = (label || '').replace(/\s+/g, ' ').trim();
                const finalLabel = cleaned && cleaned !== '----' ? cleaned : 'My Schedule (Live)';
                liveProfileLabel = finalLabel;
                renderProfileDropdownList();
                resolve(finalLabel);
            };

            const fromDashboard = () => {
                fetch('https://horizon.ucp.edu.pk/student/dashboard', { credentials: 'include' })
                    .then(r => r.text())
                    .then(html => {
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        const h2 = doc.querySelector('.user_heading_content h2');
                        const spans = h2 ? h2.querySelectorAll('span') : [];
                        const reg = (spans[1] ? spans[1].textContent : '').replace(/\s+/g, ' ').trim();
                        if (reg && reg !== '----') {
                            try { chrome.storage.local.set({ ucp_registration: reg }); } catch (e) {}
                            finish(reg);
                            return;
                        }
                        finish(readCurrentPortalRegistration() || 'My Schedule (Live)');
                    })
                    .catch(() => finish(readCurrentPortalRegistration() || 'My Schedule (Live)'));
            };

            try {
                chrome.storage.local.get('ucp_registration', (res) => {
                    const saved = (res && res.ucp_registration || '').replace(/\s+/g, ' ').trim();
                    if (saved && saved !== '----') {
                        finish(saved);
                        return;
                    }
                    fromDashboard();
                });
            } catch (e) {
                fromDashboard();
            }
        });
    }

    function assertEditable() {
        if (isLiveProfile(currentProfile)) {
            alert('  This profile is your logged in UCP Student ID and can’t be edited.\n\nUse “➕ New Profile” or “📋 Duplicate Profile” to create an editable copy.');
            return false;
        }
        return true;
    }
 
    // HELPERS 
    function formatDate(dateObj) {
        const d = new Date(dateObj);
        if (isNaN(d.getTime())) return dateObj || 'N/A';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
            ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    function calculateSemesterTerm(dateString) {
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return 'TERM: Fall 2026';
        const month = d.getMonth();
        const year = d.getFullYear();
        return (month >= 7) ? `TERM: Fall ${year}` : `TERM: Spring ${year}`;
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

    function generateColorFromString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = Math.abs(hash) % 360;
        return `hsla(${h}, 65%, 28%, 0.85)`;
    }

    function applyTimetableZoom() {
        const content = el('ucp-tt-timetableContent');
        const level = el('ucp-tt-zoomResetBtn');
        if (content) content.style.zoom = `${timetableZoom}%`;
        if (level) level.innerText = `${timetableZoom}%`;
        const zoomOut = el('ucp-tt-zoomOutBtn');
        const zoomIn = el('ucp-tt-zoomInBtn');
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

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
 
    // INFO WIDGETS — "Next Class" (left) + "Term Progress" (right), shown above
    // the timetable. Logic mirrors the dashboard's term-week / next-class math so
    // the two stay consistent. Term Progress = week X/16 of the active term;
    // Next Class = the soonest scheduled slot in the future (any day of the week). 
    const TERM_TOTAL_WEEKS = 16;
    function lastMondayOf(year, monthIndex) {
        const d = new Date(year, monthIndex + 1, 0); // last day of this month
        while (d.getDay() !== 1) d.setDate(d.getDate() - 1); // 1 = Monday
        return d;
    }
    function getTermWeek(now = new Date()) {
        const y = now.getFullYear();
        const starts = [
            { start: lastMondayOf(y - 1, 8), label: 'Fall' },
            { start: lastMondayOf(y, 1), label: 'Spring' },
            { start: lastMondayOf(y, 8), label: 'Fall' },
            { start: lastMondayOf(y + 1, 1), label: 'Spring' },
        ];
        let active = null;
        for (const s of starts) {
            if (s.start <= now && (active === null || s.start > active.start)) active = s;
        }
        if (!active) return null;
        const weekMs = 7 * 24 * 3600 * 1000;
        const ongoing = Math.floor((now - active.start) / weekMs) + 1;
        if (ongoing > TERM_TOTAL_WEEKS) return null; // term has already ended
        return { ongoing, total: TERM_TOTAL_WEEKS, label: active.label };
    }
    // Next calendar occurrence of a weekday slot (dayIndex 0=Mon → getDay 1),
    // strictly after `now`; null if not found within 7 days.
    function nextOccurrence(dayIndex, startTime, now) {
        const targetGetDay = (dayIndex + 1) % 7;
        let [h, m] = String(startTime || '0:0').split(':').map((n) => parseInt(n, 10));
        if (isNaN(h)) h = 0;
        if (isNaN(m)) m = 0;
        for (let offset = 0; offset <= 7; offset++) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h, m, 0, 0);
            if (d.getDay() === targetGetDay && d > now) return d;
        }
        return null;
    }
    function formatRelative(ms) {
        if (ms < 0) ms = 0;
        const mins = Math.round(ms / 60000);
        if (mins < 1) return 'now';
        if (mins < 60) return `in ${mins} min`;
        const hrs = Math.floor(mins / 60);
        const remMin = mins % 60;
        if (hrs < 24) return remMin ? `in ${hrs}h ${remMin}m` : `in ${hrs}h`;
        const days = Math.floor(hrs / 24);
        return `in ${days} day${days === 1 ? '' : 's'}`;
    }

    function renderInfoWidgets() {
        const now = new Date();
        // ---- Term Progress (right) ----
        const tw = getTermWeek(now);
        const fill = el('ucp-tt-progressFill');
        const pct = el('ucp-tt-progressPct');
        const pSub = el('ucp-tt-progressSub');
        if (fill && pct && pSub) {
            if (tw) {
                const percent = Math.max(0, Math.min(100, Math.round((tw.ongoing / tw.total) * 100)));
                fill.style.width = percent + '%';
                pct.innerText = percent + '%';
                pSub.innerText = `Week ${tw.ongoing} of ${tw.total} • ${tw.label}`;
            } else {
                fill.style.width = '0%';
                pct.innerText = '—';
                pSub.innerText = 'Term not in progress';
            }
        }
        // ---- Next Class (left) ----
        const nTitle = el('ucp-tt-nextTitle');
        const nSub = el('ucp-tt-nextSub');
        if (!nTitle || !nSub) return;
        const candidates = (initialData || [])
            .filter((it) => it.day != null && it.time != null)
            .map((it) => {
                const d = nextOccurrence(it.day, timeNames[it.time], now);
                return d ? { ...it, next: d } : null;
            })
            .filter(Boolean)
            .sort((a, b) => a.next - b.next);
        if (!candidates.length) {
            nTitle.innerText = 'No classes scheduled';
            nSub.innerText = 'Fetch from the portal to load your schedule';
            return;
        }
        const nc = candidates[0];
        const dayName = dayNames[nc.day] || '';
        const time = timeNames[nc.time] || '';
        nTitle.innerText = nc.title || nc.code || 'Class';
        nSub.innerText = `${dayName}, ${time} • ${formatRelative(nc.next - now)}`
            + (nc.room && cleanRoomName(nc.room) ? ` • ${cleanRoomName(nc.room)}` : '');
    }
 
    // PERSISTENCE 
    function persistProfiles(isModified = true) {
        if (isModified && profilesData[currentProfile]) {
            profilesData[currentProfile].lastModified = new Date().toISOString();
        }
        if (profilesData[currentProfile]) {
            profilesData[currentProfile].items = initialData;
        }
        try {
            localStorage.setItem(LS_PROFILES, JSON.stringify(profilesData));
            localStorage.setItem(LS_ACTIVE, currentProfile);
        } catch (e) { /* storage may be unavailable */ }
        updateTermDisplay();
        checkEmptyState();
    }

    function updateTermDisplay() {
        const profile = profilesData[currentProfile];
        if (!profile) return;
        el('ucp-tt-headerTermText').innerText = calculateSemesterTerm(profile.createdAt);
    }
 
    // NIGHT MODE — driven by the GLOBAL ucp_night_mode setting (the in-page
    // Settings panel). The old per-timetable toggle was removed; the timetable
    // now follows the universal night mode and reacts to live changes. 
    function applyNightMode(enabled) {
        if (enabled) root.classList.add('ucp-tt-night');
        else root.classList.remove('ucp-tt-night');
    }

    function initNightMode() {
        try {
            chrome.storage.local.get('ucp_night_mode', (res) => applyNightMode(!!(res && res.ucp_night_mode)));
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.ucp_night_mode) {
                    applyNightMode(!!changes.ucp_night_mode.newValue);
                }
            });
        } catch (e) {}
    }
 
    // PROFILES 
    function initProfiles() {
        try {
            const storedProfiles = localStorage.getItem(LS_PROFILES);
            if (storedProfiles) profilesData = JSON.parse(storedProfiles);
        } catch (e) { profilesData = {}; }

        const now = new Date().toISOString();
        if (!profilesData[DEFAULT_PROFILE]) {
            profilesData[DEFAULT_PROFILE] = { createdAt: now, lastModified: now, items: [] };
        }

        const activeRollNo = localStorage.getItem(LS_ACTIVE);
        currentProfile = (activeRollNo && profilesData[activeRollNo]) ? activeRollNo : DEFAULT_PROFILE;

        // Use the exact profile registration text from the signed-in header when
        // available. This avoids false matches for students from other departments.
        liveProfileLabel = readCurrentPortalRegistration() || 'My Schedule (Live)';
        renderProfileDropdownList();
        detectLiveProfileLabel();
    }

    function renderProfileDropdownList() {
        el('ucp-tt-currentProfileLabel').innerText = profileLabel(currentProfile);
        const container = el('ucp-tt-profileOptionsList');
        container.innerHTML = '';

        Object.keys(profilesData).forEach(rollNo => {
            const item = document.createElement('div');
            const locked = isLiveProfile(rollNo);
            item.className = `ucp-tt-dropdown-option-item ${rollNo === currentProfile ? 'active' : ''}`;
            item.innerHTML = `<span>${locked ? '' : ''}${escapeHtml(profileLabel(rollNo))}</span> ${rollNo === currentProfile ? '✓' : ''}`;
            item.onclick = (e) => {
                e.stopPropagation();
                switchProfile(rollNo);
                hideProfileDropdown();
            };
            container.appendChild(item);
        });
    }

    function toggleProfileDropdown(e) {
        if (e) e.stopPropagation();
        el('ucp-tt-profileDropdownMenu').classList.toggle('show');
    }

    function hideProfileDropdown() {
        const menu = el('ucp-tt-profileDropdownMenu');
        if (menu) menu.classList.remove('show');
    }

    function openProfileModal(action) {
        hideProfileDropdown();
        currentProfileAction = action;
        const title = el('ucp-tt-profileModalTitle');
        const label = el('ucp-tt-profileModalLabel');
        const input = el('ucp-tt-profileModalInput');
        const group = el('ucp-tt-profileModalGroup');
        const confirmBtn = el('ucp-tt-profileModalConfirm');

        input.value = '';
        group.style.display = 'block';

        if (action === 'new') {
            title.innerText = '➕ Create New Profile';
            label.innerText = 'Enter New Profile Roll No. / ID';
            input.placeholder = 'e.g. L1S26BSCS0099';
            confirmBtn.innerText = 'Create';
            confirmBtn.className = 'ucp-tt-btn ucp-tt-btn-save';
        } else if (action === 'duplicate') {
            title.innerText = '📋 Duplicate Profile';
            label.innerText = `Copy "${currentProfile}" into New Profile ID`;
            input.placeholder = 'e.g. L1S26BSCS0052_COPY';
            confirmBtn.innerText = 'Duplicate';
            confirmBtn.className = 'ucp-tt-btn ucp-tt-btn-save';
        } else if (action === 'delete') {
            if (isLiveProfile(currentProfile)) {
                alert('  This profile is locked and cannot be deleted.');
                return;
            }
            if (Object.keys(profilesData).length <= 1) {
                alert('Cannot delete the only remaining profile.');
                return;
            }
            title.innerText = '🗑️ Delete Profile';
            label.innerText = `Are you sure you want to delete profile "${profileLabel(currentProfile)}"? This action cannot be undone.`;
            group.style.display = 'none';
            confirmBtn.innerText = 'Delete Profile';
            confirmBtn.className = 'ucp-tt-btn ucp-tt-btn-danger';
        }

        el('ucp-tt-profileModalOverlay').classList.add('active');
    }

    function closeProfileModal() {
        el('ucp-tt-profileModalOverlay').classList.remove('active');
    }

    function confirmProfileModalAction() {
        const inputVal = el('ucp-tt-profileModalInput').value.trim().toUpperCase();

        if (currentProfileAction === 'new') {
            if (!inputVal) return;
            if (profilesData[inputVal]) {
                alert('A profile with this Roll No. already exists.');
                switchProfile(inputVal);
                closeProfileModal();
                return;
            }
            const now = new Date().toISOString();
            profilesData[inputVal] = { createdAt: now, lastModified: now, items: [] };
            switchProfile(inputVal);
        } else if (currentProfileAction === 'duplicate') {
            if (!inputVal) return;
            if (profilesData[inputVal]) {
                alert('A profile with this Roll No. already exists.');
                return;
            }
            const now = new Date().toISOString();
            profilesData[inputVal] = { createdAt: now, lastModified: now, items: JSON.parse(JSON.stringify(initialData)) };
            switchProfile(inputVal);
        } else if (currentProfileAction === 'delete') {
            delete profilesData[currentProfile];
            const nextProfile = Object.keys(profilesData)[0];
            switchProfile(nextProfile);
        }

        persistProfiles(false);
        renderProfileDropdownList();
        closeProfileModal();
    }

    function loadProfileData(rollNo) {
        currentProfile = rollNo;
        const profile = profilesData[rollNo];
        initialData = profile ? profile.items : [];
        renderProfileDropdownList();
        updateTermDisplay();
        buildGrid();
        const editBtn = el('ucp-tt-editDataBtn');
        if (editBtn) editBtn.disabled = isLiveProfile(currentProfile);
    }

    function switchProfile(rollNo) {
        loadProfileData(rollNo);
        try { localStorage.setItem(LS_ACTIVE, rollNo); } catch (e) {}
    }
 
    // FETCH FROM PORTAL (the live data source — "as it does currently") 
    function fetchFromPortal() {
        // Fetch live data and update ONLY the live (locked) profile. Other
        // (user-created) profiles are left untouched so their edits persist.
        try {
            const mapped = mapFetchedToAppData(extractTimeTableInfo());
            if (!profilesData[DEFAULT_PROFILE]) {
                const now = new Date().toISOString();
                profilesData[DEFAULT_PROFILE] = { createdAt: now, lastModified: now, items: [] };
            }
            profilesData[DEFAULT_PROFILE].items = mapped;
            try { localStorage.setItem(LS_PROFILES, JSON.stringify(profilesData)); } catch (e) {}
            console.log('🔄 UCP Smart Portal: fetched', mapped.length, 'timetable entries from the live schedule.');
        } catch (err) {
            console.warn('UCP Smart Portal: fetchFromPortal error', err);
        }
    }

    // Explicit "Fetch from Portal" action: refresh live data and show it.
    function refetchLive() {
        fetchFromPortal();
        switchProfile(DEFAULT_PROFILE);
    }
 
    // GRID 
    function checkEmptyState() {
        const overlay = el('ucp-tt-emptyStateOverlay');
        if (initialData && initialData.length) { overlay.classList.remove('visible'); return; }

        // Empty-state primary action is IMPORT (the header's "Fetch from Portal"
        // stays available for live refreshes). Same label in both variants.
        const isLive = isLiveProfile(currentProfile);
        overlay.innerHTML = isLive
            ? `<div class="ucp-tt-empty-state-card">
                 <h4>📅 No classes found</h4>
                 <p>No classes are available in the portal schedule right now.</p>
                 <div class="ucp-tt-empty-state-actions">
                   <button class="ucp-tt-btn-action" id="ucp-tt-emptyImport">📥 Import Timetable</button>
                 </div>
               </div>`
            : `<div class="ucp-tt-empty-state-card">
                 <h4>📅 Timetable is Empty</h4>
                 <p>Import a saved timetable or edit data manually to populate classes.</p>
                 <div class="ucp-tt-empty-state-actions">
                   <button class="ucp-tt-btn-action" id="ucp-tt-emptyImport">📥 Import Timetable</button>
                   <button class="ucp-tt-btn-action" id="ucp-tt-emptyEdit">Edit Data Manually</button>
                 </div>
               </div>`;
        overlay.classList.add('visible');

        const im = el('ucp-tt-emptyImport'); if (im) im.addEventListener('click', triggerImportJSON);
        const ed = el('ucp-tt-emptyEdit'); if (ed) ed.addEventListener('click', openExcelModal);
    }

    function buildGrid() {
        const gridBody = el('ucp-tt-gridBody');
        gridBody.innerHTML = '';
        gridLocked = isLiveProfile(currentProfile);

        for (let d = 0; d < days; d++) {
            const row = document.createElement('div');
            row.className = 'ucp-tt-day-row';

            for (let t = 0; t < timeSlots; t++) {
                const cell = document.createElement('div');
                cell.className = 'ucp-tt-cell';
                cell.dataset.day = d;
                cell.dataset.time = t;

                if (!gridLocked) {
                cell.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    cell.classList.add('ucp-tt-drag-over');
                });
                cell.addEventListener('dragleave', () => cell.classList.remove('ucp-tt-drag-over'));
                cell.addEventListener('drop', (e) => {
                    e.preventDefault();
                    cell.classList.remove('ucp-tt-drag-over');
                    if (draggedCard) {
                        const oldParent = draggedCard.parentElement;
                        const oldDay = parseInt(oldParent.dataset.day);
                        const oldTime = parseInt(oldParent.dataset.time);
                        const newDay = parseInt(cell.dataset.day);
                        const newTime = parseInt(cell.dataset.time);

                        cell.appendChild(draggedCard);

                        const timeBadge = draggedCard.querySelector('.ucp-tt-card-time-badge');
                        if (timeBadge) timeBadge.innerText = getTimeRangeString(newTime);

                        const dataIndex = initialData.findIndex(item => item.day === oldDay && item.time === oldTime);
                        if (dataIndex !== -1) {
                            initialData[dataIndex].day = newDay;
                            initialData[dataIndex].time = newTime;
                            persistProfiles();
                            checkConflicts();
                        }
                    }
                });

                cell.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showCellContextMenu(e, cell);
                };

                const addBtn = document.createElement('button');
                addBtn.className = 'ucp-tt-add-btn';
                addBtn.innerText = '+';
                addBtn.onclick = () => openCreateModal(cell);
                cell.appendChild(addBtn);
                }

                row.appendChild(cell);
            }
            gridBody.appendChild(row);
        }

        initialData.forEach(item => {
            const target = q(`.ucp-tt-cell[data-day="${item.day}"][data-time="${item.time}"]`);
            if (target) {
                const card = createCardElement(item.code, item.section, item.title, item.room, item.teacher, item.time, item.color);
                target.appendChild(card);
            }
        });

        toggleCardVisibility();
        toggleColorCoding();
        checkConflicts();
        updateCurrentTimeHighlight();
        renderInfoWidgets();
        checkEmptyState();
    }

    function createCardElement(code, section, title, room, teacher, timeIndex, color) {
        const card = document.createElement('div');
        card.className = 'ucp-tt-card';
        card.draggable = !gridLocked;

        const cleanedRoom = cleanRoomName(room);

        card.dataset.code = code || '';
        card.dataset.section = section || '';
        card.dataset.room = cleanedRoom;
        card.dataset.teacher = teacher || '';
        card.dataset.title = title || '';
        card.dataset.color = color || '';

        if (color) card.style.backgroundColor = color;

        const timeRange = getTimeRangeString(timeIndex);

        card.innerHTML = `
          <div class="ucp-tt-card-meta-row">
            <span class="ucp-tt-mini-badge ucp-tt-card-code-badge">${escapeHtml(code)}</span>
            <span class="ucp-tt-mini-badge ucp-tt-card-section-badge">${escapeHtml(section)}</span>
            <span class="ucp-tt-mini-badge ucp-tt-card-time-badge" style="display:none;">${timeRange}</span>
          </div>
          <div class="ucp-tt-card-title">${escapeHtml(title)}</div>
          <div class="ucp-tt-card-details">
            <span class="ucp-tt-mini-badge ucp-tt-card-room-badge">${escapeHtml(cleanedRoom) || 'Room Unspecified'}</span>
            <div class="ucp-tt-card-teacher">👤 ${escapeHtml(teacher) || 'Unassigned'}</div>
          </div>
        `;

        if (!gridLocked) {
        card.onclick = (e) => {
            e.stopPropagation();
            hideContextMenu();
            openEditModal(card);
        };
        card.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showCardContextMenu(e, card);
        };
        card.addEventListener('dragstart', () => {
            draggedCard = card;
            setTimeout(() => card.style.opacity = '0.3', 0);
        });
        card.addEventListener('dragend', () => {
            card.style.opacity = '1';
            draggedCard = null;
        });
        }

        return card;
    }

    function checkConflicts() {
        qa('.ucp-tt-cell').forEach(cell => {
            const cards = cell.querySelectorAll('.ucp-tt-card');
            if (cards.length > 1) cell.classList.add('ucp-tt-has-conflict');
            else cell.classList.remove('ucp-tt-has-conflict');
        });
    }

    function updateCurrentTimeHighlight() {
        qa('.ucp-tt-current-time-active').forEach(elm => elm.classList.remove('ucp-tt-current-time-active'));

        const now = new Date();
        let currentDayIdx = now.getDay() - 1;
        if (currentDayIdx < 0 || currentDayIdx > 5) return;

        const totalMinutes = now.getHours() * 60 + now.getMinutes();

        let activeTimeIdx = -1;
        timeNames.forEach((timeStr, idx) => {
            const [h, m] = timeStr.split(':').map(Number);
            const start = h * 60 + m;
            if (totalMinutes >= start && totalMinutes < start + 60) activeTimeIdx = idx;
        });

        if (activeTimeIdx !== -1) {
            const dayLabel = q(`.ucp-tt-day-label[data-day="${currentDayIdx}"]`);
            if (dayLabel) dayLabel.classList.add('ucp-tt-current-time-active');

            const timeHeader = q(`.ucp-tt-time-slot[data-time="${activeTimeIdx}"]`);
            if (timeHeader) timeHeader.classList.add('ucp-tt-current-time-active');

            const activeCell = q(`.ucp-tt-cell[data-day="${currentDayIdx}"][data-time="${activeTimeIdx}"]`);
            if (activeCell) activeCell.classList.add('ucp-tt-current-time-active');
        }
    }
 
    // COLOR / VISIBILITY 
    function toggleColorCoding() {
        const enabled = el('ucp-tt-toggleColorCoding').checked;
        qa('.ucp-tt-card').forEach(card => {
            if (card.dataset.color) {
                card.style.background = card.dataset.color;
                card.style.borderColor = 'rgba(255, 255, 255, 0.4)';
            } else if (enabled) {
                const courseTitle = card.dataset.title || card.dataset.code || '';
                card.style.background = generateColorFromString(courseTitle);
                card.style.borderColor = 'rgba(255, 255, 255, 0.4)';
            } else {
                card.style.background = 'var(--card-bg)';
                card.style.borderColor = 'var(--border-color)';
            }
        });
    }

    function toggleCardVisibility() {
        const showCode = el('ucp-tt-toggleCode').checked;
        const showTitle = el('ucp-tt-toggleTitle').checked;
        const showSection = el('ucp-tt-toggleSection').checked;
        const showRoom = el('ucp-tt-toggleRoom').checked;
        const showTeacher = el('ucp-tt-toggleTeacher').checked;

        qa('.ucp-tt-card').forEach(card => {
            const codeBadge = card.querySelector('.ucp-tt-card-code-badge');
            const sectionBadge = card.querySelector('.ucp-tt-card-section-badge');
            const titleEl = card.querySelector('.ucp-tt-card-title');
            const roomBadge = card.querySelector('.ucp-tt-card-room-badge');
            const teacherEl = card.querySelector('.ucp-tt-card-teacher');

            if (codeBadge) codeBadge.style.display = showCode ? 'inline-block' : 'none';
            if (sectionBadge) sectionBadge.style.display = showSection ? 'inline-block' : 'none';
            if (titleEl) titleEl.style.display = showTitle ? '-webkit-box' : 'none';
            if (roomBadge) roomBadge.style.display = showRoom ? 'inline-block' : 'none';
            if (teacherEl) teacherEl.style.display = showTeacher ? 'block' : 'none';
        });
    }
 
    // CONTEXT MENU 
    function positionContextMenu(menu, e) {
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.display = 'block';
    }

    function showCardContextMenu(e, card) {
        contextTargetCard = card;
        contextTargetCell = null;
        const menu = el('ucp-tt-contextMenu');
        menu.innerHTML = '';
        const i1 = document.createElement('div');
        i1.className = 'ucp-tt-context-menu-item';
        i1.textContent = '✏️ Edit Card';
        i1.onclick = contextEditCard;
        const i2 = document.createElement('div');
        i2.className = 'ucp-tt-context-menu-item';
        i2.textContent = '📋 Duplicate Card';
        i2.onclick = contextDuplicateCard;
        menu.appendChild(i1);
        menu.appendChild(i2);
        positionContextMenu(menu, e);
    }

    function showCellContextMenu(e, cell) {
        contextTargetCell = cell;
        contextTargetCard = null;
        const menu = el('ucp-tt-contextMenu');
        menu.innerHTML = '';
        const i1 = document.createElement('div');
        i1.className = 'ucp-tt-context-menu-item';
        i1.textContent = '➕ Add New Card';
        i1.onclick = contextAddCard;
        menu.appendChild(i1);
        positionContextMenu(menu, e);
    }

    function hideContextMenu() {
        el('ucp-tt-contextMenu').style.display = 'none';
        contextTargetCard = null;
        contextTargetCell = null;
    }

    function contextEditCard() {
        if (contextTargetCard) openEditModal(contextTargetCard);
        hideContextMenu();
    }

    function contextAddCard() {
        if (contextTargetCell) openCreateModal(contextTargetCell);
        hideContextMenu();
    }

    function contextDuplicateCard() {
        if (!contextTargetCard) return;

        const parentCell = contextTargetCard.parentElement;
        const currentDay = parseInt(parentCell.dataset.day);
        const code = contextTargetCard.dataset.code;
        const section = contextTargetCard.dataset.section;
        const title = contextTargetCard.querySelector('.ucp-tt-card-title').innerText;
        const room = contextTargetCard.dataset.room;
        const teacher = contextTargetCard.dataset.teacher;
        const color = contextTargetCard.dataset.color || '';

        let targetTime = -1;
        for (let t = 0; t < timeSlots; t++) {
            const cell = q(`.ucp-tt-cell[data-day="${currentDay}"][data-time="${t}"]`);
            if (cell && !cell.querySelector('.ucp-tt-card')) { targetTime = t; break; }
        }

        if (targetTime === -1) {
            alert('No empty time slots available on this day to duplicate card.');
            hideContextMenu();
            return;
        }

        const emptyCell = q(`.ucp-tt-cell[data-day="${currentDay}"][data-time="${targetTime}"]`);
        const newCard = createCardElement(code, section, title, room, teacher, targetTime, color);
        emptyCell.appendChild(newCard);

        initialData.push({ day: currentDay, time: targetTime, code, section, title, room, teacher, color });
        persistProfiles();
        toggleCardVisibility();
        toggleColorCoding();
        checkConflicts();
        hideContextMenu();
    }
 
    // CARD EDIT / CREATE MODAL 
    function openEditModal(card) {
        if (!assertEditable()) return;
        activeCard = card;
        targetCell = card.parentElement;

        el('ucp-tt-modalTitle').innerText = 'Edit Class Details';
        el('ucp-tt-inputCode').value = card.dataset.code;
        el('ucp-tt-selectSection').value = card.dataset.section;
        el('ucp-tt-inputTitle').value = card.querySelector('.ucp-tt-card-title').innerText;
        el('ucp-tt-inputRoom').value = card.dataset.room;
        el('ucp-tt-inputTeacher').value = card.dataset.teacher;
        el('ucp-tt-inputColor').value = card.dataset.color || '#14191e';
        el('ucp-tt-selectDay').value = targetCell.dataset.day;
        el('ucp-tt-selectTime').value = targetCell.dataset.time;
        el('ucp-tt-btnDelete').style.display = 'block';

        el('ucp-tt-modalOverlay').classList.add('active');
    }

    function openCreateModal(cell) {
        if (!assertEditable()) return;
        activeCard = null;
        targetCell = cell;

        el('ucp-tt-modalTitle').innerText = 'Create New Class';
        el('ucp-tt-inputCode').value = '';
        el('ucp-tt-selectSection').value = 'B1';
        el('ucp-tt-inputTitle').value = '';
        el('ucp-tt-inputRoom').value = '';
        el('ucp-tt-inputTeacher').value = '';
        el('ucp-tt-inputColor').value = '#14191e';
        el('ucp-tt-selectDay').value = cell.dataset.day;
        el('ucp-tt-selectTime').value = cell.dataset.time;
        el('ucp-tt-btnDelete').style.display = 'none';

        el('ucp-tt-modalOverlay').classList.add('active');
    }

    function closeModal() {
        el('ucp-tt-modalOverlay').classList.remove('active');
        activeCard = null;
        targetCell = null;
    }

    function saveCard() {
        if (!assertEditable()) return;
        const code = el('ucp-tt-inputCode').value || 'COURSE';
        const section = el('ucp-tt-selectSection').value || 'B1';
        const title = el('ucp-tt-inputTitle').value || 'Course Title';
        const rawRoom = el('ucp-tt-inputRoom').value || 'Room 000';
        const room = cleanRoomName(rawRoom);
        const teacher = el('ucp-tt-inputTeacher').value || '';
        const color = el('ucp-tt-inputColor').value;
        const day = parseInt(el('ucp-tt-selectDay').value);
        const time = parseInt(el('ucp-tt-selectTime').value);

        const destinationCell = q(`.ucp-tt-cell[data-day="${day}"][data-time="${time}"]`);

        if (activeCard) {
            const oldDay = parseInt(targetCell.dataset.day);
            const oldTime = parseInt(targetCell.dataset.time);

            activeCard.dataset.code = code;
            activeCard.dataset.section = section;
            activeCard.dataset.room = room;
            activeCard.dataset.teacher = teacher;
            activeCard.dataset.title = title;
            activeCard.dataset.color = color;
            activeCard.style.backgroundColor = color;

            const codeBadge = activeCard.querySelector('.ucp-tt-card-code-badge');
            const sectionBadge = activeCard.querySelector('.ucp-tt-card-section-badge');
            const timeBadge = activeCard.querySelector('.ucp-tt-card-time-badge');
            const roomBadge = activeCard.querySelector('.ucp-tt-card-room-badge');

            if (codeBadge) codeBadge.innerText = code;
            if (sectionBadge) sectionBadge.innerText = section;
            if (timeBadge) timeBadge.innerText = getTimeRangeString(time);
            if (roomBadge) roomBadge.innerText = room || 'Room Unspecified';

            activeCard.querySelector('.ucp-tt-card-title').innerText = title;
            activeCard.querySelector('.ucp-tt-card-teacher').innerText = `👤 ${teacher || 'Unassigned'}`;

            if (destinationCell && destinationCell !== targetCell) {
                destinationCell.appendChild(activeCard);
            }

            const dataIndex = initialData.findIndex(item => item.day === oldDay && item.time === oldTime);
            if (dataIndex !== -1) {
                initialData[dataIndex] = { day, time, code, section, title, room, teacher, color };
            }
        } else {
            if (destinationCell) {
                const newCard = createCardElement(code, section, title, room, teacher, time, color);
                destinationCell.appendChild(newCard);
                initialData.push({ day, time, code, section, title, room, teacher, color });
            }
        }

        persistProfiles();
        toggleCardVisibility();
        toggleColorCoding();
        checkConflicts();
        closeModal();
    }

    function deleteCard() {
        if (!assertEditable()) return;
        if (activeCard && targetCell) {
            const currentDay = parseInt(targetCell.dataset.day);
            const currentTime = parseInt(targetCell.dataset.time);
            initialData = initialData.filter(item => !(item.day === currentDay && item.time === currentTime));
            activeCard.remove();
            persistProfiles();
            checkConflicts();
        }
        closeModal();
    }
 
    // EXCEL / SPREADSHEET EDITOR 
    function excelRowHtml(item, index) {
        const dayOpts = dayNames.map((d, i) => `<option value="${i}" ${i === item.day ? 'selected' : ''}>${d}</option>`).join('');
        const timeOpts = timeNames.map((t, i) => `<option value="${i}" ${i === item.time ? 'selected' : ''}>${t}</option>`).join('');
        const secOpts = ['B1', 'B2', 'B3', 'B4'].map(sec => `<option value="${sec}" ${sec === item.section ? 'selected' : ''}>${sec}</option>`).join('');
        return `
          <td><input type="color" data-field="color" class="ucp-tt-color-dot-picker" value="${item.color || '#14191e'}"></td>
          <td><select data-field="day">${dayOpts}</select></td>
          <td><select data-field="time">${timeOpts}</select></td>
          <td><input type="text" data-field="code" value="${escapeHtml(item.code)}"></td>
          <td><select data-field="section">${secOpts}</select></td>
          <td><input type="text" data-field="title" value="${escapeHtml(item.title)}"></td>
          <td><input type="text" data-field="room" value="${escapeHtml(cleanRoomName(item.room))}"></td>
          <td><input type="text" data-field="teacher" value="${escapeHtml(item.teacher)}"></td>
          <td><button class="ucp-tt-btn ucp-tt-btn-danger" data-action="delete-row" data-index="${index}" style="padding:2px 8px;">Delete</button></td>
        `;
    }

    function openExcelModal() {
        if (!assertEditable()) return;
        const tbody = el('ucp-tt-excelTableBody');
        tbody.innerHTML = '';

        const profile = profilesData[currentProfile];
        el('ucp-tt-excelCreatedAtInput').value = profile ? formatDate(profile.createdAt) : '';
        el('ucp-tt-excelModifiedAtInput').value = profile ? formatDate(profile.lastModified) : '';

        initialData.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = excelRowHtml(item, index);
            tbody.appendChild(tr);
        });

        el('ucp-tt-excelModalOverlay').classList.add('active');
    }

    function addExcelRow() {
        const tbody = el('ucp-tt-excelTableBody');
        const newItem = { day: 0, time: 0, code: 'CP100', section: 'B1', title: 'New Course', room: 'C-207', teacher: '', color: '' };
        const tr = document.createElement('tr');
        tr.innerHTML = excelRowHtml(newItem, -1);
        tbody.appendChild(tr);
    }

    function closeExcelModal() {
        el('ucp-tt-excelModalOverlay').classList.remove('active');
    }

    function saveExcelData() {
        const tbody = el('ucp-tt-excelTableBody');
        const rows = tbody.querySelectorAll('tr');
        const newData = [];

        rows.forEach(tr => {
            const color = tr.querySelector('[data-field="color"]').value;
            const day = parseInt(tr.querySelector('[data-field="day"]').value);
            const time = parseInt(tr.querySelector('[data-field="time"]').value);
            const code = tr.querySelector('[data-field="code"]').value;
            const section = tr.querySelector('[data-field="section"]').value;
            const title = tr.querySelector('[data-field="title"]').value;
            const rawRoom = tr.querySelector('[data-field="room"]').value;
            const room = cleanRoomName(rawRoom);
            const teacher = tr.querySelector('[data-field="teacher"]').value;
            newData.push({ day, time, code, section, title, room, teacher, color });
        });

        const profile = profilesData[currentProfile];
        if (profile) {
            const created = el('ucp-tt-excelCreatedAtInput').value;
            const modified = el('ucp-tt-excelModifiedAtInput').value;
            if (created) profile.createdAt = created;
            if (modified) profile.lastModified = modified;
        }

        initialData = newData;
        persistProfiles(true);
        buildGrid();
        closeExcelModal();
    }
 
    // BULK IMPORT 
    function openBulkImportModal() {
        if (!assertEditable()) return;
        el('ucp-tt-bulkImportInput').value = '';
        el('ucp-tt-bulkImportModalOverlay').classList.add('active');
    }

    function closeBulkImportModal() {
        el('ucp-tt-bulkImportModalOverlay').classList.remove('active');
    }

    function processBulkImport() {
        const text = el('ucp-tt-bulkImportInput').value.trim();
        if (!text) { closeBulkImportModal(); return; }

        const lines = text.split('\n');
        const tbody = el('ucp-tt-excelTableBody');

        lines.forEach(line => {
            if (!line.trim()) return;
            const cols = line.includes('\t') ? line.split('\t') : line.split(',');
            if (cols.length < 2) return;

            const rawDay = (cols[0] || 'MON').trim().toUpperCase();
            let dayIdx = dayNames.indexOf(rawDay);
            if (dayIdx === -1) dayIdx = 0;

            const rawTime = (cols[1] || '08:00').trim();
            let timeIdx = timeNames.findIndex(t => t.startsWith(rawTime.substring(0, 2)));
            if (timeIdx === -1) timeIdx = 0;

            const code = (cols[2] || '').trim();
            const section = (cols[3] || 'B1').trim();
            const title = (cols[4] || '').trim();
            const room = cleanRoomName(cols[5] || '');
            const teacher = (cols[6] || '').trim();

            const item = { day: dayIdx, time: timeIdx, code, section, title, room, teacher, color: '' };
            const tr = document.createElement('tr');
            tr.innerHTML = excelRowHtml(item, -1);
            tbody.appendChild(tr);
        });

        closeBulkImportModal();
    }
 
    // JSON EXPORT / IMPORT 
    function exportDataJSON() {
        const profile = profilesData[currentProfile];
        const exportObject = {
            profile: currentProfile,
            createdAt: profile ? profile.createdAt : new Date().toISOString(),
            lastModified: profile ? profile.lastModified : new Date().toISOString(),
            data: initialData
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObject, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute('href', dataStr);
        downloadAnchor.setAttribute('download', `Timetable_${currentProfile}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    }

    function triggerImportJSON() {
        el('ucp-tt-importFileInput').click();
    }

    function importDataJSON(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (evt) {
            try {
                const parsed = JSON.parse(evt.target.result);
                const now = new Date().toISOString();
                if (parsed && parsed.data && Array.isArray(parsed.data)) {
                    const profileName = parsed.profile || currentProfile;
                    profilesData[profileName] = {
                        createdAt: parsed.createdAt || now,
                        lastModified: parsed.lastModified || now,
                        items: parsed.data
                    };
                    switchProfile(profileName);
                    alert('Data imported successfully into profile: ' + profileName);
                } else if (Array.isArray(parsed)) {
                    profilesData[currentProfile] = {
                        createdAt: now,
                        lastModified: now,
                        items: parsed
                    };
                    loadProfileData(currentProfile);
                    alert('Timetable data updated successfully!');
                } else {
                    alert('Invalid JSON structure.');
                }
            } catch (err) {
                alert('Error parsing JSON file: ' + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }
 
    // LOCAL STORAGE HISTORY MANAGER 
    function openLocalStorageModal() {
        const tbody = el('ucp-tt-localStorageTableBody');
        tbody.innerHTML = '';

        Object.keys(profilesData).forEach(rollNo => {
            const item = profilesData[rollNo];
            const isLive = isLiveProfile(rollNo);
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td><code>${LS_PROFILES}</code></td>
              <td><b>${isLive ? '  ' : ''}${escapeHtml(profileLabel(rollNo))}</b></td>
              <td>${formatDate(item.createdAt)}</td>
              <td>${formatDate(item.lastModified)}</td>
              <td>${item.items ? item.items.length : 0} classes</td>
              <td>
                <button class="ucp-tt-btn ucp-tt-btn-action" data-action="ls-load" data-roll="${escapeHtml(rollNo)}" style="padding:2px 6px;font-size:0.75rem;">Load</button>
                <button class="ucp-tt-btn ucp-tt-btn-danger" data-action="ls-delete" data-roll="${escapeHtml(rollNo)}" ${isLive ? 'disabled' : ''} style="padding:2px 6px;font-size:0.75rem;">Delete Entry</button>
              </td>
            `;
            tbody.appendChild(tr);
        });

        el('ucp-tt-localStorageModalOverlay').classList.add('active');
    }

    function closeLocalStorageModal() {
        el('ucp-tt-localStorageModalOverlay').classList.remove('active');
    }

    function deleteLocalStorageEntry(rollNo) {
        if (isLiveProfile(rollNo)) {
            alert('This profile is locked and cannot be deleted.');
            return;
        }
        if (Object.keys(profilesData).length <= 1) {
            alert('Cannot delete the only remaining profile in local storage.');
            return;
        }
        if (confirm('Delete local storage data for profile "' + rollNo + '"?')) {
            delete profilesData[rollNo];
            const nextProfile = Object.keys(profilesData)[0];
            persistProfiles(false);
            switchProfile(nextProfile);
            openLocalStorageModal();
        }
    }

    function clearAllLocalStorageData() {
        if (confirm('Are you sure you want to purge all timetable local storage history?')) {
            try {
                localStorage.removeItem(LS_PROFILES);
                localStorage.removeItem(LS_ACTIVE);
            } catch (e) { /* ignore */ }
            profilesData = {};
            initProfiles();
            fetchFromPortal();
            loadProfileData(currentProfile);
            closeLocalStorageModal();
        }
    }
 
    // PRINT 
    function printTimetable() {
        window.print();
    }
 
    // ACADEMIC CALENDAR EXPANDER — below the timetable.
    // Renders the SHARED cached calendar from window.__ucpAcadCal (owned by
    // js/academic_calendar.js, loaded on every /student* page): same data and
    // same chrome.storage.local cache as the Notification page's calendar tab,
    // so a fresh page-load refresh there is reused here. Compact layout: one
    // block per term, one row per dated item (name · date · countdown). 
    let acadCalRendered = false;

    function acadCalRowHtml(r, nowMs) {
        const ac = window.__ucpAcadCal;
        const t = ac.ts(r.dateISO);
        const past = t !== Infinity && t < nowMs;
        const date = ac.formatShortDate(r.dateISO) || r.dateText || '';
        const when = (r.dateISO && !past) ? ac.countdown(r.dateISO) : '';
        return `<div class="ucp-tt-acadcal-row${past ? ' is-past' : ''}">
          <span class="ucp-tt-acadcal-name" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</span>
          <span class="ucp-tt-acadcal-date">${escapeHtml(date)}</span>
          <span class="ucp-tt-acadcal-when">${escapeHtml(when)}</span>
        </div>`;
    }

    function renderAcadCalExpander() {
        const ac = window.__ucpAcadCal;
        const state = el('ucp-tt-acadcalState');
        const terms = el('ucp-tt-acadcalTerms');
        if (!state || !terms) return;
        if (!ac) {
            state.style.display = '';
            state.innerText = 'Academic calendar is unavailable on this page.';
            return;
        }
        state.style.display = '';
        state.innerText = 'Loading…';
        terms.innerHTML = '';
        // getSemesterNumber gates convocation rows (final-semester only), same
        // rule as the Notification feed; a profile fetch failure just keeps them.
        Promise.all([ac.fetchCalendar(), ac.getSemesterNumber().catch(() => null)])
            .then(([model, semNum]) => {
                const nowMs = Date.now();
                const ts = ac.ts;
                const keepHoliday = (h) => !h.isConvocation || semNum === 8;
                const sectionOf = (s) => ({
                    term: s.term,
                    rows: (s.milestones || []).map((m) => ({ ...m, _src: 'milestone' }))
                        .concat((s.holidays || []).filter(keepHoliday).map((h) => ({ ...h, _src: 'holiday' }))),
                });
                // Fallback for a model predating per-term sections: one flat group.
                let sections = (model.sections || []).length
                    ? (model.sections || []).map(sectionOf).filter((s) => s.rows.length)
                    : [{
                        term: '',
                        rows: (model.milestones || []).map((m) => ({ ...m, _src: 'milestone' }))
                            .concat((model.holidays || []).filter(keepHoliday).map((h) => ({ ...h, _src: 'holiday' }))),
                    }];
                if (!sections.length || !sections[0].rows.length) {
                    state.innerText = 'No academic calendar entries found.';
                    return;
                }
                // Term order: the cached render order (model._snapshot.termOrder)
                // when present, else date-range rank (ongoing → upcoming → past),
                // mirroring the Notification feed's ordering.
                const snap = model._snapshot;
                const termOrder = snap && Array.isArray(snap.termOrder) && snap.termOrder.length ? snap.termOrder : null;
                const ranked = sections.map((s) => {
                    const dates = s.rows.map((r) => ts(r.dateISO)).filter((x) => x !== Infinity);
                    const min = dates.length ? Math.min.apply(null, dates) : null;
                    const max = dates.length ? Math.max.apply(null, dates) : null;
                    let rank;
                    if (min === null) rank = 3;        // no dated rows → last
                    else if (nowMs < min) rank = 1;    // fully upcoming
                    else if (nowMs > max) rank = 2;    // fully past
                    else rank = 0;                     // ongoing
                    return { s, rank, key: min };
                });
                if (termOrder) {
                    ranked.sort((a, b) => {
                        const ra = termOrder.indexOf(a.s.term); const rb = termOrder.indexOf(b.s.term);
                        const ia = ra === -1 ? 1e9 : ra; const ib = rb === -1 ? 1e9 : rb;
                        if (ia !== ib) return ia - ib;
                        return (a.key || Infinity) - (b.key || Infinity);
                    });
                } else {
                    ranked.sort((a, b) => {
                        if (a.rank !== b.rank) return a.rank - b.rank;
                        if (a.rank === 2) return (b.key || 0) - (a.key || 0);
                        return (a.key || Infinity) - (b.key || Infinity);
                    });
                }
                state.style.display = 'none';
                terms.innerHTML = ranked.map(({ s }) => {
                    const rows = s.rows.slice().sort((a, b) => {
                        const da = ts(a.dateISO), db = ts(b.dateISO);
                        if (da === db) return 0;
                        if (da === Infinity) return 1;   // undated items sort last
                        if (db === Infinity) return -1;
                        return da - db;
                    }).map((r) => acadCalRowHtml(r, nowMs)).join('');
                    const head = s.term
                        ? `<div class="ucp-tt-acadcal-term-head"><span class="material-icons">calendar_month</span><span>${escapeHtml(s.term)}</span></div>`
                        : '';
                    return `<div class="ucp-tt-acadcal-term">${head}${rows}</div>`;
                }).join('');
            })
            .catch(() => {
                state.style.display = '';
                state.innerText = 'Could not load the academic calendar.';
            });
    }

    function toggleAcadCalExpander() {
        const btn = el('ucp-tt-acadcalToggle');
        const body = el('ucp-tt-acadcalBody');
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        body.hidden = open;
        if (!open && !acadCalRendered) {
            acadCalRendered = true;
            renderAcadCalExpander();   // lazy: first open pulls the shared cache
        }
    }
 
    // EVENT WIRING (content script world — no inline onclick) 
    function wireEvents() {
        el('ucp-tt-profileDropdownBtn').addEventListener('click', (e) => toggleProfileDropdown(e));
        el('ucp-tt-localCacheBtn').addEventListener('click', openLocalStorageModal);
        el('ucp-tt-fetchBtn').addEventListener('click', refetchLive);
        el('ucp-tt-zoomOutBtn').addEventListener('click', () => changeTimetableZoom(-10));
        el('ucp-tt-zoomResetBtn').addEventListener('click', resetTimetableZoom);
        el('ucp-tt-zoomInBtn').addEventListener('click', () => changeTimetableZoom(10));

        el('ucp-tt-profileNew').addEventListener('click', () => openProfileModal('new'));
        el('ucp-tt-profileDuplicate').addEventListener('click', () => openProfileModal('duplicate'));
        el('ucp-tt-profileDelete').addEventListener('click', () => openProfileModal('delete'));

        // Profile-menu data actions: export the active profile as JSON, or open
        // the (shared) file picker that importDataJSON() consumes.
        el('ucp-tt-profileExport').addEventListener('click', (e) => {
            e.stopPropagation();
            hideProfileDropdown();
            exportDataJSON();
        });
        el('ucp-tt-profileImport').addEventListener('click', (e) => {
            e.stopPropagation();
            hideProfileDropdown();
            triggerImportJSON();
        });

        el('ucp-tt-emptyImport').addEventListener('click', triggerImportJSON);
        el('ucp-tt-emptyEdit').addEventListener('click', openExcelModal);

        el('ucp-tt-acadcalToggle').addEventListener('click', toggleAcadCalExpander);

        ['Code', 'Title', 'Section', 'Room', 'Teacher'].forEach(f =>
            el('ucp-tt-toggle' + f).addEventListener('change', toggleCardVisibility));
        el('ucp-tt-toggleColorCoding').addEventListener('change', toggleColorCoding);

        el('ucp-tt-printBtn').addEventListener('click', printTimetable);
        el('ucp-tt-editDataBtn').addEventListener('click', openExcelModal);

        el('ucp-tt-profileModalCancel').addEventListener('click', closeProfileModal);
        el('ucp-tt-profileModalConfirm').addEventListener('click', confirmProfileModalAction);

        el('ucp-tt-btnDelete').addEventListener('click', deleteCard);
        el('ucp-tt-modalCancel').addEventListener('click', closeModal);
        el('ucp-tt-modalSave').addEventListener('click', saveCard);

        el('ucp-tt-exportBtn').addEventListener('click', exportDataJSON);
        el('ucp-tt-importBtn').addEventListener('click', triggerImportJSON);
        el('ucp-tt-importFileInput').addEventListener('change', importDataJSON);
        el('ucp-tt-addRowBtn').addEventListener('click', addExcelRow);
        el('ucp-tt-bulkBtn').addEventListener('click', openBulkImportModal);
        el('ucp-tt-excelCancel').addEventListener('click', closeExcelModal);
        el('ucp-tt-excelSave').addEventListener('click', saveExcelData);

        el('ucp-tt-bulkCancel').addEventListener('click', closeBulkImportModal);
        el('ucp-tt-bulkImport').addEventListener('click', processBulkImport);

        el('ucp-tt-purgeBtn').addEventListener('click', clearAllLocalStorageData);
        el('ucp-tt-localStorageClose').addEventListener('click', closeLocalStorageModal);

        // Delegated clicks for dynamically-built rows (excel delete + localStorage load/delete)
        el('ucp-tt-excelTableBody').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action="delete-row"]');
            if (btn) btn.closest('tr').remove();
        });
        el('ucp-tt-localStorageTableBody').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const roll = btn.dataset.roll;
            if (btn.dataset.action === 'ls-load') {
                loadProfileData(roll);
                closeLocalStorageModal();
            } else if (btn.dataset.action === 'ls-delete') {
                deleteLocalStorageEntry(roll);
            }
        });

        window.addEventListener('click', () => {
            hideContextMenu();
            hideProfileDropdown();
        });
    }
 
    // INIT 
    function init() {
        initProfiles();            // restore persisted profiles (custom ones survive refresh)
        wireEvents();
        initNightMode();           // follow the universal night-mode setting
        fetchFromPortal();         // auto-fetch: refresh the live profile from the portal
        loadProfileData(currentProfile); // render the active profile (live on first run, else the cached one)
        applyTimetableZoom();
        setInterval(() => { updateCurrentTimeHighlight(); renderInfoWidgets(); }, 30000);
    }

    init();
});
