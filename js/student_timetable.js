chrome.storage.local.get('toggle_power', (result) => {
    const enabled = result['toggle_power'];
    const MAKEUP_CLASS = "MAKEUP CLASS";
    const LECTURE_BREAK_DURATION_IN_MINUTES = 5; // [UPDATE] v2.3.5: Take into consideration

    if (enabled) {

        function timeToMinutes(timeStr) {
            const parts = timeStr.split(':');
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            return (hours * 60) + minutes;
        }

        function findTimeDifference(time1, time2) {
            const minutes1 = timeToMinutes(time1);
            const minutes2 = timeToMinutes(time2);
            return Math.abs(minutes1 - minutes2);
        }

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

        const cardParent = document.querySelector('div.md-card');
        if (cardParent) {
            cardParent.insertAdjacentHTML('beforeBegin', `
              <div class="glassmorphic-timetable-card" role="region" aria-label="Weekly timetable (glassmorphic)">
                <table id="glassmorphic-timetable-table" class="glassmorphic-timetable-table"></table>
              </div>
            `);
        }

        const startHour = 8;
        const endHour = 22;
        const daysArr = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

        const timeTable = extractTimeTableInfo();
        //console.log('Time Table =', timeTable);

        // detect minimum slot duration dynamically
        let slotDurationInMinutes = 60;

        if (timeTable.length > 0) {
            const durations = timeTable.map(e =>
                findTimeDifference(e.startTime, e.endTime)
            );
            slotDurationInMinutes = Math.min(...durations);
        }

        slotDurationInMinutes += LECTURE_BREAK_DURATION_IN_MINUTES;

        const timetable = document.getElementById("glassmorphic-timetable-table");
        if (!timetable) return;

        function generateTimeSlots() {
            const slots = [];
            let currentMinutes = startHour * 60;
            const endMinutes = endHour * 60;

            while (currentMinutes < endMinutes) {
                const h = Math.floor(currentMinutes / 60);
                const m = currentMinutes % 60;
                slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                currentMinutes += slotDurationInMinutes;
            }
            return slots;
        }

        const timeSlots = generateTimeSlots();

        const gradientMap = {};
        function getGradientClass(name) {
            if (!gradientMap[name])
                gradientMap[name] = `glassmorphic-timetable-g-${Object.keys(gradientMap).length % 8}`;
            return gradientMap[name];
        }

        function parseTime(t) {
            if (!t) return 0;
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        }

        function getCurrentMinutes() {
            const now = new Date();
            return {
                mins: now.getHours() * 60 + now.getMinutes(),
                day: ((now.getDay() + 6) % 7)
            };
        }

        const now = getCurrentMinutes();
        const currentMinutes = now.mins;
        const currentDay = now.day;

        let headerRow = '<tr><th class="glassmorphic-timetable-day-col">📅 / ⏱️</th>';
        timeSlots.forEach(s =>
            headerRow += `<th class="glassmorphic-timetable-time-col">${s}</th>`
        );
        headerRow += '</tr>';
        timetable.innerHTML = headerRow;

        daysArr.forEach((day, dayIndex) => {
            let row = `<tr><th class="glassmorphic-timetable-day-col">${day}</th>`;

            timeSlots.forEach(slot => {
                const slotStart = parseTime(slot);
                const slotEnd = slotStart + slotDurationInMinutes;

                // 🔥 FIX: match class if it STARTS inside slot range
                const entry = timeTable.find(e => {
                    if (e.day !== dayIndex) return false;
                    const classStart = parseTime(e.startTime);
                    return classStart >= slotStart && classStart < slotEnd;
                });

                let classes = 'glassmorphic-timetable-empty-slot';

                if (entry) {
                    if (dayIndex < currentDay || (dayIndex === currentDay && slotEnd <= currentMinutes))
                        classes = 'glassmorphic-timetable-past-slot';
                    else if (dayIndex === currentDay && currentMinutes >= slotStart && currentMinutes < slotEnd)
                        classes = 'glassmorphic-timetable-current-slot';
                    else
                        classes = 'glassmorphic-timetable-future-slot';
                }

                if (entry) {
                    const grad = getGradientClass(entry.courseName);
                    row += `<td><div class="glassmorphic-timetable-slot ${classes} ${grad}" tabindex="0">
                    <div class="glassmorphic-timetable-title">${`${entry.courseName.substring(0, 28)}${entry.courseName.length > 28 ? '...' : ''}`}</div>
                    <div class="glassmorphic-timetable-meta" style="font-size: 0.8rem;">
                    ${entry.roomNo == MAKEUP_CLASS ? `<span style="color: crimson; font-weight: 650;">${entry.instructorName}</span>` : entry.roomNo}
                    </div>
                    <div class="glassmorphic-timetable-tooltip">
                    <strong>${entry.courseName}</strong><br>
                    ${entry.instructorName}<br>
                    ${entry.startTime} - ${entry.endTime}<br>
                    <em><i>${entry.sectionDetails}</i></em><br>
                    ${entry.roomNo}
                    </div>
                    </div></td>`;
                } else {
                    row += `<td><div class="glassmorphic-timetable-slot ${classes}" aria-hidden="true"></div></td>`;
                }
            });

            row += '</tr>';
            timetable.innerHTML += row;
        });
    }
});
