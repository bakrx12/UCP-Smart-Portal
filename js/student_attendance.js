chrome.storage.local.get('toggle_power', (result) => {
    const enabled = result['toggle_power'];

    if (enabled) {

        function extractFullAttendanceInfo() {
            const attendance = [];
            try {

                document.querySelectorAll('.uk-accordion-title').forEach(title => {
                    const courseName = title.querySelector('span')?.innerText.trim() || undefined;
                    const courseContent = title.nextElementSibling?.querySelector('.uk-accordion-content');
                    const details = [];

                    // Find helper: get text after a <b> label inside li
                    function getValueByLabel(label) {
                        const li = [...courseContent?.querySelectorAll("li") || []]
                            .find(el => el.querySelector("b")?.innerText.includes(label));
                        return li ? li.querySelector("span")?.innerText.trim() || undefined : undefined;
                    }

                    // Course Code
                    const courseCode = getValueByLabel("Course Code");

                    // Classes Conducted & Attended
                    const classesConducted = (() => {
                        const val = getValueByLabel("Number of classes Conducted");
                        return val !== undefined ? parseInt(val) : undefined;
                    })();

                    const classesAttended = (() => {
                        const val = getValueByLabel("Number of classes Attended");
                        return val !== undefined ? parseInt(val) : undefined;
                    })();

                    // Attendance Percentage
                    const attendancePercentage = getValueByLabel("Attendance Percentage");

                    // Extract attendance details from table
                    const rows = courseContent?.querySelectorAll("table tbody tr") || [];
                    rows.forEach(row => {
                        const cols = row.querySelectorAll("td span");
                        if (cols.length >= 3) {
                            details.push({
                                date: cols[1]?.innerText.trim() || undefined,
                                status: cols[2]?.innerText.trim() || undefined,
                                fine: (cols[3]?.innerText.trim() && cols[3].innerText.trim() !== '-')
                                    ? cols[3].innerText.trim()
                                    : undefined
                            });
                        } else {
                            // Handle "Attendance Not Marked"
                            if (row.innerText.includes("Attendance Not Marked")) {
                                // leave details as empty
                            }
                        }
                    });

                    attendance.push({
                        courseName,
                        courseCode,
                        classesConducted,
                        classesAttended,
                        attendancePercentage,
                        details
                    });
                });



            } catch (e) {
                console.log('Something went wrong while extracting from DOM: ', e)
            }
            return attendance;
        }


        /* === Insert the attendance container into the page (unchanged markup) === */
        const parentContainer = document.querySelector('#page_content_inner');
        parentContainer.insertAdjacentHTML('beforebegin', `
        <div id="attendance-container-new">
            <div class="glass">
                <div class="course-select">
                    <i class="material-icons">school</i>
                    <div style="position: relative;width: -webkit-fill-available;">
<select id="courseDropdown"></select>

<i style="color: #fff !important;!i;!;position: absolute;right: 1rem;top: 0.7rem;" class="material-icons">keyboard_arrow_down</i>
</div>
                </div>
                <div class="progress-container">
                    <div id="courseProgress" class="progress-bar"></div>
                </div>
            </div>

            <div class="glass">
                <h3 id="courseTitle"></h3>
                <div class="course-info">
                    <div class="info-item">
                        <i class="material-icons">confirmation_number</i>
                        <span id="courseCode"></span>
                    </div>
                    <div class="info-item">
                        <i class="material-icons">event</i>
                        <span id="classesConducted"></span>
                    </div>
                    <div class="info-item">
                        <i class="material-icons">check_circle</i>
                        <span id="classesAttended"></span>
                    </div>
                    <div id="info-item-attendance" class="info-item">
                        <i class="material-icons">school</i>
                        <span id="attendancePercentage"></span>
                    </div>
                </div>
            </div>

            <div class="glass">
                <div class="calendar-header">
                    <button id="prevMonth">
                        <i class="material-icons">chevron_left</i>
                    </button>
                    <h3 id="calendarMonth"></h3>
                    <button id="nextMonth">
                        <i class="material-icons">chevron_right</i>
                    </button>
                </div>

                <div class="day-labels">
                    <div>Sun</div>
                    <div>Mon</div>
                    <div>Tue</div>
                    <div>Wed</div>
                    <div>Thu</div>
                    <div>Fri</div>
                    <div>Sat</div>
                </div>
                <div class="calendar-grid" id="calendarGrid"></div>
            </div>
        </div>
`)

        /* === Inject Material Icons link (safe even if already present) === */
        if (!document.querySelector('link[href*="icon?family=Material+Icons"]')) {
            const icons = document.createElement('link');
            icons.rel = 'stylesheet';
            icons.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
            document.head.appendChild(icons);
        }

        /* === Empty-state helper + CSS (re-usable) === */
        function emptyStateHTML(icon, title, subtitle = '') {
            return `
    <div class="empty-state">
      <span class="material-icons empty-icon">${icon}</span>
      <div class="empty-title">${title}</div>
      ${subtitle ? `<div class="empty-sub">${subtitle}</div>` : ''}
    </div>
  `;
        }

        const _attStyle = document.createElement('style');
        _attStyle.textContent = `
  #attendance-container-new .empty-state {
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:8px;
    padding:22px;
    border-radius:12px;
    background: linear-gradient(180deg, rgba(255,255,255,0.8), rgba(245,248,250,0.85));
    color: #163c3c;
    box-shadow: 0 6px 18px rgba(12, 40, 40, 0.06);
    text-align:center;
    margin:12px;
  }
  #attendance-container-new .empty-state .empty-icon {
    font-size:48px;
    color:#0b6b6b;
  }
  #attendance-container-new .empty-state .empty-title{
    font-weight:600;
    font-size:16px;
  }
  #attendance-container-new .empty-state .empty-sub{
    font-size:13px;
    color:#2f6b6b;
    opacity:0.95;
  }
  /* make sure original controls don't look broken if data absent */
  #attendance-container-new .glass{ min-height: 60px; }
`;
        document.head.appendChild(_attStyle);


        /* === Extract data and decide whether to initialize the full UI or show an empty message === */
        const attendance = extractFullAttendanceInfo();
        const container = document.getElementById('attendance-container-new');

        if (!Array.isArray(attendance) || attendance.length === 0) {
            // Replace the container contents with a friendly empty-state message
            container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${emptyStateHTML('people_outline', 'No detailed attendance found', 'Detailed attendance records could not be detected on this page.')}
        <div style="text-align:center;color:#376b6b;font-size:13px;">If you expect to see attendance data, try opening the "Attendance" section on Horizon and then reload this view.</div>
      </div>
    `;
            // Do not continue to initialize the dropdown/calendar UI
        } else {

            /* === Now proceed to find elements and wire up the UI (only when attendance exists) === */
            const dropdown = document.getElementById("courseDropdown");
            const courseTitle = document.getElementById("courseTitle");
            const courseCode = document.getElementById("courseCode");
            const classesConducted = document.getElementById("classesConducted");
            const classesAttended = document.getElementById("classesAttended");
            const attendancePercentage = document.getElementById("attendancePercentage");
            const courseProgress = document.getElementById("courseProgress");
            const attendanceInfoItem = document.querySelector('#info-item-attendance')
            const calendarGrid = document.getElementById("calendarGrid");
            const calendarMonth = document.getElementById("calendarMonth");
            const prevMonthBtn = document.getElementById("prevMonth");
            const nextMonthBtn = document.getElementById("nextMonth");

            let selectedCourse = 0;
            let currentMonthIndex = 0;
            let availableMonths = [];

            function init() {
                dropdown.innerHTML = ''; // clear existing
                attendance.forEach((c, i) => {
                    const option = document.createElement("option");
                    option.value = i;
                    option.textContent = c.courseName || `Course ${i + 1}`;
                    dropdown.appendChild(option);
                });
                dropdown.addEventListener("change", e => {
                    selectedCourse = parseInt(e.target.value);
                    setupCourse();
                });
                setupCourse();
            }

            function setupCourse() {
                const course = attendance[selectedCourse] || {};
                courseTitle.textContent = course.courseName || "Untitled Course";
                courseCode.textContent = course.courseCode || "N/A";
                classesConducted.textContent = "Classes Conducted: " + (course.classesConducted ?? "N/A");
                classesAttended.textContent = "Classes Attended: " + (course.classesAttended ?? "N/A");
                attendancePercentage.textContent = "Attendance: " + (course.attendancePercentage ?? "N/A") + (course.attendancePercentage ? "%" : "");

                // Progress bar
                const percent = parseFloat(course.attendancePercentage) || 0;
                courseProgress.style.width = percent + "%";
                courseProgress.className = "progress-bar"; // reset
                attendanceInfoItem.className = "info-item"; // reset
                if (percent < 75) {
                    courseProgress.classList.add("progress-red");
                    attendanceInfoItem.classList.add('info-red')
                } else if (percent < 85) {
                    courseProgress.classList.add("progress-orange");
                    attendanceInfoItem.classList.add('info-orange')
                } else {
                    courseProgress.classList.add("progress-green");
                    attendanceInfoItem.classList.add('info-green')
                }

                // Setup months
                availableMonths = Array.from(new Set((course.details || []).map(d => d?.date?.slice(0, 7)).filter(Boolean))).sort();
                currentMonthIndex = availableMonths.length - 1;
                renderCalendar();
            }

            function renderCalendar() {
                const course = attendance[selectedCourse] || { details: [] };
                calendarGrid.innerHTML = "";
                if (!availableMonths || availableMonths.length === 0) {
                    calendarMonth.textContent = "No Attendance Data";
                    prevMonthBtn.disabled = true;
                    nextMonthBtn.disabled = true;
                    // show a small empty-state tile inside calendar grid
                    calendarGrid.innerHTML = `<div style="grid-column: 1 / -1;">${emptyStateHTML('calendar_today', 'No calendar entries for selected course', '')}</div>`;
                    return;
                }

                const monthStr = availableMonths[currentMonthIndex];
                const [year, month] = monthStr.split("-");
                const monthName = new Date(monthStr + "-01").toLocaleString("default", { month: "long", year: "numeric" });
                calendarMonth.textContent = monthName;

                prevMonthBtn.disabled = currentMonthIndex === 0;
                nextMonthBtn.disabled = currentMonthIndex === availableMonths.length - 1;

                const firstDay = new Date(year, month - 1, 1).getDay();
                const daysInMonth = new Date(year, month, 0).getDate();

                for (let i = 0; i < firstDay; i++) {
                    const empty = document.createElement("div");
                    empty.classList.add("disabled");
                    calendarGrid.appendChild(empty);
                }

                for (let d = 1; d <= daysInMonth; d++) {
                    const dayCell = document.createElement("div");
                    dayCell.textContent = d;
                    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                    const detailsForDay = (course.details || []).filter(det => det.date === dateStr);

                    if (detailsForDay.length > 0) {
                        const dotContainer = document.createElement("div");
                        dotContainer.classList.add("dot-container");

                        detailsForDay.forEach(det => {
                            const dot = document.createElement("div");
                            dot.classList.add("dot");
                            if (det.status === "Present") dot.classList.add("green");
                            else if (det.status === "Absent") dot.classList.add("red");
                            else if (det.status === "Late") dot.classList.add("orange");
                            dot.setAttribute("data-tooltip", `${det.date} - ${det.status}${det.fine ? " (Fine: " + det.fine + ")" : ""}`);
                            dotContainer.appendChild(dot);
                        });

                        dayCell.appendChild(dotContainer);
                    } else {
                        dayCell.classList.add("disabled");
                    }
                    calendarGrid.appendChild(dayCell);
                }
            }

            prevMonthBtn.addEventListener("click", () => {
                if (currentMonthIndex > 0) {
                    currentMonthIndex--;
                    renderCalendar();
                }
            });

            nextMonthBtn.addEventListener("click", () => {
                if (currentMonthIndex < availableMonths.length - 1) {
                    currentMonthIndex++;
                    renderCalendar();
                }
            });

            // finally start the UI
            init();
        } // end else (attendance exists)

    }

})