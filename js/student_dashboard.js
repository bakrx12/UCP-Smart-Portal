chrome.storage.local.get("toggle_power", (result) => {
  const enabled = result["toggle_power"];

  if (enabled) {
    function timeLeft(dateString) {
      // Convert "YYYY-MM-DD HH:mm" → valid Date
      const target = new Date(dateString.replace(" ", "T"));
      const now = new Date();

      let diffMs = target - now;

      if (diffMs <= 0) {
        return "Deadline reached";
      }

      const seconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      const months = Math.floor(days / 30); // approximate month

      if (months > 0) return `${months} month${months > 1 ? "s" : ""} left`;
      if (days > 0) return `${days} day${days > 1 ? "s" : ""} left`;
      if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} left`;
      if (minutes > 0) return `${minutes} min${minutes > 1 ? "s" : ""} left`;

      return `${seconds} sec${seconds > 1 ? "s" : ""} left`;
    }

    const submissionDetailsCache = new Map();
    // key: courseCode → value: [{ name, attachmentLink }]

    // Tooltip DOM (lazy created)
    let tooltipEl = null;
    function ensureTooltip() {
      if (tooltipEl) return tooltipEl;
      tooltipEl = document.createElement("div");
      tooltipEl.className = "gmc-tooltip";
      tooltipEl.style.display = "none";
      tooltipEl.setAttribute("role", "dialog");
      document.body.appendChild(tooltipEl);

      // hide on outside click (optional)
      document.addEventListener("click", (e) => {
        if (!tooltipEl) return;
        if (
          !tooltipEl.contains(e.target) &&
          !e.target.classList.contains("gmc-badge")
        ) {
          hideTooltip();
        }
      });

      return tooltipEl;
    }

    function showTooltipAt(element, html) {
      const tt = ensureTooltip();
      tt.innerHTML = html;
      tt.style.display = "block";

      const rect = element.getBoundingClientRect();
      const top = rect.bottom + window.scrollY + 8;
      let left = rect.left + window.scrollX;

      // clamp horizontally to viewport
      const maxLeft =
        document.documentElement.clientWidth - tt.offsetWidth - 12;
      if (left > maxLeft) left = Math.max(12, maxLeft);

      tt.style.top = `${top}px`;
      tt.style.left = `${left}px`;
    }

    function hideTooltip() {
      if (!tooltipEl) return;
      tooltipEl.style.display = "none";
    }

    /* ------------------ Existing functions (unchanged) ------------------ */

    async function fetchSubmissionCount(courseCode) {
      const url = `https://horizon.ucp.edu.pk/student/course/submission/${courseCode}`;

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, "text/html");

        const tbody = doc.querySelector("table tbody");
        if (!tbody) return 0;

        const rows = Array.from(tbody.querySelectorAll("tr"));

        // Case: "No Submission uploaded"
        const hasNoSubmissionRow = rows.some((row) =>
          row.textContent
            .toLowerCase()
            .trim()
            .includes("no submission uploaded"),
        );

        if (hasNoSubmissionRow) {
          return 0;
        }

        // Count valid submission rows
        let count = 0;

        rows.forEach((row) => {
          const actionCell = row.querySelector("td:last-child");
          if (!actionCell) return;

          // Skip if already submitted
          if (
            actionCell.textContent
              .toLowerCase()
              .includes("submitted successfully")
          ) {
            return;
          }

          count++;
        });

        return count;
      } catch (error) {
        //console.error('Error fetching submission count:', error);
        return 0;
      }
    }

    /* ------------------ NEW: Fetch submission details for tooltip ------------------ */
    async function fetchSubmissionDetails(courseCode) {
      const url = `https://horizon.ucp.edu.pk/student/course/submission/${courseCode}`;
      try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, "text/html");

        const tbody = doc.querySelector("table tbody");
        if (!tbody) return [];

        const rows = Array.from(tbody.querySelectorAll("tr"));

        // If page contains some "No Submission uploaded" row, return empty
        const hasNoSubmissionRow = rows.some((row) =>
          row.textContent
            .toLowerCase()
            .trim()
            .includes("no submission uploaded"),
        );
        if (hasNoSubmissionRow) return [];

        const result = [];

        rows.forEach((row) => {
          // Try to extract a meaningful submission name:
          //  - first cell text (td:nth-child(1)) or any bold/text-like within the row
          const firstCell = row.querySelector("td.rec_submission_title");
          const dueDateCell = row.querySelector("td.rec_submission_due_date");

          let name = firstCell ? firstCell.textContent.trim() : "Untitled";
          let dueDate = dueDateCell
            ? timeLeft(dueDateCell.textContent.trim())
            : "0/0/0 00:00";

          // Find an attachment link in this row:
          // - prefer anchors with 'download' in text or href, otherwise first anchor with href
          let attachmentLink = null;
          const anchors = Array.from(row.querySelectorAll("a[href]"));
          if (anchors.length > 0) {
            // try to find anchor that looks like a download or attachment
            const downloadAnchor = anchors.find((a) => {
              const txt = (a.textContent || "").toLowerCase();
              const href = a.getAttribute("href") || "";
              return (
                txt.includes("download") ||
                txt.includes("attachment") ||
                href.includes("download") ||
                href.includes("attachment") ||
                href.match(/\/download|\/attachments|\/file|\/upload/i)
              );
            });
            const chosen = downloadAnchor || anchors[0];
            // Convert relative href to absolute if necessary
            let href = chosen.getAttribute("href");
            if (href && href.startsWith("/")) {
              // same host
              href = `${location.protocol}//${location.host}${href}`;
            } else if (href && !href.match(/^https?:\/\//i)) {
              // handle other relative forms
              const base = `https://horizon.ucp.edu.pk`;
              href = new URL(href, base).toString();
            }
            attachmentLink = href;
          }

          // Also skip rows that are "Submitted successfully" if you prefer
          const actionCell = row.querySelector("td:last-child");
          if (
            actionCell &&
            actionCell.textContent
              .toLowerCase()
              .includes("submitted successfully")
          ) {
            // Could still include (maybe attachments exist), but skip count-only rows if desired
            // For tooltip, include them but mark as submitted
            // continue;
          }

          result.push({
            name: name || "Submission",
            dueDate: dueDate || "NO DATE",
            attachmentLink: attachmentLink || null,
          });
        });

        return result;
      } catch (e) {
        //console.error('fetchSubmissionDetails error', e);
        return [];
      }
    }

    async function resolveSubmissionsLeft(courses) {
      courses.forEach(async (course, index) => {
        const courseUrlCode = course.courseLink.split("/")[4];

        const count = await fetchSubmissionCount(courseUrlCode);
        const details =
          count > 0 ? await fetchSubmissionDetails(courseUrlCode) : [];

        submissionDetailsCache.set(courseUrlCode, details);

        const card = document.querySelector(
          `.gmc-card[data-course-index="${index}"]`,
        );
        if (!card) return;

        const badge = card.querySelector(".gmc-badge");
        badge.classList.remove("loading");
        badge.innerHTML = `
      <div class="count">${count}</div>
      <div class="label">Left</div>
    `;

        badge.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          location.href = `/student/course/submission/${courseUrlCode}`;
        });

        if (count === 0) badge.style.display = "none";

        attachBadgeHoverHandlers(); // safe reattach
      });
    }

    function extractClassesToday() {
      const classesToday = [];
      const classesContainer = document.querySelectorAll(
        ".uk-width-large-3-10 > div.user_heading_content div",
      );

      for (const c of classesContainer) {
        const courseName = c.children[0].textContent.trim();
        const matches = c.children[1].textContent
          .trim()
          .match(/\b\d{2}:\d{2}\b/g);

        let startTime = null;
        let endTime = null;

        if (matches && matches.length >= 2) {
          startTime = matches[0];
          endTime = matches[1];
        }

        classesToday.push({
          courseName,
          startTime,
          endTime,
        });
      }

      return classesToday;
    }

    function extractAcademicInfo() {
      const result = {
        cgpa: null,
        earnedCredits: null,
        totalCredits: null,
        inProgressCredits: null,
      };

      // Find all containers
      const containers = document.querySelectorAll(".user_heading_content");

      for (const container of containers) {
        const text = container.textContent;

        // --- Extract CGPA ---
        if (text.includes("CGPA:")) {
          const span = container.querySelector("span");
          if (span) {
            result.cgpa = parseFloat(span.textContent.trim());
          }
        }

        // --- Extract Earned / Total / Inprogress Credits ---
        if (text.includes("Earned Cr")) {
          const earned = container.querySelector("div:nth-child(1)");
          const total = container.querySelector("div:nth-child(2)");
          const inprogress = container.querySelector("div:nth-child(3)");

          if (earned)
            result.earnedCredits = parseFloat(
              earned.textContent.replace("Earned Cr :", "").trim(),
            );
          if (total)
            result.totalCredits = parseFloat(
              total.textContent.replace("Total Cr :", "").trim(),
            );
          if (inprogress)
            result.inProgressCredits = parseFloat(
              inprogress.textContent.replace("Inprogress Cr :", "").trim(),
            );
        }
      }

      return result;
    }

    function extractAttendanceInfo() {
      const subjects = [];

      // Find all subjects
      const containers = document.querySelectorAll("div a .card-header > span");
      const percentages = document.querySelectorAll(
        "div a .card-body > .uk-text-small",
      );

      for (let i = 0; i < containers.length; i++) {
        const name = containers[i].textContent;
        const percentage = percentages[i].children[0].textContent;

        subjects.push({
          name,
          percentage,
        });
      }

      return subjects.sort((a, b) => a.percentage - b.percentage);
    }

    function extractCoursesInfo() {
      const courses = [];

      const containers = document.querySelectorAll("div a > .card");

      for (const container of containers) {
        const courseName = container.children[0].textContent;
        const courseInstructor = container.children[1].children[0].textContent;
        const courseCode =
          container.children[1].children[1].children[0].textContent;
        const courseCredits =
          container.children[1].children[1].children[2].textContent;
        const courseStatus =
          container.children[1].children[1].children[3].textContent;
        const courseLink = container.parentElement.getAttribute("href");

        courses.push({
          courseName,
          courseInstructor,
          courseCode,
          courseCredits,
          courseStatus,
          courseLink,
          submissionsLeft: null, // null = loading
        });
      }

      return courses;
    }

    // Function to classify percentage levels
    function getAttendanceClass(percentage) {
      if (isNaN(percentage)) return "attendance-fill-critical";
      if (percentage >= 85) return "attendance-fill-safe";
      if (percentage >= 75) return "attendance-fill-low";
      return "attendance-fill-critical";
    }

    // Inject Google Font
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Afacad+Flux:wght@100..1000&family=UnifrakturMaguntia&display=swap";
    document.head.appendChild(link);

    // Inject Material Icons
    const icons = document.createElement("link");
    icons.rel = "stylesheet";
    icons.href = "https://fonts.googleapis.com/icon?family=Material+Icons";
    document.head.appendChild(icons);

    /* === SMALL EMPTY-STATE / UI HELPERS & STYLES === */

    function emptyStateHTML(icon, title, subtitle = "") {
      return `
    <div class="empty-state">
      <span class="material-icons empty-icon">${icon}</span>
      <div class="empty-title">${title}</div>
      ${subtitle ? `<div class="empty-sub">${subtitle}</div>` : ""}
    </div>
  `;
    }

    /* === Extract data from the page === */

    // Extract name, registration, dept, profile Image
    const userElement = document.querySelector(".user_heading_content h2");
    const spans = userElement ? userElement.querySelectorAll("span") : [];
    const studentName = spans[0] ? spans[0].textContent.trim() : "Student";
    const registration = spans[1] ? spans[1].textContent.trim() : "----";
    const department = spans[2] ? spans[2].textContent.trim() : "Department";
    const profile = document.querySelector(
      ".user_heading_avatar .thumbnail img",
    );
    const profileImageSource = profile ? profile.getAttribute("src") : "";
    const academicInfo = extractAcademicInfo();
    const attendanceInfo = extractAttendanceInfo();
    const coursesInfo = extractCoursesInfo();

    // Prepare rendered HTML snippets for Academics / Attendance / Courses
    function renderAcademicStats(info) {
      const allEmpty =
        ((x) => x === null || x === undefined || isNaN(x))(info.cgpa) &&
        ((x) => x === null || x === undefined || isNaN(x))(
          info.earnedCredits,
        ) &&
        ((x) => x === null || x === undefined || isNaN(x))(info.totalCredits) &&
        ((x) => x === null || x === undefined || isNaN(x))(
          info.inProgressCredits,
        );

      if (allEmpty) {
        return `<div id="stats-empty">${emptyStateHTML("school", "No academic data available", "Your academic summary could not be loaded.")}</div>`;
      }

      const safeValue = (v) =>
        v === null || v === undefined || isNaN(v) ? "--" : v;
      return `
    <div id="stats">
      <div class="entry cgpa">
        <div class="value">${safeValue(info.cgpa)}</div>
        <div class="ph">CGPA</div>
      </div>
      <div class="entry credits">
        <div class="value">${safeValue(info.earnedCredits)}</div>
        <div class="ph">Earned Cr</div>
      </div>
      <div class="entry total-credits">
        <div class="value">${safeValue(info.totalCredits)}</div>
        <div class="ph">Total Cr</div>
      </div>
      <div class="entry inprogress-credits">
        <div class="value">${safeValue(info.inProgressCredits)}</div>
        <div class="ph">Inprogress Cr</div>
      </div>
    </div>
  `;
    }

    function renderAttendance(infoArray) {
      if (!Array.isArray(infoArray) || infoArray.length === 0) {
        return `<div class="attendance-card-empty">${emptyStateHTML("people_outline", "No attendance records", "No attendance data is available for this semester.")}</div>`;
      }

      return infoArray
        .map((item) => {
          const percentage = parseFloat(item.percentage);
          const cssClass = getAttendanceClass(percentage);
          const pctDisplay = isNaN(percentage) ? "--" : `${percentage}%`;
          const widthStyle = isNaN(percentage)
            ? "width: 4%;"
            : `width: ${Math.max(3, Math.min(100, percentage))}%;`;
          return `
      <div class="attendance-bar-container">
        <div class="attendance-label"><span>${item.name}</span></div>
        <div class="attendance-bar">
          <div class="attendance-fill ${cssClass}" style="${widthStyle}">${pctDisplay}</div>
        </div>
      </div>`;
        })
        .join("");
    }

    function renderCourses(coursesArray) {
      if (!Array.isArray(coursesArray) || coursesArray.length === 0) {
        return `<div class="courses-card-empty">
      ${emptyStateHTML("menu_book", "No courses found", "You are not enrolled in any courses.")}
    </div>`;
      }

      return coursesArray
        .map((item, index) => {
          const courseCodeForData = (item.courseLink || "").split("/")[4] || "";
          const badgeHTML =
            item.submissionsLeft === null
              ? `
      <span class="gmc-badge loading">
        <div class="count">…</div>
        <div class="label">Left</div>
      </span>
    `
              : `
      <span class="gmc-badge">
        <div class="count">${item.submissionsLeft}</div>
        <div class="label">Submissions Left</div>
      </span>
    `;

          return `
      <a href="${item.courseLink}" 
         class="gmc-card" 
         data-course-index="${index}"
         data-course-code="${courseCodeForData}">
         
        ${badgeHTML}

        <div class="gmc-title">${item.courseName}</div>
        <div class="gmc-instructor">${item.courseInstructor}</div>
        <div class="gmc-details">
          ${item.courseCode} | Credits: ${item.courseCredits}
        </div>
        <!-- <span class="gmc-status">${item.courseStatus}</span> -->
        <span class="gmc-status" data-course-link="${courseCodeForData}">
          Open Gradebook
        </span>
      </a>
    `;
        })
        .join("");
    }

    /* === Insert Student Card + modules (uses the prepared render functions) === */

    const cardParent = document.querySelector(".md-card .md-card-content");
    cardParent.insertAdjacentHTML(
      "beforeBegin",
      `

<h3 id="my-academics" class="heading_a">Academics</h3>

<div id="academics-module">

<div id="academic-flexbox">

    <!-- Student Card -->
    <div id="card">
    <div class="card-inner">
      <div class="card-front">
        
          <div class="card" role="img" aria-label="University of Central Punjab student ID card mockup">
          <div class="banner">
          <div class="title">University of Central Punjab</div>
          <div class="subtitle">${department}</div>
          </div>
          <!-- Left circular university seal -->
          <img class="seal" src="${chrome.runtime.getURL("assets/ucp_logo.png")}" alt="UCP seal" />
          <!-- Student profile photo -->
          <div class="photo-frame">
          <img src="${profileImageSource}" alt="Student profile" />
          </div>
          <!-- Name and roll number placed to mirror the reference image -->
          <div class="name">${studentName.toUpperCase().substring(0, 23)}</div>
          <div class="roll">${registration.toUpperCase()}</div>   
          <!-- Building base background -->
          <img class="building" src="${chrome.runtime.getURL("assets/ucp_building.png")}" alt="UCP building" />
          </div>

      </div>
      <div class="card-back">
          <div class="card back-card">
            <div class="validity center">Validity: Oct 20${registration.substring(3, 5)} - Oct 20${parseInt(registration.substring(3, 5)) + 4}</div>
            <div class="instructions">Instructions</div>
            <ol>
              <li>Student must carry this card while in the University premises.</li>
              <li>Loss of the card must be reported immediately, so that a new card may be issued.</li>
              <li>This card is also valid for library and computer lab.</li>
              <li>This card must be returned when the student leaves university.</li>
            </ol>
            <div class="center university-title">University of Central Punjab</div>
            <div class="center address-line">1-Khayaban-e-Jinnah Road,</div>
            <div class="center address-line">Johar Town Lahore</div>
            <div class="center address-line">Phone: +92-42-85880007,</div>
            <div class="center address-line">www.ucp.edu.pk</div>
            <div class="center barcode">
              <img src="${chrome.runtime.getURL("assets/barcode.png")}" alt="barcode">
            </div>
            <div class="center barcode-text">${registration.toUpperCase()}</div>
          </div>
      </div>
    </div>
  </div>

    <!-- Academic standings (rendered) -->
    ${renderAcademicStats(academicInfo)}

</div>

<div class="attendance-card" id="attendance-chart">
    <h2 class="attendance-card-title">Attendance</h2>
    ${renderAttendance(attendanceInfo)}
</div>

  <!-- Today's Classes -->
<div id="classesCard" style="padding: 1rem;">
  <div class="classes-card">
    <h2 class="classes-card-title">Classes Today</h2>
    <div id="classes-card-content"></div>
  </div>
</div>

</div>
`,
    );

    // Insert Courses Cards into DOM (afterBegin so they're near top as before)
    cardParent.insertAdjacentHTML(
      "afterBegin",
      `

<h3 id="my-courses" class="heading_a">Courses</h3>

<div class="gmc-container">
  ${renderCourses(coursesInfo)}
</div>

`,
    );

    // Color the courses (if any)
    const gradients = [
      "linear-gradient(135deg, rgba(75, 75, 75, 0.2), rgba(75, 75, 75, 0.2))",
      "linear-gradient(135deg,  rgba(75, 75, 75, 0.2), rgba(75, 75, 75, 0.2))",
      "linear-gradient(135deg, rgba(75, 75, 75, 0.2), rgba(75, 75, 75, 0.2))",
      "linear-gradient(135deg,  rgba(75, 75, 75, 0.2), rgba(75, 75, 75, 0.2))",
      "linear-gradient(135deg,  rgba(75, 75, 75, 0.2), rgba(75, 75, 75, 0.2))",
      "linear-gradient(135deg,  rgba(75, 75, 75, 0.2), rgba(75, 75, 75, 0.2))",
      "linear-gradient(135deg,  rgba(75, 75, 75, 0.2), rgba(75, 75, 75, 0.2))",
      "linear-gradient(135deg,  rgba(75, 75, 75, 0.2), rgba(75, 75, 75, 0.2))",
    ];
    document.querySelectorAll(".gmc-card").forEach((card, index) => {
      const gradient = gradients[index % gradients.length];
      card.style.background = gradient;

      card.addEventListener("click", (e) => {
        const status = e.target.closest(".gmc-status");
        if (!status) return;

        e.preventDefault();
        e.stopPropagation();

        const courseLink = status.dataset.courseLink;
        location.href = `/student/course/gradebook/${courseLink}`;
      });
    });

    /* ------------------ NEW: Attach hover handlers to badges ------------------ */
    function attachBadgeHoverHandlers() {
      document.querySelectorAll(".gmc-card").forEach((card) => {
        const badge = card.querySelector(".gmc-badge");
        if (!badge || badge._bound) return;
        badge._bound = true;

        const code = card.dataset.courseCode;

        badge.addEventListener("mouseenter", () => {
          const submissions = submissionDetailsCache.get(code) || [];

          let html = `<div class="tt-header"><span>Active Submissions</span></div>`;

          if (submissions.length === 0) {
            html += `<div class="no-submissions">No active submissions</div>`;
          } else {
            submissions.forEach((s) => {
              const disabled = s.attachmentLink ? "" : "disabled";
              const urlAttr = s.attachmentLink
                ? `data-url="${s.attachmentLink}"`
                : "";
              html += `
            <div class="submission-row">
              <div class="submission-name" title="${escapeHtml(s.name)}">
                ${escapeHtml(s.name)}
              </div>
              <div class="submission-name">
                ${escapeHtml(s.dueDate)}
              </div>
              <button class="download-btn" ${disabled} ${urlAttr}>
                <i style="color: #fff !important; margin: 0;" class="material-icons">
                 download
                </i>
              </button>
            </div>
          `;
            });
          }

          showTooltipAt(badge, html);

          const tt = document.querySelector(".gmc-tooltip");
          tt.querySelectorAll(".download-btn[data-url]").forEach((btn) => {
            btn.onclick = () => {
              window.location.href = btn.dataset.url;
            };
          });
        });

        badge.addEventListener("mouseleave", () => {
          setTimeout(() => {
            if (!tooltipEl?.matches(":hover")) hideTooltip();
          }, 120);
        });
      });
    }

    // small helper to escape html in names
    function escapeHtml(str) {
      return String(str).replace(/[&<>"'`=\/]/g, function (s) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
          "/": "&#x2F;",
          "`": "&#x60;",
          "=": "&#x3D;",
        }[s];
      });
    }

    /* Today's Classes */
    const classesToday = extractClassesToday();

    // Group consecutive classes with the same courseName
    function groupClasses(classes) {
      if (classes.length === 0) return [];

      const grouped = [];
      let current = { ...classes[0] };

      for (let i = 1; i < classes.length; i++) {
        if (
          classes[i].courseName === current.courseName &&
          classes[i].startTime === incrementTime(current.endTime, 5)
        ) {
          current.endTime = classes[i].endTime;
        } else {
          grouped.push(current);
          current = { ...classes[i] };
        }
      }
      grouped.push(current);
      return grouped;
    }

    // Helper: add minutes to a HH:MM string
    function incrementTime(time, minutes) {
      if (!time) return null;
      const [h, m] = time.split(":").map(Number);
      const date = new Date();
      date.setHours(h, m + minutes, 0, 0);
      return date.toTimeString().slice(0, 5);
    }

    const content = document.getElementById("classes-card-content");

    if (!classesToday || classesToday.length === 0) {
      content.innerHTML = `
        <div class="classes-card-empty">
          <span class="material-icons">free_breakfast</span>
          <span style="color:rgb(28, 110, 110) !important;">No Classes Today</span>
        </div>`;
    } else {
      const groupedClasses = groupClasses(classesToday);

      let tableHTML = `
        <table class="classes-card-table">
          <thead>
            <tr>
              <th><span class="material-icons classes-card-icon">menu</span>Course</th>
              <th><span class="material-icons classes-card-icon">schedule</span>Start</th>
              <th><span class="material-icons classes-card-icon">timer</span>End</th>
            </tr>
          </thead>
          <tbody>
      `;

      groupedClasses.forEach((cls) => {
        tableHTML += `
          <tr>
            <td data-label="Course"><span class="material-icons classes-card-icon">book</span>${cls.courseName}</td>
            <td data-label="Start">${cls.startTime}</td>
            <td data-label="End">${cls.endTime}</td>
          </tr>
        `;
      });

      tableHTML += `</tbody></table>`;
      content.innerHTML = tableHTML;
    }

    document
      .querySelector("#attendance-chart")
      .addEventListener("click", () => {
        window.location.href = "https://horizon.ucp.edu.pk/student/attendance";
      });

    // attach hover handlers now that course cards are in DOM
    attachBadgeHoverHandlers();

    // Also call resolveSubmissionsLeft which will re-attach handlers after it updates badges
    resolveSubmissionsLeft(coursesInfo);
  }
});
