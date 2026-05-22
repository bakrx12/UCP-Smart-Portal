chrome.storage.local.get('toggle_power', (result) => {
    const enabled = result['toggle_power'];

    if (enabled) {
        let countdownInterval;

        const parentContainer = document.querySelector('#page_content_inner');
        parentContainer.insertAdjacentHTML('afterbegin', `
           <div style="place-items: center;">
            <div class="ucp-ds-shell">
  <div class="ucp-ds-row">
    <div class="ucp-ds-card">
      <div class="ucp-ds-header"><div class="ucp-ds-title">Next Exam</div></div>
      <div id="ucp-ds-next-name" style="font-weight:800;font-size:25px;margin-top:6px;padding:0 1rem 1rem 0;">—</div>
      <div id="ucp-ds-count" class="ucp-ds-count">—</div>
      <div id="ucp-ds-remark" class="ucp-ds-remark">—</div>
      <a href="/student/slip/download" class="ucp-ds-btn" id="ucp-ds-download"><span class="material-icons" style="color: #2563eb !important;">arrow_downward</span>Download Exam Slip</a>
    </div>

    <div class="ucp-ds-card">
      <div class="ucp-ds-title">Summary</div>
      <div id="ucp-ds-summary" style="margin-top:6px;font-weight:600;font-size:14px;color:var(--ucp-ds-muted)">—</div>
      <div class="ucp-ds-legend" id="ucp-ds-legend"></div>
    </div>
  </div>

  <div class="ucp-ds-calendar">
    <div class="ucp-ds-cal-head">
        <button style="width: 4rem;" id="ucp-ds-prev" class="ucp-ds-btn" disabled><span class="material-icons">chevron_left</span></button>
        <div id="ucp-ds-month">Month</div>
        <button style="width: 4rem;" id="ucp-ds-next" class="ucp-ds-btn" disabled><span class="material-icons">chevron_right</span></button>
      
    </div>
    <div class="ucp-ds-day-names">
        <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
    </div>
    <div class="ucp-ds-grid" id="ucp-ds-grid"></div>
  </div>
</div>

<div class="ucp-ds-tooltip" id="ucp-ds-tooltip"></div>
           </div>
        `)

        // Patch 1.5 [Critical]: Fix date offset bug with exams
        function toLocalISO(y, m, d) {
            return `${y}-${pad(m + 1)}-${pad(d)}`;
        }


        function extractDateSheet() {
            // Select all rows inside the table body (excluding the last one with the link)
            const rows = document.querySelectorAll("table tbody tr");

            const dateSheet = [];

            rows.forEach(row => {
                const cells = row.querySelectorAll("td");

                // Skip rows that don’t have course data (e.g., the one containing a link)
                if (cells.length < 6) return;

                const courseName = cells[1].textContent.trim();
                const teacher = cells[2].textContent.trim();
                const date = cells[3].textContent.trim();
                const time = cells[4].textContent.trim();
                const venue = cells[5].textContent.trim();

                // Split the time range into start and end times
                const [startTime, endTime] = time.split(" - ").map(t => t.trim());

                dateSheet.push({
                    courseName,
                    teacher,
                    date,
                    startTime,
                    endTime,
                    venue
                });
            });

            return dateSheet;
        }

        const dateSheet = extractDateSheet();

        const $ = s => document.querySelector(s);
        function abbrev(n) { return n.split(/\s+/).map(w => w[0]).join('').toUpperCase(); }
        function toDate(d, t) { const [y, m, dd] = d.split('-'); const [hh, mm] = t.split(':'); return new Date(y, m - 1, dd, hh, mm); }
        function pad(n) { return String(n).padStart(2, '0'); }

        const grads = ["ucp-ds-grad-0", "ucp-ds-grad-1", "ucp-ds-grad-2", "ucp-ds-grad-3", "ucp-ds-grad-4", "ucp-ds-grad-5", "ucp-ds-grad-6", "ucp-ds-grad-7"];
        const exams = dateSheet.map((e, i) => ({ ...e, start: toDate(e.date, e.startTime), end: toDate(e.date, e.endTime), idx: i }))
            .sort((a, b) => a.start - b.start);

        const tooltip = $("#ucp-ds-tooltip");

        if (!exams.length) { $("#ucp-ds-grid").innerHTML = "<div style='text-align:center;color:#64748b; padding: 4rem; font-size: x-large;'>No date sheet available</div>"; }
        else {
            // Calculate min/max month/year using the sorted exams array
            const firstExamDate = exams[0].start;
            const lastExamDate = exams.at(-1).start;
            let curMonth = firstExamDate.getMonth();
            let curYear = firstExamDate.getFullYear();

            // Extract unique months/years containing exams for navigation logic
            const examMonths = new Set(exams.map(e => `${e.start.getFullYear()}-${e.start.getMonth()}`));
            const minMonthYear = `${firstExamDate.getFullYear()}-${firstExamDate.getMonth()}`;
            const maxMonthYear = `${lastExamDate.getFullYear()}-${lastExamDate.getMonth()}`;

            renderSummary(); renderCalendar(); renderCountdown();

            $("#ucp-ds-prev").onclick = () => {
                curMonth--;
                if (curMonth < 0) { curMonth = 11; curYear--; }
                renderCalendar();
            };
            $("#ucp-ds-next").onclick = () => {
                curMonth++;
                if (curMonth > 11) { curMonth = 0; curYear++; }
                renderCalendar();
            };

            $("#ucp-ds-download").onclick = () => {
                const n = getNext(); if (!n) return alert("No exam upcoming!");
                const txt = `Exam Slip\nCourse: ${n.courseName}\nDate: ${n.date}\nTime: ${n.startTime}-${n.endTime}\nVenue: ${n.venue}`;
                const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = 'exam_slip.txt'; a.click();
            };

            function getNext() { const now = new Date(); return exams.find(e => e.end > now); }

            function renderSummary() {
                const unique = new Set(exams.map(e => e.courseName));
                $("#ucp-ds-summary").textContent = `${exams.length} exams • ${unique.size} courses (${exams[0].date} → ${exams.at(-1).date})`;
                const legend = $("#ucp-ds-legend"); legend.innerHTML = "";
                [...unique].forEach((c, i) => {
                    const grad = grads[i % grads.length];
                    const item = document.createElement("div"); item.className = "ucp-ds-legend-item";
                    item.innerHTML = `<span class="ucp-ds-legend-swatch ${grad}"></span>${abbrev(c)} — ${c}`;
                    legend.appendChild(item);
                });
            }

            function renderCalendar() {
                const grid = $("#ucp-ds-grid"); grid.innerHTML = "";
                $("#ucp-ds-month").textContent = new Date(curYear, curMonth).toLocaleString('default', { month: 'long', year: 'numeric' });
                const first = new Date(curYear, curMonth, 1); const days = new Date(curYear, curMonth + 1, 0).getDate();

                // Calculate previous/next month status for navigation
                const nextMonth = new Date(curYear, curMonth + 1);
                const prevMonth = new Date(curYear, curMonth - 1);
                const nextMonthKey = `${nextMonth.getFullYear()}-${nextMonth.getMonth()}`;
                const prevMonthKey = `${prevMonth.getFullYear()}-${prevMonth.getMonth()}`;
                const currentMonthKey = `${curYear}-${curMonth}`;

                // Navigation Buttons Logic
                $("#ucp-ds-prev").disabled = !examMonths.has(prevMonthKey) || currentMonthKey === minMonthYear;
                $("#ucp-ds-next").disabled = !examMonths.has(nextMonthKey) || currentMonthKey === maxMonthYear;

                for (let i = 0; i < first.getDay(); i++)grid.appendChild(dayEl("", true, false)); // Pass false for isExamDay

                for (let d = 1; d <= days; d++) {
                    const dateISO = toLocalISO(curYear, curMonth, d);
                    const matches = exams.filter(e => e.date === dateISO);
                    // Pass the correct boolean for isExamDay to control styling
                    const isExamDay = matches.length > 0;
                    const cell = dayEl(d, !isExamDay, isExamDay);

                    matches.forEach(e => {
                        const t = document.createElement("div");
                        t.className = `ucp-ds-exam ${grads[e.idx % grads.length]}`;
                        if (e.end < new Date()) t.classList.add("ucp-ds-past");
                        if (e.start <= new Date() && e.end >= new Date()) t.classList.add("ucp-ds-ongoing");
                        t.innerHTML = `<div class="ucp-ds-abbrev">${abbrev(e.courseName)}</div>
                     <div>${e.startTime} <span class="ucp-ds-venue">${e.venue}</span></div>`;
                        t.addEventListener('mouseenter', ev => showTip(ev, e));
                        t.addEventListener('mouseleave', hideTip);
                        cell.appendChild(t);
                    });
                    grid.appendChild(cell);
                }
            }

            function showTip(ev, e) {
                tooltip.style.display = 'block';
                tooltip.innerHTML = `<strong>${e.courseName}</strong><br>
    Teacher: ${e.teacher}<br>
    Date: ${e.date}<br>
    Time: ${e.startTime}–${e.endTime}<br>
    Venue: ${e.venue}`;
                const rect = ev.target.getBoundingClientRect();
                tooltip.style.top = (rect.top + window.scrollY - 10) + 'px';
                tooltip.style.left = (rect.left + rect.width + 12) + 'px';
            }
            function hideTip() { tooltip.style.display = 'none'; }

            // Modified dayEl function to include collapse logic
            function dayEl(num, isOtherMonth, isExamDay) {
                const div = document.createElement("div");
                let className = "ucp-ds-day";
                if (isOtherMonth) {
                    className += " ucp-ds-day--muted";
                }

                // If it's a day in the current month AND not an exam day, collapse it.
                if (num && !isExamDay) {
                    className += " ucp-ds-day--empty";
                }

                div.className = className;
                if (num) div.innerHTML = `<strong>${num}</strong>`;
                return div;
            }



            function renderCountdown() {
                const next = getNext();
                if (!next) return;

                // cancel previous animation loop if exists
                if (window.__countdownRAF) {
                    cancelAnimationFrame(window.__countdownRAF);
                    window.__countdownRAF = null;
                }

                $("#ucp-ds-next-name").textContent = `${next.courseName} (${next.venue})`;
                const count = $("#ucp-ds-count");
                const remark = $("#ucp-ds-remark");

                let lastUpdate = 0; // last time we updated (ms)

                function loop(timestamp) {
                    // first frame initialization
                    if (!lastUpdate) lastUpdate = timestamp;

                    // Only update every 1000 ms
                    if (timestamp - lastUpdate >= 1000) {
                        lastUpdate = timestamp;

                        const now = new Date();
                        const diff = next.start - now;
                        const h = diff / (1000 * 60 * 60);

                        if (diff < 0) {
                            renderCountdown(); // restart for next exam
                            return;
                        }

                        // Colour + remarks
                        if (h > 24) {
                            count.className = "ucp-ds-count ucp-ds-count--green";
                            remark.textContent = "Abhi bohot time ha lala... 🫡";
                        }
                        else if (h <= 6) {
                            count.className = "ucp-ds-count ucp-ds-count--red";
                            remark.textContent = "Khuda ka wasta, parh le! 😩";
                        }
                        else if (h <= 24) {
                            count.className = "ucp-ds-count ucp-ds-count--orange";
                            remark.textContent = "Parh le bhai! 🙃";
                        }

                        const d = Math.floor(h / 24);
                        const hh = Math.floor(h % 24);
                        const mm = Math.floor((diff % (1000 * 60 * 60)) / 60000);
                        const ss = Math.floor((diff % (1000 * 60)) / 1000);

                        count.textContent = `Starts in: ${pad(d)}:${pad(hh)}:${pad(mm)}:${pad(ss)}`;
                    }

                    // schedule next frame
                    window.__countdownRAF = requestAnimationFrame(loop);
                }

                requestAnimationFrame(loop); // start loop
            }


        }

    }
})