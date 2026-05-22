chrome.storage.local.get('toggle_power', async (result) => {
    if (!result?.toggle_power) return;

    /* ------------------ UI Insert ------------------ */
    const container = document.querySelector('#page_content_inner');
    if (!container) return;

    /* ------------------ State & Config ------------------ */
    let toEnroll = [];
    let enrolledCourses = [];
    let timetableData = {};
    const courseColors = ['#3b82f6', '#ec4899', '#ec4848ff', '#8b5cf6', '#f59e0b', '#10b981', '#06b6d4'];

    /* ------------------ Core Logic ------------------ */

    /**
     * Helper: Parse time string to minutes for comparison
     */
    function timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    /**
     * Helper: Check if two schedule arrays conflict
     */
    function checkConflict(schedule1, schedule2) {
        for (let slot1 of schedule1) {
            for (let slot2 of schedule2) {
                if (slot1.day === slot2.day) {
                    const start1 = timeToMinutes(slot1.startTime);
                    const end1 = timeToMinutes(slot1.endTime);
                    const start2 = timeToMinutes(slot2.startTime);
                    const end2 = timeToMinutes(slot2.endTime);

                    if ((start1 < end2 && end1 > start2) || (start2 < end1 && end2 > start1)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function hasConflictWithEnrolled(schedule) {
        for (let enrolled of enrolledCourses) {
            if (checkConflict(schedule, enrolled.schedule)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Fetches current cart ID for deletion
     */
    async function getCourseDeleteIdFromCart(courseCode) {
        const url = "https://horizon.ucp.edu.pk/student/enrollment/cart";
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const htmlString = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString, 'text/html');
            const rows = doc.querySelectorAll('tr');
            let extractedId = null;

            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells[1]?.textContent.includes(`Code : ${courseCode}`)) {
                    const onclickAttr = cells[9]?.querySelector('a')?.getAttribute("onclick");
                    if (onclickAttr) {
                        const match = onclickAttr.match(/\d+/);
                        if (match) extractedId = match[0];
                    }
                }
            });
            return extractedId;
        } catch (error) {
            return null;
        }
    }

    /**
     * Scrapes currently enrolled courses from the Cart page
     */
    async function getEnrolledCoursesFromCart() {
        const url = "https://horizon.ucp.edu.pk/student/enrollment/cart";
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const htmlString = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString, 'text/html');
            const rows = doc.querySelectorAll('tbody tr');
            const arr = [];

            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                const sectionId = cells[1]?.children[2]?.textContent.match(/Section\s*:\s*([A-Za-z0-9-]+)/)[1] ?? undefined;
                const courseName = cells[1]?.children[0]?.textContent.trim() ?? "Unknown Course";
                const creditHours = cells[3]?.textContent.trim() ?? "0.0";
                const classes = cells[2]?.lastElementChild?.children ?? [];
                const schedule = [];

                if (classes) {
                    [...classes].forEach(c => {
                        const ta = c?.textContent?.replace(/\s+/g, ' ').trim().split(' ') ?? ["Mon", "00:00", "-", "00:55"];
                        schedule.push({
                            day: ta[0],
                            startTime: ta[1],
                            endTime: ta[3]
                        })
                    })
                }

                if (sectionId) {
                    const onclickAttr = cells[9]?.querySelector('a')?.getAttribute("onclick");
                    if (onclickAttr) {
                        const match = onclickAttr.match(/\d+/);
                        const sectionDetails = sectionId.split('-');
                        if (match) {
                            arr.push({
                                sectionId,
                                courseName,
                                sectionName: sectionDetails[sectionDetails.length - 1],
                                courseDeleteCode: match[0],
                                creditHours,
                                schedule
                            })
                        }
                    }
                }
            });
            return arr;
        } catch (error) {
            return [];
        }
    }

    /**
     * Gets strict timetable data for visualizer
     */
    async function updateEnrolledCoursesScheduleFromTimeTable() {
        const url = "https://horizon.ucp.edu.pk/student/enrollment/timetable";
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const htmlString = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString, 'text/html');
            return doc.querySelectorAll('li.cd-schedule__group');
        } catch (error) {
            return [];
        }
    }

    /**
     * Main scraper for available courses on the page
     */
    function extractCoursesFromDOM() {
        const courses = [];
        try {
            const courseCards = document.querySelectorAll(".uk-accordion > .card");
            courseCards.forEach(card => {
                const header = card.querySelector("h3.uk-accordion-title");
                if (!header) return;

                const titleSpan = header.querySelector(".title");
                if (!titleSpan) return;

                const rawTitle = titleSpan.textContent.replace(/\s+/g, " ").trim();
                const courseName = rawTitle.split(" - ").slice(1).join(" - ").trim() || rawTitle;
                const courseCode = rawTitle.split(" - ")[0] || rawTitle;
                const badges = header.querySelectorAll(".uk-badge");
                const semester = badges[0]?.textContent.trim() || "";
                const type = badges[1]?.textContent.trim() || "";

                const content = card.querySelector(".uk-accordion-content");
                if (!content) return;

                let coreq = "['Nill']";
                const coreqP = content.querySelector("p");
                if (coreqP && coreqP.textContent.includes("Co-req")) {
                    coreq = coreqP.textContent.replace("Co-req Course:", "").replace(/\s+/g, " ").trim();
                }

                const availableSections = [];
                const sectionCards = content.querySelectorAll(".md-card");

                sectionCards.forEach(sec => {
                    const secContent = sec.querySelector(".md-card-content");
                    if (!secContent) return;

                    const sectionNameEl = secContent.querySelector("span[style*='font-size:18px']");
                    const sectionName = sectionNameEl?.textContent.trim() || "";
                    const statusEl = secContent.querySelector(".uk-badge");
                    const status = statusEl?.textContent.trim() || "Unknown";

                    const classSchedule = [];
                    const scheduleSpans = secContent.querySelectorAll(".uk-text-small span");

                    scheduleSpans.forEach(span => {
                        const text = span.textContent.replace(/\s+/g, " ").trim();
                        const match = text.match(/(\w+)\s*:\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*\(\s*([^)]+)\s*\)/);
                        if (match) {
                            classSchedule.push({
                                day: match[1],
                                startTime: match[2],
                                endTime: match[3],
                                class: match[4]
                            });
                        }
                    });

                    if (sectionName && classSchedule.length > 0) {
                        availableSections.push({
                            sectionName,
                            status,
                            classSchedule,
                        });
                    }
                });

                if (availableSections.length > 0) {
                    courses.push({
                        courseCode,
                        courseName,
                        semester,
                        type,
                        "coreq": coreq ?? undefined,
                        availableSections
                    });
                }
            });
        } catch (e) {
            console.error("Extraction failed:", e);
        }
        return courses;
    }

    /**
     * Scrapes courses via network if DOM is empty/stale
     */
    async function extractCoursesFromNetworkRequest() {
        const url = "https://horizon.ucp.edu.pk/student/enrollment/cards";
        const courses = [];
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const htmlString = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString, 'text/html');
            const courseCards = doc.querySelectorAll(".uk-accordion > .card");

            courseCards.forEach(card => {
                const header = card.querySelector("h3.uk-accordion-title");
                if (!header) return;
                const titleSpan = header.querySelector(".title");
                if (!titleSpan) return;
                const rawTitle = titleSpan.textContent.replace(/\s+/g, " ").trim();
                const courseName = rawTitle.split(" - ").slice(1).join(" - ").trim() || rawTitle;
                const courseCode = rawTitle.split(" - ")[0] || rawTitle;
                const badges = header.querySelectorAll(".uk-badge");
                const semester = badges[0]?.textContent.trim() || "";
                const type = badges[1]?.textContent.trim() || "";
                const content = card.querySelector(".uk-accordion-content");
                if (!content) return;
                let coreq = "['Nill']";
                const coreqP = content.querySelector("p");
                if (coreqP && coreqP.textContent.includes("Co-req")) {
                    coreq = coreqP.textContent.replace("Co-req Course:", "").replace(/\s+/g, " ").trim();
                }
                const availableSections = [];
                const sectionCards = content.querySelectorAll(".md-card");
                sectionCards.forEach(sec => {
                    const secContent = sec.querySelector(".md-card-content");
                    if (!secContent) return;
                    const sectionNameEl = secContent.querySelector("span[style*='font-size:18px']");
                    const sectionName = sectionNameEl?.textContent.trim() || "";
                    const statusEl = secContent.querySelector(".uk-badge");
                    const status = statusEl?.textContent.trim() || "Unknown";
                    const classSchedule = [];
                    const scheduleSpans = secContent.querySelectorAll(".uk-text-small span");
                    scheduleSpans.forEach(span => {
                        const text = span.textContent.replace(/\s+/g, " ").trim();
                        const match = text.match(/(\w+)\s*:\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*\(\s*([^)]+)\s*\)/);
                        if (match) {
                            classSchedule.push({
                                day: match[1],
                                startTime: match[2],
                                endTime: match[3],
                                class: match[4]
                            });
                        }
                    });
                    if (sectionName && classSchedule.length > 0) {
                        availableSections.push({
                            sectionName,
                            status,
                            classSchedule,
                        });
                    }
                });
                if (availableSections.length > 0) {
                    courses.push({
                        courseCode,
                        courseName,
                        semester,
                        type,
                        "coreq": coreq ?? undefined,
                        availableSections
                    });
                }
            })
            return courses;
        } catch (e) {
            showToast("Error retrieving courses. Please reload", "error")
        }
    }

    /* ------------------ UI Helpers ------------------ */

    function getCourseColor(courseName) {
        const index = enrolledCourses.findIndex(c => c.courseName === courseName);
        return courseColors[index % courseColors.length];
    }

    function getCourseAbbr(courseName) {
        return courseName.split(' ').map(word => word[0]).filter(char => char && char.toUpperCase() === char).join('');
    }

    function showToast(message, type = 'success') {
        const existingToast = document.querySelector('.toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="material-icons">${type === 'success' ? 'check_circle' : 'error'}</span>
            <div>
                <div style="font-weight: 600;">${type === 'success' ? 'Success' : 'Error'}</div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">${message}</div>
            </div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /* ------------------ Enrollment Logic ------------------ */

    async function removeCourse(courseName, sectionName, courseCode) {
        try {
            const formData = new FormData();
            formData.append("id", courseCode);
            formData.append("confirm_delete", "1");

            const response = await fetch("https://horizon.ucp.edu.pk/student/enrollment/cart/del", {
                method: "POST",
                headers: {
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: formData,
                credentials: "include"
            });

            if (!response.ok) throw new Error("Failed to remove course");

            const index = enrolledCourses.findIndex(c => c.courseName === courseName && c.sectionName === sectionName);
            if (index !== -1) {
                enrolledCourses.splice(index, 1);
                await updateTimetable();
                toEnroll = await extractCoursesFromNetworkRequest();
                renderCourses();
                showToast(`Removed ${courseName}`, "success");
                document.querySelectorAll('.enrolled-tag').forEach(tag => tag.classList.remove('disabled'));
            }
        } catch (err) {
            showToast(`Could not remove ${courseName}`, "error");
        }
    }

    async function enrollCourseInSection(courseName, courseCode, section) {
        const course = toEnroll.find(c => c.courseName === courseName);
        if (enrolledCourses.some(c => c.courseName === courseName)) {
            showToast('Already enrolled', 'error');
            return;
        }

        // Backend enrollment simulation using frontend scraping data
        const btn = document.querySelector(`div[id="section_${courseCode}_${section.sectionName}"] button[name="${courseCode}"]`);
        if (btn) {
            const onclickStr = btn.getAttribute('onclick');
            const startIdx = onclickStr.indexOf('add_course_to_cart(') + 19;
            const endIdx = onclickStr.lastIndexOf(')');
            const rawArgs = onclickStr.substring(startIdx, endIdx);
            const args = rawArgs.split(/,(?![^\[]*\])/).map(arg => arg.trim().replace(/^['"]|['"]$/g, ''));

            const formData = new FormData();
            formData.append("course_code", args[0]);
            formData.append("course_section", args[1]);
            formData.append("section_id", args[2]);
            formData.append("course_type", args[3]);
            formData.append("registration_id", args[7]);
            formData.append("registered", args[8]);

            const coupledRaw = args[4];
            if (coupledRaw && coupledRaw !== "[]") {
                const coupledMatch = coupledRaw.match(/(\d+)(?=\s*\]\s*\}\s*\]|\])/);
                if (coupledMatch) formData.append("coupled_courses", coupledMatch[0]);
            }

            try {
                const response = await fetch("https://horizon.ucp.edu.pk/student/enrollment/cart/add", {
                    method: "POST",
                    body: formData,
                    credentials: "include",
                    headers: {
                        "X-Requested-With": "XMLHttpRequest",
                        "Accept": "application/json, text/javascript, */*; q=0.01"
                    }
                });
                const result = await response.json();
                
                // Logic to confirm enrollment implicitly via updateTimetable
                await updateTimetable();
                renderCourses();
                return result;
            } catch (error) {
                console.error("Enrollment fetch failed:", error);
            }
        }
    }

    /* ------------------ Timetable Rendering ------------------ */

    async function fetchTimetable() {
        const timetable = {};
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const times = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

        days.forEach(day => {
            timetable[day] = {};
            times.forEach(time => {
                timetable[day][time] = null;
            });
        });

        enrolledCourses.forEach(course => {
            course.schedule.forEach(slot => {
                if (timetable[slot.day] && timetable[slot.day][slot.startTime] !== undefined) {
                    timetable[slot.day][slot.startTime] = {
                        courseName: course.courseName,
                        class: slot.class,
                        startTime: slot.startTime,
                        endTime: slot.endTime
                    };
                }
            });
        });
        return timetable;
    }

    async function updateTimetable() {
        await updateEnrolledList();
        const weekDays = await updateEnrolledCoursesScheduleFromTimeTable();
        const daysMap = { "Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6 };

        enrolledCourses.forEach(course => {
            course.schedule.forEach(c => {
                const item = weekDays[daysMap[c.day]]?.querySelector(`li.cd-schedule__event a[data-start="${c.startTime}"]`);
                c.class = item?.lastElementChild?.textContent?.replace(/\s+/g, ' ')?.trim() ?? "X-000";
            })
        })

        const container = document.getElementById('timetableContainer');
        container.innerHTML = '<div class="spinner"><div class="spinner-circle"></div></div>';
        timetableData = await fetchTimetable();

        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const times = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

        let tableHTML = '<table class="timetable"><thead><tr><th>Time</th>';
        days.forEach(day => tableHTML += `<th style="background: rgba(255,255,255,0.7) !important; color: #000 !important;">${day}</th>`);
        tableHTML += '</tr></thead><tbody>';

        times.forEach(time => {
            tableHTML += `<tr><td>${time}</td>`;
            days.forEach(day => {
                const slot = timetableData[day][time];
                if (slot) {
                    const color = getCourseColor(slot.courseName);
                    const abbr = getCourseAbbr(slot.courseName);
                    tableHTML += `
                            <td>
                                <div class="timetable-cell" 
                                     style="background: ${color};"
                                     data-course-name="${slot.courseName}"
                                     data-time-range="${slot.startTime} - ${slot.endTime}">
                                    <div class="course-abbr">${abbr}</div>
                                    <div class="room-badge">${slot.class}</div>
                                </div>
                            </td>`;
                } else {
                    tableHTML += '<td></td>';
                }
            });
            tableHTML += '</tr>';
        });
        tableHTML += '</tbody></table>';
        container.innerHTML = tableHTML;

        document.querySelectorAll('.timetable-cell').forEach(cell => {
            cell.addEventListener('mouseenter', (e) => showTooltip(e, cell.dataset.courseName, cell.dataset.timeRange));
            cell.addEventListener('mouseleave', () => hideTooltip());
        });
    }

    function showTooltip(event, courseName, timeRange) {
        const tooltip = document.getElementById('tooltip');
        tooltip.innerHTML = `<strong>${courseName}</strong><br>${timeRange}`;
        tooltip.classList.add('show');
        const rect = event.target.getBoundingClientRect();
        tooltip.style.left = rect.left + rect.width / 2 + 'px';
        tooltip.style.top = rect.top - 10 + 'px';
        tooltip.style.transform = 'translate(-50%, -100%)';
    }

    function hideTooltip() {
        document.getElementById('tooltip').classList.remove('show');
    }

    async function updateEnrolledList() {
        enrolledCourses = await getEnrolledCoursesFromCart();
        const list = document.getElementById('enrolledList');
        if (enrolledCourses.length === 0) {
            list.innerHTML = '<span style="color: var(--text-secondary); font-size: 0.875rem;">No courses enrolled yet</span>';
        } else {
            list.innerHTML = enrolledCourses.map(course => `
                    <div style="background-color: ${getCourseColor(course.courseName)};" class="enrolled-tag">
                        <span>${course.courseName} (${course.sectionName})</span>
                        <button class="remove-btn" data-course="${course.courseName}" data-code="${course.courseDeleteCode}" data-section="${course.sectionName}">
                            <span style="margin: 0 !important; color: white !important;" class="material-icons">close</span>
                        </button>
                    </div>
                `).join('');
        }
        document.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.disabled = true;
                document.querySelectorAll('.enrolled-tag').forEach(tag => tag.classList.add('disabled'));
                document.getElementById('timetableContainer').innerHTML = '<div class="spinner"><div class="spinner-circle"></div></div>';
                removeCourse(btn.dataset.course, btn.dataset.section, btn.dataset.code);
            });
        });
    }

    /* ------------------ Course List Rendering ------------------ */

    function renderCourses() {
        const grid = document.getElementById('coursesGrid');

        toEnroll.forEach(course => {
            const hasCoreq = course.coreq && !course.coreq.includes('Nill');
            const isEnrolled = enrolledCourses.some(c => c.courseName === course.courseName);
            course.availableSections.forEach(section => {
                const hasConflict = hasConflictWithEnrolled(section.classSchedule);
                const sectionEnrolled = enrolledCourses.some(c => c.courseName === course.courseName && c.sectionName === section.sectionName);
                section.sectionEnrolled = sectionEnrolled;
                section.hasConflict = hasConflict;
                section.isDisabled = section.status !== 'Open' || hasConflict || (isEnrolled && !sectionEnrolled);
            });
            course.hasCoreq = hasCoreq;
            course.isEnrolled = isEnrolled;
        });

        toEnroll.sort((a, b) => {
            const aHasDisabled = a.availableSections.some(s => s.isDisabled);
            const bHasDisabled = b.availableSections.some(s => s.isDisabled);
            return Number(aHasDisabled) - Number(bHasDisabled);
        });

        const availableCoursesCount = toEnroll.filter(i => !i.isEnrolled).length;
        if (toEnroll.length <= 0) {
            document.querySelector('.courses-section').style.display = 'none';
            document.querySelector('.main-content').style.gridTemplateColumns = '1fr';
        } else {
            document.querySelector('.courses-section').style.display = 'block';
            document.querySelector('#available-courses-count').innerText = availableCoursesCount;
            document.querySelector('.main-content').style.gridTemplateColumns = '1fr 3fr';
        }

        grid.innerHTML = toEnroll.map((course, index) => {
            return `
                <div class="course-card" style="animation-delay: ${index * 0.1}s;">
                    <div class="course-header">
                        <div class="course-title">
                            <h3>${course.courseName}</h3>
                            <div class="course-meta">
                                <span class="badge" style="color: var(--primary);">
                                    <span class="material-icons" style="font-size: 14px; color: var(--primary) !important;">school</span>
                                    ${course.type}
                                </span>
                                ${course.hasCoreq ? `<span class="badge coreq"><span class="material-icons" style="font-size: 14px;">link</span>Co-req: ${course.coreq.substring(0, 24)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="sections">
                        ${course.availableSections.map(section => `
                            <div class="section ${section.isDisabled ? 'disabled' : ''} ${section.sectionEnrolled ? 'enrolled' : ''}">
                                <div class="section-header">
                                    <div class="section-name">
                                        <span class="material-icons" style="font-size: 20px;">class</span>
                                        Section ${section.sectionName}
                                    </div>
                                    <span class="status-badge ${section.sectionEnrolled ? 'enrolled' : section.status.toLowerCase()}">${section.sectionEnrolled ? 'Enrolled' : section.status}</span>
                                </div>
                                <div class="schedule">
                                    ${section.classSchedule.map(slot => `<div class="schedule-item"><span class="material-icons">schedule</span>${slot.day} ${slot.startTime}-${slot.endTime}</div>`).join('')}
                                </div>
                                <button class="enroll-btn" data-code="${course.courseCode}" data-course="${course.courseName}" data-section='${encodeURIComponent(JSON.stringify(section))}' ${section.isDisabled ? 'disabled' : ''}>
                                    <span class="material-icons" style="font-size: 18px; color: white !important; margin: 0 !important;">${section.sectionEnrolled ? 'check_circle' : section.hasConflict ? 'block' : 'add_circle'}</span>
                                    ${section.sectionEnrolled ? 'Enrolled' : section.hasConflict ? 'Time Conflict' : 'Enroll'}
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        }).join('');

        document.querySelectorAll('.enroll-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const courseName = btn.dataset.course;
                const courseCode = btn.dataset.code;
                const section = JSON.parse(decodeURIComponent(btn.dataset.section));
                btn.disabled = true;
                document.getElementById('timetableContainer').innerHTML = '<div class="spinner"><div class="spinner-circle"></div></div>';
                enrollCourseInSection(courseName, courseCode, section);
            });
        });
    }

    /* ------------------ AI Logic & Backtracking ------------------ */

    function openAIModal() {
        const modal = document.getElementById('aiModal');
        const courseSelect = document.getElementById('aiCourseSelect');
        courseSelect.innerHTML = toEnroll.map(course => `
                <label class="course-checkbox">
                    <input type="checkbox" value="${course.courseName}" data-code="${course.courseCode}"
                           ${enrolledCourses.some(c => c.courseName === course.courseName) ? 'checked disabled' : ''}>
                    <span>${course.courseName}</span>
                </label>
            `).join('');
        modal.classList.add('show');
    }

    function closeAIModal() {
        document.getElementById('aiModal').classList.remove('show');
    }

    function selectPreference(preference, ev) {
        const targetEl = (ev && ev.currentTarget) || document.querySelector(`.preference-option[data-preference="${preference}"]`);
        document.querySelectorAll('.preference-option').forEach(opt => opt.classList.remove('selected'));
        if (targetEl) targetEl.classList.add('selected');
        const inputEl = document.querySelector(`input[value="${preference}"]`);
        if (inputEl) inputEl.checked = true;
    }

    /**
     * AI Processing with Backtracking and Scoring
     */
    async function processAISelection() {
        const selectedInputs = Array.from(document.querySelectorAll('#aiCourseSelect input:checked:not([disabled])'));
        const preference = document.querySelector('input[name="preference"]:checked')?.value;

        if (selectedInputs.length === 0) return showToast('Please select at least one course', 'error');
        if (!preference) return showToast('Please select a preference', 'error');

        closeAIModal();
        showToast('AI is optimizing! Kuch time lag sakta ha...', 'success');

        // 1. Prepare Target Courses
        // We filter out co-requisites if their main course is also selected to avoid double processing.
        // We assume enrolling in Main handles Coreq or we must pick Main such that a Coreq fits.
        const targetCourses = [];
        const selectionMap = new Set(selectedInputs.map(i => i.value));

        selectedInputs.forEach(input => {
            const course = toEnroll.find(c => c.courseName === input.value);
            if (!course) return;

            // If this course is a coreq of another selected course, skip it (main handles it)
            // But we must know which is main. Usually, the one with "Coreq: X" is the main.
            // If both point to each other, we pick one arbitrarily (alphabetical).
            let skip = false;
            if (course.coreq && !course.coreq.includes('Nill')) {
                if (selectionMap.has(course.coreq)) {
                     // Check if we should skip this one to avoid duplicates
                     // Logic: skip if courseName > coreqName (arbitrary stable sort)
                     if (course.courseName > course.coreq) skip = true;
                }
            }
            if (!skip) targetCourses.push(course);
        });

        // 2. Backtracking Solver
        // Generates valid schedules where no two classes overlap
        let validSchedules = [];
        const MAX_SOLUTIONS = 5000; // Cap to prevent browser freeze

        function backtrack(index, currentSchedule) {
            if (validSchedules.length >= MAX_SOLUTIONS) return;

            // Base Case: All courses scheduled
            if (index === targetCourses.length) {
                validSchedules.push(currentSchedule);
                return;
            }

            const course = targetCourses[index];
            const openSections = course.availableSections.filter(s => s.status === 'Open');

            for (let section of openSections) {
                // Check internal conflict
                const combinedCurrent = currentSchedule.flatMap(s => s.schedule); // flattened schedule of built so far
                if (checkConflict(section.classSchedule, combinedCurrent)) continue;
                if (hasConflictWithEnrolled(section.classSchedule)) continue;

                // Handle Co-req: If this course has a coreq, we must ensure there exists a VALID coreq section
                // that fits into the current schedule + this section.
                let coreqScheduleToAdd = [];
                let hasValidCoreq = true;

                if (course.coreq && !course.coreq.includes('Nill')) {
                    const coreqCourse = toEnroll.find(c => c.courseName === course.coreq);
                    // Only care if coreq is not already enrolled
                    if (coreqCourse && !enrolledCourses.some(c => c.courseName === coreqCourse.courseName)) {
                        const compatibleCoreqSections = coreqCourse.availableSections.filter(cs =>
                            cs.status === 'Open' &&
                            !checkConflict(cs.classSchedule, section.classSchedule) &&
                            !checkConflict(cs.classSchedule, combinedCurrent) &&
                            !hasConflictWithEnrolled(cs.classSchedule)
                        );
                        
                        if (compatibleCoreqSections.length === 0) {
                            hasValidCoreq = false; // This main section is invalid because no coreq fits
                        } else {
                            // We optimistically take the first compatible one for scoring purposes
                            // In a perfect world we would branch on coreq sections too, but that explodes complexity.
                            // We assume backend or user can pick *any* compatible coreq.
                            // To be better, we pick the "best" compatible coreq for the preference here.
                            // Simplified: Just add the first compatible one's schedule to the time-block for scoring.
                            coreqScheduleToAdd = compatibleCoreqSections[0].classSchedule;
                        }
                    }
                }

                if (hasValidCoreq) {
                    backtrack(index + 1, [
                        ...currentSchedule,
                        {
                            course: course,
                            section: section,
                            schedule: [...section.classSchedule, ...coreqScheduleToAdd] // Combine for scoring
                        }
                    ]);
                }
            }
        }

        // Start solving
        backtrack(0, []);

        if (validSchedules.length === 0) {
            return showToast('No conflict-free schedule found for selection.', 'error');
        }

        // 3. Scoring
        let bestSchedule = null;
        let bestScore = (preference === 'morning' || preference === 'days-off' || preference === 'no-gaps') ? Infinity : -Infinity;

        validSchedules.forEach(plan => {
            const flatSchedule = plan.flatMap(p => p.schedule);
            let score = 0;

            if (preference === 'morning') {
                // Minimize average start minute
                const totalMinutes = flatSchedule.reduce((sum, slot) => sum + timeToMinutes(slot.startTime), 0);
                score = totalMinutes / flatSchedule.length;
                if (score < bestScore) {
                    bestScore = score;
                    bestSchedule = plan;
                }
            } else if (preference === 'evening') {
                // Maximize average start minute
                const totalMinutes = flatSchedule.reduce((sum, slot) => sum + timeToMinutes(slot.startTime), 0);
                score = totalMinutes / flatSchedule.length;
                if (score > bestScore) {
                    bestScore = score;
                    bestSchedule = plan;
                }
            } else if (preference === 'days-off') {
                // Minimize unique days
                const uniqueDays = new Set(flatSchedule.map(s => s.day)).size;
                score = uniqueDays;
                if (score < bestScore) {
                    bestScore = score;
                    bestSchedule = plan;
                }
            } else if (preference === 'no-gaps') {
                // Minimize time gaps between classes per day
                const dayBuckets = {};
                flatSchedule.forEach(slot => {
                    if (!dayBuckets[slot.day]) dayBuckets[slot.day] = [];
                    dayBuckets[slot.day].push({ start: timeToMinutes(slot.startTime), end: timeToMinutes(slot.endTime) });
                });
                
                let totalGap = 0;
                Object.values(dayBuckets).forEach(daySlots => {
                    daySlots.sort((a, b) => a.start - b.start);
                    for (let i = 0; i < daySlots.length - 1; i++) {
                        const gap = daySlots[i+1].start - daySlots[i].end;
                        if (gap > 0) totalGap += gap;
                    }
                });
                score = totalGap;
                if (score < bestScore) {
                    bestScore = score;
                    bestSchedule = plan;
                }
            }
        });

        // 4. Execution
        if (bestSchedule) {
            const container = document.getElementById('timetableContainer');
            container.innerHTML = '<div class="spinner"><div class="spinner-circle"></div></div>';
            
            let successCount = 0;
            for (let item of bestSchedule) {
                try {
                    await enrollCourseInSection(item.course.courseName, item.course.courseCode, item.section);
                    successCount++;
                    // Small delay to ensure backend processes
                    await new Promise(r => setTimeout(r, 600));
                } catch (e) {
                    console.error(e);
                }
            }

            await updateTimetable();
            renderCourses();
            showToast(`AI enrolled in ${successCount} optimized courses!`, 'success');
        }
    }

    /* ------------------ Initialization ------------------ */

    function attachEventListeners() {
        const aiBtn = document.querySelector('.ai-button');
        if (aiBtn) aiBtn.addEventListener('click', openAIModal);

        document.querySelectorAll('.modal-close, #aiCancelBtn').forEach(btn => {
            btn.addEventListener('click', closeAIModal);
        });

        const aiGenerate = document.getElementById('aiGenerateBtn');
        if (aiGenerate) aiGenerate.addEventListener('click', processAISelection);

        document.querySelectorAll('.preference-option').forEach(opt => {
            opt.addEventListener('click', (ev) => selectPreference(opt.dataset.preference, ev));
        });
    }

    // Inject HTML
    container.insertAdjacentHTML('beforeBegin', `
        <div class="container">
            <div class="header">
                <h1>📚 Course Enrollment</h1>
                <div class="toggle-wrapper">
                    <span style="color: #6c6c6cff;" id="offLabel">OLD UI</span>
                    <label class="toggle">
                        <input checked type="checkbox" id="toggleSwitch">
                        <span class="slider"></span>
                    </label>
                    <span style="color: #6c6c6cff;" id="onLabel">NEW UI</span>
                </div>
            </div>
            <div class="main-content">
                <div class="courses-section">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem;">
                        <span class="material-icons" style="color: var(--primary) !important; margin: 0 !important;">school</span>
                        <h2 style="font-size: 1.5rem; font-weight: 700;">Available Courses</h2>
                    </div>
                    <p style="margin-left: 1rem; color: #fe4343ff;"><span id="available-courses-count">0</span> available</p>
                    <div class="courses-grid" id="coursesGrid"></div>
                </div>
                <div class="timetable-wrapper">
                    <div class="enrolled-section">
                        <div class="enrolled-header">
                            <span class="material-icons" style="color: var(--success) !important; margin: 0 !important;">check_circle</span>
                            <h2>Enrolled Courses</h2>
                        </div>
                        <div class="enrolled-list" id="enrolledList">
                            <span style="color: var(--text-secondary); font-size: 0.875rem;">No courses enrolled yet</span>
                        </div>
                    </div>
                    <div class="timetable-section">
                        <div class="timetable-header">
                            <span class="material-icons" style="color: var(--primary);">calendar_today</span>
                            <h2>Weekly Timetable</h2>
                        </div>
                        <div class="timetable-container" id="timetableContainer">
                            <div class="spinner"><div class="spinner-circle"></div></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <button class="ai-button"><span class="material-icons">equalizer</span>Let AI Decide ⚡</button>
        <div class="modal" id="aiModal">
            <div class="modal-content">
                <div class="modal-header">
                    <span class="material-icons" style="color: var(--primary);">psychology</span>
                    <div><h3>⚛ AI Course Enrollment</h3><p style="font-size: 15px; color: #5e5e5eff;">Powered by <span style="color: white; background: crimson; border-radius: 8px; padding: 4px;">UCP Smart Portal</span></p></div>
                    <button class="modal-close"><span class="material-icons">close</span></button>
                </div>
                <div class="form-group"><label>Select Courses to Enroll</label><div class="course-select" id="aiCourseSelect"></div></div>
                <div class="form-group">
                    <label>Your Preference</label>
                    <div class="preference-select">
                        <div class="preference-option" data-preference="days-off"><span class="material-icons">weekend</span><input type="radio" name="preference" value="days-off" id="pref-days"><label for="pref-days">Days Off</label></div>
                        <div class="preference-option" data-preference="morning"><span class="material-icons">wb_sunny</span><input type="radio" name="preference" value="morning" id="pref-morning"><label for="pref-morning">Morning</label></div>
                        <div class="preference-option" data-preference="evening"><span class="material-icons">brightness_2</span><input type="radio" name="preference" value="evening" id="pref-evening"><label for="pref-evening">Evening</label></div>
                        <div class="preference-option" data-preference="no-gaps"><span class="material-icons">view_agenda</span><input type="radio" name="preference" value="no-gaps" id="pref-nogaps"><label for="pref-nogaps">No Gaps</label></div>
                    </div>
                </div>
                <div class="modal-actions"><button class="btn btn-secondary" id="aiCancelBtn">Cancel</button><button class="btn btn-primary" id="aiGenerateBtn"><span class="material-icons" style="font-size: 20px;">auto_awesome</span>Generate Schedule</button></div>
            </div>
        </div>
        <div class="tooltip" id="tooltip"></div>
    `);

    // Bootstrap
    toEnroll = extractCoursesFromDOM();
    const toggle = document.getElementById("toggleSwitch");
    document.querySelector('#page_content_inner').style.display = 'none';

    toggle.addEventListener("change", function () {
        if (toggle.checked) {
            document.querySelector('.main-content').style.display = 'grid';
            document.querySelector('#page_content_inner').style.display = 'none';
        } else {
            document.querySelector('.main-content').style.display = 'none';
            document.querySelector('#page_content_inner').style.display = 'block';
        }
    });

    renderCourses();
    await updateTimetable();
    attachEventListeners();
});