chrome.storage.local.get("toggle_power", (result) => {
  const enabled = result["toggle_power"];

  if (enabled) {
    // Task 3 — cover the page the instant the script runs so the ORIGINAL
    // portal dashboard never flashes before the extension's own dashboard is
    // injected. An opaque-enough dark-glass sheet masks the old UI while we
    // build the replacement; dismissDashboardLoader() fades it out once the
    // replacement is in the DOM (the dashboard then shows its own live
    // "loading" states — badges, "Loading…" — as the data fills in).
    function showDashboardLoader() {
      if (document.getElementById("ucp-dash-loader")) return;
      const el = document.createElement("div");
      el.id = "ucp-dash-loader";
      el.className = "ucp-dash-loader";
      el.setAttribute("role", "status");
      // The spinning circle (ucp-dash-loader-spinner) was barely visible and is
      // not needed — only the dark sheet + text is shown while the dashboard
      // builds, so the original portal UI never flashes through.
      el.innerHTML =
        '<div class="ucp-dash-loader-title">Loading dashboard…</div>' +
        '<div class="ucp-dash-loader-sub">Preparing your academic overview</div>';
      document.body.appendChild(el);
    }
    function dismissDashboardLoader() {
      const el = document.getElementById("ucp-dash-loader");
      if (!el) return;
      el.classList.add("ucp-dash-loader-hide");
      setTimeout(() => el.remove(), 550);
    }
    showDashboardLoader();

    const renderDashboard = () => {
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
    const submissionPageCache = new Map();
    let assessmentItemsCache = [];
    // Make-Up Class card state: the most-upcoming make-up/rescheduled class from
    // the timetable ({courseName, sectionDetails, roomNo, startTime, date}), or
    // null when none exist. makeUpLoaded gates "Checking…" vs "No make-up classes".
    let makeUpClass = null;
    let makeUpLoaded = false;
    // "Checking…" gates for the Submissions Left / Next Assessment mini-cards
    // (the Make-Up card gates on makeUpLoaded). Start true so first paint shows
    // the checking state; refreshCourseSection re-sets them to replay that
    // state on screen while the manual re-check runs.
    let courseSubmissionsChecking = true;
    let courseAssessmentsChecking = true;
    // 1B: which course-overview mini-card's hover popup is currently open
    // ("sub" | "asmt" | null). Lets a course-card badge's delayed hide-tooltip
    // timer bail out so it never steals a mini-card popup that just opened.
    let activeOverviewPopup = null;
    // key: courseCode → value: [{ name, attachmentLink }]

    async function fetchSubmissionPage(courseCode) {
      if (submissionPageCache.has(courseCode)) {
        return submissionPageCache.get(courseCode);
      }

      const request = fetch(
        `https://horizon.ucp.edu.pk/student/course/submission/${courseCode}`,
        { credentials: "include" },
      )
        .then((response) => (response.ok ? response.text() : ""))
        .catch(() => "");
      submissionPageCache.set(courseCode, request);
      return request;
    }

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
        const htmlText = await fetchSubmissionPage(courseCode);
        if (!htmlText) return 0;
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
        const htmlText = await fetchSubmissionPage(courseCode);
        if (!htmlText) return [];
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

    function parseDateFromText(text) {
      const namedDate = text.match(
        /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+20\d{2}\b/i,
      );
      const numericDate = text.match(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/);
      const dateText = namedDate?.[0] || numericDate?.[0];
      if (!dateText) return null;
      const parsed = new Date(dateText.replace(/(st|nd|rd|th)/i, ""));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function extractAssessmentItems(html, course) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const now = new Date();
      const items = [];
      const seen = new Set();
      doc.querySelectorAll("tr, li, .md-card, .uk-card").forEach((element) => {
        const text = element.textContent.replace(/\s+/g, " ").trim();
        if (!/(quiz|assignment|midterm|mid[- ]?term|final)/i.test(text)) return;
        const date = parseDateFromText(text);
        if (!date || date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()) return;
        const key = `${course.courseName}|${text}`;
        if (seen.has(key)) return;
        seen.add(key);
        items.push({
          courseName: course.courseName,
          title: text.slice(0, 120),
          date,
        });
      });
      return items;
    }

    // ---- Quiet course-page fetch -------------------------------------------
    // The request runs in the SERVICE WORKER (GET_PORTAL_PAGE): a 404/503-ing
    // page — courses without an announcement page, the flaky gradebook — comes
    // back as plain data instead of a "Failed to load resource" line in the
    // page console on every dashboard load. Plus a short negative cache so a
    // recently-failed page isn't re-fetched at all (404s last a long time —
    // a missing page is missing; 5xx are transient — short TTL).
    const failedCourseFetches = new Map(); // url -> { status, ts }
    const fetchFailTtlMs = (status) =>
      (status === 404 || status === 410) ? 30 * 60 * 1000
        : (status >= 500 ? 5 * 60 * 1000 : 10 * 60 * 1000);
    const fetchFailCacheHit = (url) => {
      const f = failedCourseFetches.get(url);
      if (!f) return false;
      if (Date.now() - f.ts < fetchFailTtlMs(f.status)) return true;
      failedCourseFetches.delete(url);
      return false;
    };
    const rememberFetchFail = (url, status) => {
      failedCourseFetches.set(url, { status, ts: Date.now() });
    };
    async function fetchPortalPageQuiet(url) {
      try {
        if (chrome.runtime && chrome.runtime.id) {
          const resp = await new Promise((resolve) => {
            try {
              chrome.runtime.sendMessage({ type: "GET_PORTAL_PAGE", url }, (r) => {
                resolve(chrome.runtime.lastError ? null : r);
              });
            } catch (e) { resolve(null); }
          });
          // status > 0 = the SW actually fetched it (ok or an HTTP error);
          // status 0 = network failure / refused answer → use the fallback.
          if (resp && typeof resp.ok === "boolean" && resp.status > 0) {
            if (!resp.ok) rememberFetchFail(url, resp.status);
            return resp.ok ? resp.text : "";
          }
        }
      } catch (e) { /* stale extension context — fall through */ }
      // Fallback (extension just reloaded): direct page-context fetch.
      try {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) { rememberFetchFail(url, response.status); return ""; }
        return response.text();
      } catch (error) {
        return "";
      }
    }

    async function fetchCoursePage(courseId, page) {
      const url = `${location.origin}/student/course/${page}/${encodeURIComponent(courseId)}`;
      if (fetchFailCacheHit(url)) return "";
      return fetchPortalPageQuiet(url);
    }

    async function loadCourseOverviewData() {
      const assessmentPages = ["info", "outline", "assessment", "announcement"];
      const results = await Promise.all(
        coursesInfo.map(async (course) => {
          const courseId = (course.courseLink || "").split("/").filter(Boolean).pop();
          if (!courseId) return { assessments: [] };
          const pages = await Promise.all(
            assessmentPages.map((page) => fetchCoursePage(courseId, page)),
          );
          const assessments = pages.flatMap((html) =>
            html ? extractAssessmentItems(html, course) : [],
          );
          return { assessments };
        }),
      );
      assessmentItemsCache = results.flatMap((result) => result.assessments);
      courseAssessmentsChecking = false;
      updateCourseOverview(coursesInfo, coursesInfo, getSemesterWeek(currentSemester));
    }

    async function resolveSubmissionsLeft(courses) {
      // Await ALL per-course checks: the initial-load call (scheduleIdleWork)
      // ignores the returned promise as before, but refreshCourseSection needs
      // it to know when the re-check has truly settled (the old
      // forEach(async …) returned before any single check had finished).
      await Promise.all(
        courses.map(async (course, index) => {
          const courseUrlCode = course.courseLink.split("/")[4];

          const count = await fetchSubmissionCount(courseUrlCode);
          const details =
            count > 0 ? await fetchSubmissionDetails(courseUrlCode) : [];

          submissionDetailsCache.set(courseUrlCode, details);

          updateCourseOverview(courses, coursesInfo);

          const card = document.querySelector(
            `.gmc-card[data-course-index="${index}"]`,
          );
          if (!card) return;

          const badge = card.querySelector(".gmc-badge");
          badge.classList.remove("checking");
          badge.innerHTML = `
        <span class="count">${count}</span>
        <span class="label">left</span>
      `;

          badge.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            location.href = `/student/course/submission/${courseUrlCode}`;
          });

          if (count === 0) {
            // No active submissions: fade the badge out (opacity transition in
            // .gmc-badge.is-empty) before hiding it. Mark it empty so the hover
            // handler won't raise a tooltip for a badge that's fading away.
            badge.dataset.empty = "1";
            if (badge.style.display !== "none") {
              badge.classList.add("is-empty");
              let done = false;
              const finish = () => {
                if (done) return;
                done = true;
                badge.style.display = "none";
                badge.removeEventListener("transitionend", onEnd);
              };
              const onEnd = (ev) => {
                if (ev && ev.propertyName === "opacity") finish();
              };
              badge.addEventListener("transitionend", onEnd);
              setTimeout(finish, 500); // fallback if transitionend never fires
            }
          } else {
            delete badge.dataset.empty;
            badge.classList.remove("is-empty");
            badge.style.display = "";
          }

          attachBadgeHoverHandlers(); // safe reattach
        }),
      );
      // Every badge is settled now — the Submissions Left mini-card can leave
      // its "Checking…" state (renderCourseOverview reads the flag), and this
      // final render replaces the last per-course rebuild, which ran while the
      // flag was still true during a refresh.
      courseSubmissionsChecking = false;
      // This is the moment the course data last settled (initial load AND
      // manual refresh both funnel through here) — stamp it for the
      // refresh button's "Updated … ago" hover line.
      saveRefreshTs();
      updateCourseOverview(courses, coursesInfo);
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

    function extractAttendanceInfo(courses) {
      const subjects = [];

      // Find all subjects
      const containers = document.querySelectorAll("div a .card-header > span");
      const percentages = document.querySelectorAll(
        "div a .card-body > .uk-text-small",
      );

      for (let i = 0; i < containers.length; i++) {
        const name = containers[i].textContent.trim();
        const percentage = percentages[i].children[0].textContent;
        const normalizedName = name.replace(/\s+/g, " ").toLowerCase();
        const matchingCourse = courses.find((course) => {
          const courseName = course.courseName
            .replace(/\s+/g, " ")
            .toLowerCase();
          return (
            courseName === normalizedName ||
            courseName.includes(normalizedName) ||
            normalizedName.includes(courseName)
          );
        });

        subjects.push({
          name,
          percentage,
          creditHours: matchingCourse?.courseCredits || "--",
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

    function extractFullCourseCode(doc) {
      const courseCodeElement = doc.querySelector("#courseCode");
      const courseCodeText = courseCodeElement?.textContent.trim() || "";
      const courseCodeMatch = courseCodeText.match(
        /[A-Z0-9]+(?:-[A-Z0-9]+){2,}/i,
      );
      if (courseCodeMatch) {
        return courseCodeMatch[0];
      }

      const activeCourseTab = doc.querySelector(
        ".uk-tab li.uk-active a",
      );
      const match = activeCourseTab?.textContent.match(/\(([^)]+)\)/);
      return match ? match[1].trim() : "";
    }

    function extractEnrollmentCourseCode(doc, courseLink, courseName) {
      const targetPath = new URL(courseLink, location.origin).pathname;
      const targetName = String(courseName || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const courseCards = doc.querySelectorAll(
        "#hierarchical_show2 .md-card",
      );

      for (const card of courseCards) {
        const anchor = card.querySelector("a[href]");
        if (!anchor) continue;

        const cardPath = new URL(anchor.href, location.origin).pathname;
        const cardName = card
          .querySelector(".md-list-heading")
          ?.textContent.replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        const matchesLink = cardPath === targetPath;
        const matchesName = targetName && cardName === targetName;
        if (!matchesLink && !matchesName) continue;

        const fullCourseCode = card
          .querySelector(".sub-heading")
          ?.textContent.trim();
        if (fullCourseCode) return fullCourseCode;
      }

      return "";
    }

    async function fetchFullCourseCode(courseLink, courseName) {
      if (!courseLink) return "";

      try {
        const courseUrl = new URL(courseLink, location.origin);
        const pathParts = courseUrl.pathname.split("/").filter(Boolean);
        const courseId = pathParts[pathParts.length - 1];
        const cachedCourseCode = await getCachedCourseCode(courseId);
        if (cachedCourseCode) return cachedCourseCode;

        const courseInfoUrl = new URL(
          `/student/course/info/${encodeURIComponent(courseId)}`,
          location.origin,
        ).href;
        const renderedCourseCode = await getRenderedCourseCode(courseInfoUrl);
        if (renderedCourseCode) {
          rememberCourseCode(courseId, renderedCourseCode);
          return renderedCourseCode;
        }

        const urls = [
          courseInfoUrl,
          `${location.origin}/student/enrolled/courses`,
          courseUrl.href,
          `${location.origin}/student/course/material/${encodeURIComponent(courseId)}`,
          `${location.origin}/student/course/submission/${encodeURIComponent(courseId)}`,
        ];

        for (const url of urls) {
          const response = await fetch(url, { credentials: "include" });
          if (!response.ok) continue;

          const html = await response.text();
          const doc = new DOMParser().parseFromString(html, "text/html");
          const fullCourseCode =
            extractFullCourseCode(doc) ||
            (url.endsWith("/student/enrolled/courses")
              ? extractEnrollmentCourseCode(doc, courseLink, courseName)
              : "");
          if (fullCourseCode) {
            rememberCourseCode(courseId, fullCourseCode);
            return fullCourseCode;
          }
        }
      } catch (error) {
        return "";
      }

      return "";
    }

    function getCourseSection(courseCode) {
      const normalizedCode = String(courseCode || "").trim();
      return normalizedCode.length >= 2 ? normalizedCode.slice(-2) : "N/A";
    }

    function getCachedCourseCode(courseId) {
      return new Promise((resolve) => {
        chrome.storage.local.get("ucp_course_codes", (result) => {
          resolve(result.ucp_course_codes?.[courseId] || "");
        });
      });
    }

    // Persist a freshly resolved full course code so the NEXT dashboard load
    // resolves each Section instantly from the cache (no per-course info fetch).
    // Extension-owned storage key only — never touches the portal's own cache.
    function rememberCourseCode(courseId, code) {
      if (!courseId || !code) return;
      try {
        chrome.storage.local.get("ucp_course_codes", (r) => {
          const map = (r && r.ucp_course_codes) || {};
          map[courseId] = code;
          chrome.storage.local.set({ ucp_course_codes: map });
        });
      } catch (e) {}
    }

    function getRenderedCourseCode(url) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "GET_RENDERED_COURSE_CODE", url },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve("");
              return;
            }
            resolve(response?.courseCode || "");
          },
        );
      });
    }

    function getCourseType(credits) {
      return parseFloat(String(credits).replace(/[^\d.]/g, "")) === 1
        ? "Lab"
        : "Lecture";
    }

    function formatInstructorName(name) {
      const normalizedName = String(name || "").replace(/\s+/g, " ").trim();
      if (!normalizedName) return "Not available";

      const muhammadIndex = normalizedName.search(/\bmuhammad\b/i);
      if (muhammadIndex === -1) return normalizedName;

      const nameAfterMuhammad = normalizedName
        .slice(muhammadIndex)
        .replace(/^muhammad\b\s*/i, "")
        .trim();
      return nameAfterMuhammad || "Not available";
    }

    /* ------------------ Term week (Fall / Spring) ------------------
       Fall term starts the last Monday of September; Spring term starts the
       last Monday of February. We count weeks forward from that start and show
       "ongoing week / total weeks". The card shows N/A when the timetable has
       no classes (see renderAcademicStats). */
    const TERM_TOTAL_WEEKS = 16; // default semester length in weeks
    function lastMondayOf(year, monthIndex) {
      // monthIndex is 0-based (1 = February, 8 = September). Returns the last
      // Monday of that month/year.
      const d = new Date(year, monthIndex + 1, 0); // day 0 of next month = last of this month
      while (d.getDay() !== 1) d.setDate(d.getDate() - 1); // 1 = Monday
      return d;
    }
    function getTermWeek(now = new Date()) {
      const y = now.getFullYear();
      // Candidate term starts around "now" (covers the Jan→Feb / Dec→Jan edges).
      const starts = [
        { start: lastMondayOf(y - 1, 8), label: "Fall" }, // last Mon, prev Sept
        { start: lastMondayOf(y, 1), label: "Spring" }, // last Mon, Feb
        { start: lastMondayOf(y, 8), label: "Fall" }, // last Mon, Sept
        { start: lastMondayOf(y + 1, 1), label: "Spring" }, // last Mon, next Feb
      ];
      // The most recent start that is on/before "now" is the active term.
      let active = null;
      for (const s of starts) {
        if (s.start <= now && (active === null || s.start > active.start))
          active = s;
      }
      if (!active) return null;
      const weekMs = 7 * 24 * 3600 * 1000;
      const ongoing = Math.floor((now - active.start) / weekMs) + 1;
      if (ongoing > TERM_TOTAL_WEEKS) return null; // term has already ended
      return { ongoing, total: TERM_TOTAL_WEEKS, label: active.label };
    }

    async function fetchCurrentSemester() {
      try {
        const response = await fetch("/student/profile", {
          credentials: "include",
        });
        if (!response.ok) return "Unknown semester";

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const semesterPattern = /\b(?:fall|spring)\s+20\d{2}\b/i;
        const semesterElements = doc.querySelectorAll(
          '[id*="semester" i], [class*="semester" i], [id*="term" i], [class*="term" i], .sub-heading',
        );
        for (const element of semesterElements) {
          const value = element.textContent.replace(/\s+/g, " ").trim();
          const valueMatch = value.match(semesterPattern);
          if (valueMatch) return valueMatch[0];
        }

        const text = doc.body?.textContent.replace(/\s+/g, " ") || "";
        const match = text.match(
          /(?:current\s+)?(?:semester|term|session)\s*[:\-]\s*((?:fall|spring)\s+\d{4}|\d{4}\s+(?:fall|spring))/i,
        );
        const standaloneMatch = text.match(semesterPattern);
        return (
          match?.[1]?.trim() || standaloneMatch?.[0] || "Unknown semester"
        );
      } catch (error) {
        return "Unknown semester";
      }
    }

    /* ===== 1A: Predicted CGPA ===========================================
       For a student whose CGPA is N/A (no grades posted) and who has earned no
       credits yet (i.e. 1st semester), project a CGPA from each course's
       CURRENT gradebook standing. Each course's predicted final % = its
       obtained marks / possible marks (summed across assessments — the raw
       #tabs_anim1 table the gradebook page parses in js/course/course_gradebook.js).
       The %→letter uses the portal's own grading thresholds; the letter→point
       is a 4.0 scale; the result is credit-weighted across courses. If no
       course yields usable marks, it stays N/A (per the request). */
    function pctToGradePoint(pct) {
      const letter =
        pct >= 90 ? "A+" : pct >= 85 ? "A" : pct >= 80 ? "A-" : pct >= 75 ? "B+"
        : pct >= 70 ? "B" : pct >= 65 ? "B-" : pct >= 60 ? "C+" : pct >= 55 ? "C"
        : pct >= 50 ? "C-" : pct >= 45 ? "D+" : pct >= 40 ? "D" : pct >= 35 ? "D-"
        : "F";
      const point =
        letter === "A+" || letter === "A" ? 4.0 : letter === "A-" ? 3.7
        : letter === "B+" ? 3.3 : letter === "B" ? 3.0 : letter === "B-" ? 2.7
        : letter === "C+" ? 2.3 : letter === "C" ? 2.0 : letter === "C-" ? 1.7
        : letter === "D+" ? 1.3 : letter === "D" ? 1.0 : letter === "D-" ? 0.7
        : 0.0;
      return { point, letter };
    }

    // Parse a FETCHED (raw) gradebook page and return the course's overall
    // obtained % (Σ obtained / Σ max marks). Defensive: returns hasData=false
    // when the table or its marks aren't present so callers can skip the course.
    function extractCourseObtainedPct(doc) {
      try {
        const table =
          doc.querySelector("#tabs_anim1 table.table_tree") ||
          doc.querySelector("#tabs_anim1 table") ||
          doc.querySelector("table.table_tree");
        if (!table) return { pct: null, hasData: false };
        const rows = Array.from(table.querySelectorAll("tbody > tr"));
        let sumMax = 0, sumObt = 0, any = false;
        rows.forEach((r) => {
          if (!r.classList.contains("table-child-row")) return;
          if (r.querySelectorAll("th").length) return;
          const tds = Array.from(r.querySelectorAll("td, th"));
          if (tds.length < 3) return;
          const max = parseFloat(String(tds[1].textContent || "").replace(/,/g, ""));
          const obt = parseFloat(String(tds[2].textContent || "").replace(/,/g, ""));
          if (isFinite(max) && max > 0) {
            sumMax += max;
            if (isFinite(obt)) { sumObt += obt; any = true; }
          }
        });
        if (!any || sumMax <= 0) return { pct: null, hasData: false };
        return { pct: (sumObt / sumMax) * 100, hasData: true };
      } catch (e) {
        return { pct: null, hasData: false };
      }
    }

    async function fetchGradebookHtml(courseId) {
      const url = `${location.origin}/student/course/gradebook/${encodeURIComponent(courseId)}`;
      if (fetchFailCacheHit(url)) return "";
      return fetchPortalPageQuiet(url);
    }

    async function computePredictedCgpa() {
      const results = [];
      await Promise.all(
        coursesInfo.map(async (course) => {
          const courseId = (course.courseLink || "").split("/").filter(Boolean).pop();
          if (!courseId) return;
          const html = await fetchGradebookHtml(courseId);
          if (!html) return;
          const { pct, hasData } = extractCourseObtainedPct(
            new DOMParser().parseFromString(html, "text/html"),
          );
          if (!hasData) return;
          const { point } = pctToGradePoint(pct);
          const credits = parseFloat(course.courseCredits);
          const weight = isFinite(credits) && credits > 0 ? credits : 1;
          results.push({ point, weight });
        }),
      );
      if (!results.length) return null;
      const totalW = results.reduce((s, r) => s + r.weight, 0);
      const weighted = results.reduce((s, r) => s + r.point * r.weight, 0);
      return totalW > 0 ? weighted / totalW : null;
    }

    async function applyPredictedCgpa() {
      const cgpaEl = document.querySelector("#stats .entry.cgpa");
      if (!cgpaEl) return;
      // Only when CGPA is N/A AND effectively no credits earned yet (1st sem).
      const noCgpa = academicInfo.cgpa == null || isNaN(academicInfo.cgpa);
      const noCredits =
        academicInfo.earnedCredits == null ||
        isNaN(academicInfo.earnedCredits) ||
        academicInfo.earnedCredits <= 0;
      if (!noCgpa || !noCredits) return;

      const valueEl = cgpaEl.querySelector(".value");
      if (valueEl) valueEl.textContent = "…"; // computing…
      const predicted = await computePredictedCgpa();
      if (predicted == null || isNaN(predicted)) {
        if (valueEl) valueEl.textContent = "N/A";
        return;
      }
      const shown = (Math.round(predicted * 100) / 100).toFixed(2);
      if (valueEl) {
        valueEl.textContent = shown;
        valueEl.title = "Predicted CGPA — projected from your current gradebook scores.";
      }
      const head = cgpaEl.querySelector(".stat-heading");
      if (head && !head.querySelector(".cgpa-predicted-tag")) {
        const tag = document.createElement("span");
        tag.className = "cgpa-predicted-tag";
        tag.textContent = "predicted";
        head.appendChild(tag);
      }
    }

    function getSemesterStart(semester) {
      const match = String(semester || "").match(
        /\b(fall|spring)\s+(20\d{2})\b|\b(20\d{2})\s+(fall|spring)\b/i,
      );
      if (!match) return null;
      const season = match[1] || match[4];
      const year = Number(match[2] || match[3]);
      return lastMondayOf(
        year,
        season.toLowerCase() === "fall" ? 8 : 1,
      );
    }

    function getSemesterWeek(semester) {
      const start = getSemesterStart(semester);
      if (!start || new Date() < start) return null;
      const ongoing =
        Math.floor((new Date() - start) / (7 * 24 * 60 * 60 * 1000)) + 1;
      return { ongoing, total: TERM_TOTAL_WEEKS };
    }

    function getUpcomingTerm(semester) {
      const now = new Date();
      const currentSemesterStart = getSemesterStart(semester);
      if (currentSemesterStart && currentSemesterStart > now) {
        return { label: semester, start: currentSemesterStart };
      }

      const year = now.getFullYear();
      const candidates = [
        { label: `Spring ${year}`, start: lastMondayOf(year, 1) },
        { label: `Fall ${year}`, start: lastMondayOf(year, 8) },
        { label: `Spring ${year + 1}`, start: lastMondayOf(year + 1, 1) },
        { label: `Fall ${year + 1}`, start: lastMondayOf(year + 1, 8) },
      ];
      return candidates
        .filter((candidate) => candidate.start > now)
        .sort((a, b) => a.start - b.start)[0] || null;
    }

    function getNextClassState(classes, semester, termWeek) {
      const now = new Date();
      if (!termWeek) {
        const upcomingTerm = getUpcomingTerm(semester);
        if (!upcomingTerm) {
          return {
            title: "Next class",
            value: "Countdown unavailable",
            commencement: null,
          };
        }
        const days = Math.ceil(
          (upcomingTerm.start - new Date()) / (24 * 60 * 60 * 1000),
        );
        return {
          title: "Next class",
          value: `${upcomingTerm.label} in ${days} day${days === 1 ? "" : "s"}`,
          // Commencement date shown in the hover tooltip (only meaningful while
          // a term is still upcoming — classes haven't started yet).
          commencement: {
            label: upcomingTerm.label,
            start: upcomingTerm.start,
            days,
          },
        };
      }

      const nextClass = classes
        .filter((item) => item.startTime)
        .map((item) => {
          const [hours, minutes] = item.startTime.split(":").map(Number);
          const start = new Date(now);
          start.setHours(hours, minutes, 0, 0);
          return { ...item, start };
        })
        .filter((item) => item.start > now)
        .sort((a, b) => a.start - b.start)[0];

      if (!nextClass) {
        return {
          title: "Next class",
          value: "No more classes today",
          commencement: null,
        };
      }
      const minutes = Math.ceil((nextClass.start - now) / 60000);
      return {
        title: "Next class",
        value: `${nextClass.courseName} in ${minutes} min`,
        commencement: null,
      };
    }

    // Human-readable commencement date for the Next Class card's in-card hover
    // detail, e.g. "September 28, 2026 • Mon" (date first, weekday after).
    // Returns a safe fallback if the date is bad.
    function formatCommencementDate(date) {
      if (!(date instanceof Date) || isNaN(date.getTime())) {
        return "Date unavailable";
      }
      const when = date.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
      return `${when} • ${weekday}`;
    }

    // --- Make-Up Class card -----------------------------------------------
    // The timetable is a weekly grid: each li.cd-schedule__group ul entry is
    // one class slot (entry.children[0]) with data-start/data-end times and
    // cells [instructor, course, section, room] (mirrors extractTimeTableInfo in
    // student_timetable.js). A make-up/rescheduled class is flagged when the
    // room is empty — the portal then shows the "MAKEUP CLASS" placeholder —
    // OR the course/section text names it (makeup / make-up / remedial). The
    // grid carries no calendar dates, so the "most-upcoming" instance is the
    // next future date whose weekday matches the slot's day, at the slot time.
    // Day index 0 = Monday (matches student_timetable.js: now.getDay()-1).

    // Next calendar occurrence of a weekday slot. dayIndex 0=Mon → getDay 1.
    // Returns a Date strictly after `now`, or null if none is found.
    function nextOccurrence(dayIndex, startTime, now) {
      const targetGetDay = (dayIndex + 1) % 7;
      let [h, m] = String(startTime || "0:0").split(":").map((n) => parseInt(n, 10));
      if (isNaN(h)) h = 0;
      if (isNaN(m)) m = 0;
      for (let offset = 0; offset <= 7; offset++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h, m, 0, 0);
        if (d.getDay() === targetGetDay && d > now) return d;
      }
      return null;
    }

    // Fetch the timetable, flag make-up classes (detect both), keep the single
    // most-upcoming one, and refresh the on-screen section. Sets makeUpClass /
    // makeUpLoaded (the latter gates "Checking…" vs "No make-up classes").
    async function fetchMakeUpClasses() {
      let makeUps = [];
      try {
        const res = await fetch("/student/class/schedule", { credentials: "include" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const doc = new DOMParser().parseFromString(await res.text(), "text/html");
        const now = new Date();
        let day = 0;
        doc.querySelectorAll("li.cd-schedule__group ul").forEach((ul) => {
          Array.from(ul.children).forEach((entry) => {
            try {
              const child = entry.children[0];
              if (!child) return;
              const startTime = (child.getAttribute("data-start") || "").trim();
              const cells = child.children;
              const courseName = (cells[1] ? cells[1].textContent : "").trim();
              const sectionDetails = (cells[2] ? cells[2].textContent : "").trim();
              // Collapse the portal's missing-room placeholder to "" so an empty
              // room (or an absent room cell) is treated as a make-up slot.
              let roomNo = (cells[3] ? cells[3].textContent : "").trim();
              if (roomNo === "MAKEUP CLASS") roomNo = "";
              if (!courseName) return;
              const isMakeUp = !roomNo || /make\s?up|remedial/i.test(`${courseName} ${sectionDetails}`);
              if (!isMakeUp) return;
              const date = nextOccurrence(day, startTime, now);
              if (!date) return;
              makeUps.push({ courseName, sectionDetails, roomNo, startTime, date });
            } catch (e) {}
          });
          day += 1;
        });
        makeUps.sort((a, b) => a.date - b.date);
        makeUpClass = makeUps[0] || null;
      } catch (e) {
        console.warn("UCP dashboard: make-up fetch failed", e);
      } finally {
        makeUpLoaded = true;
      }
      renderMakeUpIntoDom();
    }

    // Rebuild the whole #cvo-makeup section (heading + list + hover overlay) so
    // the overlay is a direct child of the section — the overlay is inset:0 and
    // must NOT sit inside the scrollable .course-overview-list, which would clip
    // it. No-op if the section isn't on screen.
    function renderMakeUpIntoDom() {
      const el = document.getElementById("cvo-makeup");
      if (el) el.innerHTML = renderMakeUpSection();
    }

    // "Sept 28, 14:00 • A-001" — short date + start time + room (TBA when the
    // room is empty / was the placeholder).
    function formatMakeUpDetail(m) {
      const when = `${m.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${m.startTime || "TBA"}`;
      const room = m.roomNo || "TBA";
      return `${when} • ${room}`;
    }

    // The Make-Up Class section inner HTML: heading + a compact value (the
    // most-upcoming subject, or a status line) + an in-section hover overlay
    // revealing subject / date-time • room — the same in-card reveal pattern as
    // the Next Class card. Used both on first render and to refresh after each
    // timetable fetch.
    function renderMakeUpSection() {
      const heading = `
        <div class="course-overview-heading">
          <span class="material-icons">event_available</span>
          <span>Make-Up Class</span>
        </div>`;
      let list, overlay = "";
      if (!makeUpLoaded) {
        list = '<span class="course-overview-empty">Checking…</span>';
      } else if (!makeUpClass) {
        list = '<span class="course-overview-empty">No make-up classes</span>';
      } else {
        const m = makeUpClass;
        const subject = escapeHtml(m.courseName);
        const detail = escapeHtml(formatMakeUpDetail(m));
        const when = m.startTime ? escapeHtml(m.startTime) : "Make-up";
        list = `
          <span class="course-overview-makeup-value" title="${subject}">${subject}</span>
          <span class="course-overview-makeup-when">${when}</span>`;
        if (m.date && m.startTime) {
          overlay = `
            <div class="cvo-makeup-tooltip" role="tooltip">
              <div class="cvo-mt-subject">${subject}</div>
              <div class="cvo-mt-detail">${detail}</div>
            </div>`;
        }
      }
      return `${heading}<div class="course-overview-list cvo-makeup-list">${list}</div>${overlay}`;
    }

    // Function to classify percentage levels
    function getAttendanceClass(percentage) {
      if (isNaN(percentage)) return "attendance-fill-critical";
      if (percentage >= 85) return "attendance-fill-safe";
      if (percentage >= 75) return "attendance-fill-low";
      return "attendance-fill-critical";
    }

    // Inject Google Font
    if (!document.querySelector('link[href*="fonts.googleapis.com/css2?family=Afacad+Flux"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Afacad+Flux:wght@100..1000&family=UnifrakturMaguntia&display=swap";
      document.head.appendChild(link);
    }

    // Inject Material Icons
    if (!document.querySelector('link[href*="fonts.googleapis.com/icon?family=Material+Icons"]')) {
      const icons = document.createElement("link");
      icons.rel = "stylesheet";
      icons.href = "https://fonts.googleapis.com/icon?family=Material+Icons";
      document.head.appendChild(icons);
    }

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

    // Persist the registration (roll no) so other pages (e.g. the timetable's
    // locked "live" profile) can display the signed-in student's roll number.
    if (registration && registration !== "----") {
      try {
        chrome.storage.local.set({ ucp_registration: registration });
      } catch (e) {}
    }
    const profile = document.querySelector(
      ".user_heading_avatar .thumbnail img",
    );
    const profileImageSource = profile ? profile.getAttribute("src") : "";
    const academicInfo = extractAcademicInfo();
    const coursesInfo = extractCoursesInfo();
    const attendanceInfo = extractAttendanceInfo(coursesInfo);
    // Term-week card data + whether the timetable has any classes (N/A gate).
    const classesTodayList = extractClassesToday();
    const hasTimetableClasses = classesTodayList.length > 0;
    const termWeekInfo = getTermWeek(new Date());
    let currentSemester = "Loading semester";

    function formatTermWeek(termWeek) {
      return termWeek?.ongoing ? `Week ${termWeek.ongoing}/${termWeek.total}` : "N/A";
    }

    // Prepare rendered HTML snippets for Academics / Attendance / Courses
    function renderAcademicStats(info, termWeek, hasTimetableClasses) {
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

      const safeValue = (v, fallback = "--") =>
        v === null || v === undefined || isNaN(v) ? fallback : v;
      // Term-week card: "ongoing / total" while the timetable has classes,
      // otherwise N/A.
      const termWeekValue = hasTimetableClasses ? formatTermWeek(termWeek) : "N/A";
      // In-progress credits now live INSIDE the merged Credits Info card,
      // revealed on hover — same overlay pattern as the Next Class card's
      // "Classes commence" detail (see .next-class-tooltip in the CSS).
      const inProgressTip =
        info.inProgressCredits !== null &&
        info.inProgressCredits !== undefined &&
        !isNaN(info.inProgressCredits)
          ? `<div class="credits-info-tooltip" role="tooltip">
              <div class="cit-label">In-progress</div>
              <div class="cit-value">${safeValue(info.inProgressCredits)} CH</div>
            </div>`
          : "";
      // tabindex="0" on every tile (keyboard spec): the two new tiles have a
      // real action (Enter/Space → their page, wired below); the existing four
      // are focusable for tab-order parity (widget → card → action → next card).
      return `
    <div id="stats">
      <div class="entry cgpa" tabindex="0">
        <div class="stat-heading"><span class="material-icons stat-icon">grade</span><div class="ph">CGPA</div></div>
        <div class="value">${safeValue(info.cgpa, "N/A")}</div>
      </div>
      <div class="entry credits-info" tabindex="0">
        <div class="stat-heading"><span class="material-icons stat-icon">school</span><div class="ph">Credits Info</div></div>
        <div class="value">${safeValue(info.earnedCredits)} / ${safeValue(info.totalCredits)} CH</div>${inProgressTip}
      </div>
      <div class="entry academic-term-progress-stat" id="academic-term-progress-stat" tabindex="0">
        <div class="stat-heading"><span class="material-icons stat-icon">timeline</span><div class="ph">Term Progress</div><span class="term-week-badge" id="academic-term-progress-week">${termWeekValue}</span></div>
        <div class="value academic-term-progress-bar"><div class="academic-term-progress-track"><div class="academic-term-progress-fill"></div></div></div>
      </div>
      <div class="entry academic-next-class-stat" id="academic-next-class-stat" tabindex="0">
        <div class="stat-heading"><span class="material-icons stat-icon">schedule</span><div class="ph">Next class</div></div>
        <div class="value">Loading...</div>
      </div>
      <!-- Attendance glance: the MINIMUM attendance % across subjects, read
           against the university's risk thresholds (see attendanceStatus).
           The value line is the risk level; the sub line names the at-risk
           course only while a threshold is actually triggered. -->
      <div class="entry attendance-glance" id="attendance-glance-stat" tabindex="0">
        <div class="stat-heading"><span class="material-icons stat-icon">fact_check</span><div class="ph">Attendance</div></div>
        <div class="value">Scanning…</div>
        <div class="stat-sub" id="attendance-glance-sub"></div>
      </div>
      <!-- Invoices: count of UNPAID invoices fetched from /student/invoices;
           the sub line carries the total amount still due. -->
      <div class="entry invoices-stat" id="invoices-stat" tabindex="0">
        <div class="stat-heading"><span class="material-icons stat-icon">receipt_long</span><div class="ph">Invoices</div></div>
        <div class="value">Checking…</div>
        <div class="stat-sub" id="invoices-stat-sub"></div>
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
          const subjectName =
            item.name.length > 50 ? `${item.name.slice(0, 47)}...` : item.name;
          const cssClass = getAttendanceClass(percentage);
          const pctDisplay = isNaN(percentage) ? "--" : `${percentage}%`;
          const widthStyle = isNaN(percentage)
            ? "width: 4%;"
            : `width: ${Math.max(3, Math.min(100, percentage))}%;`;
          return `
      <div class="attendance-bar-container">
        <div class="attendance-subject-head">
          <div class="attendance-subject-chip" title="${item.name}">
            <span class="attendance-subject-name">${subjectName}</span>
          </div>
          <div class="attendance-credit-chip">
            <span class="attendance-credit">CH: ${item.creditHours}</span>
          </div>
        </div>
        <div class="attendance-bar">
          <div class="attendance-fill ${cssClass}" style="${widthStyle}">${pctDisplay}</div>
        </div>
      </div>`;
        })
        .join("");
    }

    /* ===== Attendance glance tile =========================================
       Shows the LOWEST attendance % across all subjects, read against the
       university's risk thresholds. The value line is the risk level itself;
       the small sub line names the at-risk course ("CS101 · 72%") ONLY while
       a threshold is triggered — at Safe (>=90%) the sub line stays empty. */
    const ATTENDANCE_RISK_LEVELS = [
      { max: 75, label: "Extreme Risk", cls: "is-extreme" },
      { max: 80, label: "Risk", cls: "is-risk" },
      { max: 90, label: "Caution", cls: "is-caution" },
    ];
    function attendanceStatus(pct) {
      if (isNaN(pct)) return null;
      for (const level of ATTENDANCE_RISK_LEVELS) if (pct < level.max) return level;
      return { label: "Safe", cls: "is-safe" };
    }
    // Map an attendance subject name → the short course code of the matching
    // enrolled course (same fuzzy name-match extractAttendanceInfo uses), so
    // the sub line can read "CS101 · 72%" instead of the full course name.
    function attendanceSubjectCode(item, courses) {
      if (!Array.isArray(courses) || !courses.length) return "";
      const normalizedName = String(item.name || "").replace(/\s+/g, " ").toLowerCase();
      const match = courses.find((course) => {
        const courseName = String(course.courseName || "")
          .replace(/\s+/g, " ")
          .toLowerCase();
        return (
          courseName === normalizedName ||
          courseName.includes(normalizedName) ||
          normalizedName.includes(courseName)
        );
      });
      return match ? String(match.courseCode || "").trim() : "";
    }
    function shortSubjectName(name, max = 22) {
      const clean = String(name || "").replace(/\s+/g, " ").trim();
      return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
    }
    function updateAttendanceGlance() {
      const tile = document.getElementById("attendance-glance-stat");
      if (!tile) return;
      const valueEl = tile.querySelector(".value");
      const subEl = document.getElementById("attendance-glance-sub");
      tile.classList.remove("is-extreme", "is-risk", "is-caution", "is-safe");
      const valid = (attendanceInfo || []).filter((s) => isFinite(parseFloat(s.percentage)));
      if (!valid.length) {
        valueEl.textContent = "N/A";
        if (subEl) subEl.textContent = "";
        return;
      }
      const min = valid.reduce((a, b) =>
        parseFloat(a.percentage) < parseFloat(b.percentage) ? a : b,
      );
      const pct = parseFloat(min.percentage);
      const status = attendanceStatus(pct);
      if (status) tile.classList.add(status.cls);
      valueEl.textContent = status ? status.label : "N/A";
      // Sub line (course code · %) only while a threshold is triggered.
      if (subEl) {
        subEl.textContent =
          status && status.cls !== "is-safe"
            ? `${attendanceSubjectCode(min, coursesInfo) || shortSubjectName(min.name)} · ${pct}%`
            : "";
      }
    }
    // Hover detail: every subject with its % colour-coded by the same
    // thresholds — the tile is a glance, the list is the story.
    function buildAttendanceDetailHtml() {
      let rows = "";
      (attendanceInfo || []).forEach((s) => {
        const pct = parseFloat(s.percentage);
        const status = attendanceStatus(pct);
        const code = attendanceSubjectCode(s, coursesInfo);
        rows += `
        <div class="ag-row">
          <span class="ag-name" title="${escapeHtml(s.name)}">${escapeHtml(code || shortSubjectName(s.name, 28))}</span>
          <span class="ag-pct ${status ? status.cls : ""}">${isNaN(pct) ? "--" : pct + "%"}</span>
        </div>`;
      });
      return `<div class="tt-header"><span>Attendance — this semester</span></div>` +
        (rows || `<div class="no-submissions">No attendance records</div>`);
    }

    /* ===== Invoices tile ===================================================
       Fetches /student/invoices (same table js/student_invoices.js parses)
       and counts the UNPAID rows. Value = unpaid count (or "Cleared"); the
       sub line carries the total amount still due. Hover lists the unpaid
       invoices; click opens the invoices page. */
    function formatRsAmount(n) {
      try {
        return "Rs " + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      } catch (e) { return "Rs " + n; }
    }
    async function fetchInvoicesOverview() {
      const tile = document.getElementById("invoices-stat");
      if (!tile) return;
      const valueEl = tile.querySelector(".value");
      const subEl = document.getElementById("invoices-stat-sub");
      let html = "";
      try {
        html = await fetchPortalPageQuiet(`${location.origin}/student/invoices`);
      } catch (e) { /* keep the Checking… state */ }
      if (!html) return;
      const doc = new DOMParser().parseFromString(html, "text/html");
      const table =
        doc.querySelector(".md-card-content .uk-overflow-container .table_check") ||
        doc.querySelector(".table_check");
      const rows = Array.from(table ? table.querySelectorAll("tbody > tr") : []);
      const unpaid = [];
      rows.forEach((row) => {
        const tds = Array.from(row.querySelectorAll("td, th"));
        if (tds.length < 9) return;
        const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
        // Paid rows carry a "Paid" status (js/student_invoices.js statusClass
        // treats anything else — including blank — as due).
        if (/paid/i.test(text(tds[8]))) return;
        const amount = parseFloat(text(tds[7]).replace(/,/g, "")) || 0;
        unpaid.push({ date: text(tds[0]), term: text(tds[2]), amount });
      });
      tile.classList.remove("is-due", "is-safe");
      if (!unpaid.length) {
        // No rows at all = nothing to verify; keep the neutral Checking state.
        if (!rows.length) return;
        tile.classList.add("is-safe");
        valueEl.textContent = "Cleared";
        if (subEl) subEl.textContent = "";
      } else {
        tile.classList.add("is-due");
        valueEl.textContent = String(unpaid.length);
        if (subEl) subEl.textContent = formatRsAmount(unpaid.reduce((s, u) => s + u.amount, 0)) + " due";
      }
      tile.dataset.unpaid = JSON.stringify(unpaid);
    }
    function buildInvoicesDetailHtml() {
      const tile = document.getElementById("invoices-stat");
      let unpaid = [];
      try { unpaid = tile && tile.dataset.unpaid ? JSON.parse(tile.dataset.unpaid) : []; } catch (e) {}
      let rows = "";
      unpaid.forEach((u) => {
        rows += `
        <div class="ag-row">
          <span class="ag-name" title="${escapeHtml(u.term)}">${escapeHtml(u.term || u.date || "Invoice")}</span>
          <span class="ag-pct is-due">${escapeHtml(formatRsAmount(u.amount))}</span>
        </div>`;
      });
      return `<div class="tt-header"><span>Unpaid invoices</span></div>` +
        (rows || `<div class="no-submissions">No unpaid invoices</div>`);
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
          const instructor = formatInstructorName(item.courseInstructor);
          // The chip's VISIBLE text is now the instructor's name (N/A when
          // unknown); the class type (Lecture/Lab) is revealed on hover, above
          // the chip. This swaps the previous behaviour (type shown, name on
          // hover) so the name is always visible on the compact card.
          const instructorChip = instructor === "Not available" ? "N/A" : instructor;
          const classType = getCourseType(item.courseCredits);
          const badgeHTML =
            item.submissionsLeft === null
              ? `
      <span class="gmc-badge checking">
        <span class="count">Checking</span>
      </span>
    `
              : `
      <span class="gmc-badge">
        <span class="count">${item.submissionsLeft}</span>
        <span class="label">left</span>
      </span>
    `;

          // data-card-item marks the chip the "Courses · Card Details"
          // settings (ucp_course_card_config) toggle; the Section chip starts
          // HIDDEN — it only appears once its full course code resolves to a
          // valid section (see syncSectionChip). The <a>'s href is the
          // configured default action (defaultBtn), not the course root; the
          // right-click menu offers every course link.
          return `
      <a href="${item.courseLink}"
         class="gmc-card"
         tabindex="0"
         data-course-index="${index}"
         data-course-code="${courseCodeForData}">

        <div class="gmc-meta" aria-label="Course details">
            <div class="gmc-meta-item" data-card-item="code" data-tooltip="Course code">
              <span class="gmc-meta-value">${item.courseCode}</span>
            </div>
            <div class="gmc-meta-item" data-card-item="credits" data-tooltip="Credit hours">
              <span class="gmc-meta-value">${item.courseCredits}</span>
            </div>
            <div class="gmc-meta-item" data-card-item="section" data-tooltip="Section" style="display:none">
              <span class="gmc-meta-value gmc-section-value">N/A</span>
            </div>
            <div class="gmc-meta-item gmc-course-type" data-tooltip="${escapeHtml(classType)}">
              <span class="gmc-meta-value">${escapeHtml(instructorChip)}</span>
            </div>
        </div>
        <div class="gmc-title" title="${item.courseName}">${item.courseName}</div>
        <!-- Submission pill (right) + default-action button (left) share the
             bottom row; the button's target follows ucp_course_card_config. -->
        <div class="gmc-actions">
          ${badgeHTML}
          <span class="gmc-status" tabindex="0"
                data-course-link="${courseCodeForData}"
                data-course-target="gradebook">
            Open Gradebook
          </span>
        </div>
      </a>
    `;
        })
        .join("");
    }

    function renderCourseOverview(coursesArray, termWeek, semester, classes) {
      const submissionItems = [];

      coursesArray.forEach((course) => {
        const courseId = (course.courseLink || "").split("/")[4] || "";
        const details = submissionDetailsCache.get(courseId) || [];
        if (details.length > 0) {
          submissionItems.push(
            `<span class="course-overview-submission" title="${course.courseName}">
              <span class="material-icons">assignment_late</span>
              <span>${details.length}</span>
            </span>`,
          );
        }
      });

      return `
        <div class="course-overview-card">
          <div class="course-overview-section" id="cvo-submissions">
            <div class="course-overview-heading">
              <span class="material-icons">assignment</span>
              <span>Submissions Left</span>
            </div>
            <div class="course-overview-submissions">
              ${courseSubmissionsChecking
                ? '<span class="course-overview-empty">Checking…</span>'
                : submissionItems.length ? submissionItems.join("") : '<span class="course-overview-empty">No active submissions</span>'}
            </div>
          </div>
          <div class="course-overview-section course-overview-assessments" id="cvo-assessments">
            <div class="course-overview-heading">
              <span class="material-icons">assignment</span>
              <span>Next Assessment</span>
            </div>
            <div class="course-overview-list">
              ${courseAssessmentsChecking
                ? '<span class="course-overview-empty">Checking…</span>'
                : assessmentItemsCache.length
                  ? assessmentItemsCache.map((item) => `<span class="course-overview-list-item" title="${item.courseName}">${item.title}</span>`).join("")
                  : '<span class="course-overview-empty">No assessments this month</span>'}
            </div>
          </div>
          <div class="course-overview-section course-overview-makeup" id="cvo-makeup">${renderMakeUpSection()}</div>
          <button type="button" class="gmc-courses-refresh-btn" id="gmc-refresh-courses"
            title="Refresh courses" aria-label="Refresh courses">
            <span class="material-icons">refresh</span>
            <span class="gmc-courses-refresh-col">
              <span class="gmc-courses-refresh-title">Refresh</span>
              <!-- Always shows the course total; on hover the JS swaps in a
                   relative "Updated … ago" timestamp (see the hover wiring). -->
              <span class="gmc-courses-refresh-status" id="gmc-refresh-courses-status">Total courses: ${coursesArray.length}</span>
            </span>
          </button>
        </div>
      `;
    }

    function updateCourseOverview(
      coursesArray,
      courseList,
      overviewTermWeek = termWeekInfo,
    ) {
      // Rebuild the #course-overview-card mini-cards (Submissions Left /
      // Next Assessment / Make-Up) — the submission/assessment caches have
      // likely filled in since first paint. Bail only if the card is missing;
      // it is always present in the initial courses DOM, so this is a safety
      // net (a null would otherwise throw on .outerHTML), not a normal exit.
      const overview = document.getElementById("course-overview-card");
      if (!overview) return;
      // Prefer the explicit course list, falling back to the courses array
      // (both call sites pass the enrolled-courses list positionally).
      overview.outerHTML = `<div id="course-overview-card">${renderCourseOverview(courseList || coursesArray, overviewTermWeek, currentSemester, classesTodayList)}</div>`;
      const nextClassCard = document.getElementById("academic-next-class-stat");
      if (nextClassCard) {
        const state = getNextClassState(classesTodayList, currentSemester, overviewTermWeek);
        // Commencement detail appears INSIDE the card on hover, only when a
        // term is upcoming (state.commencement is set). It fills the card as an
        // overlay (see .next-class-tooltip). During an active term the card
        // shows a specific class, so no commencement detail is rendered.
        const commencementTip = state.commencement
          ? `<div class="next-class-tooltip" role="tooltip">
              <div class="nct-label">Classes commence</div>
              <div class="nct-date">${formatCommencementDate(state.commencement.start)}</div>
            </div>`
          : "";
        nextClassCard.innerHTML = `
          <div class="stat-heading"><span class="material-icons stat-icon">schedule</span><div class="ph">${state.title}</div></div>
          <div class="value">${state.value}</div>${commencementTip}`;
      }
      const termWeekValue = formatTermWeek(overviewTermWeek);
      document.getElementById("academic-term-progress-week")?.replaceChildren(
        document.createTextNode(termWeekValue),
      );
      const progressFill = document.querySelector(
        "#academic-term-progress-stat .academic-term-progress-fill",
      );
      if (progressFill) {
        const progress = overviewTermWeek?.ongoing
          ? Math.min(100, (overviewTermWeek.ongoing / overviewTermWeek.total) * 100)
          : 0;
        progressFill.style.width = `${progress}%`;
      }
      // The course-overview card was just rebuilt above (outerHTML replace),
      // so any per-mini-section visibility (cvo-*) set earlier is gone —
      // re-apply it so a hidden Submissions/Assessments/Grades section stays
      // hidden across the 60s refresh.
      applyDashboardItemVisibility();
      // 1B: the mini-cards were just replaced — re-bind their hover popups.
      attachOverviewCardHoverHandlers();
      // The refresh button was replaced too — re-bind its hover line (and make
      // sure it shows "Total courses: N", not a stale refresh message).
      attachRefreshHoverHandlers();
      refreshStatusRestore();
    }

    /* === Insert Student Card + modules (uses the prepared render functions) === */

    const cardParent =
      document.querySelector(".md-card .md-card-content") ||
      document.querySelector("#page_content .md-card-content") ||
      document.querySelector(".md-card-content") ||
      document.querySelector("#page_content");
    const existingAcademics = document.getElementById("academics-module");
    const existingCourses = document.getElementById("gmc-courses-section");
    const existingAcademicsHeading = document.getElementById("my-academics");
    const existingCoursesHeading = document.getElementById("my-courses");
    if (
      existingAcademics &&
      existingCourses &&
      existingAcademicsHeading &&
      existingCoursesHeading
    ) {
      if (existingAcademics) existingAcademics.style.display = "";
      if (existingCourses) existingCourses.style.display = "";
      return;
    }
    if (!cardParent) return;
    document
      .querySelectorAll(
        "#academics-module, #gmc-courses-section, #my-academics, #my-courses, #gmc-notifications-block"
      )
      .forEach((element) => element.remove());
    cardParent.insertAdjacentHTML(
      "beforeBegin",
      `

<div class="gmc-section-head">
  <h3 id="my-academics" class="heading_a">Academics</h3>
  <button type="button" class="gmc-collapse-btn" id="gmc-collapse-academics"
    aria-expanded="true" aria-controls="academics-module" title="Collapse Academics">
    <span class="material-icons">expand_more</span>
  </button>
</div>

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
    ${renderAcademicStats(academicInfo, termWeekInfo, hasTimetableClasses)}

</div>

<div class="attendance-card" id="attendance-chart">
  <h2 class="attendance-card-title">Attendance Summary</h2>
  <!-- Static header above; only this body scrolls so the side scrollbar sits
       below the "Attendance Summary" headline (see student_dashboard.css). -->
  <div class="attendance-card-scroll">
    ${renderAttendance(attendanceInfo)}
  </div>
</div>

  <!-- Today's Classes — no wrapper padding, so the card's top lines up with
       the Attendance card (both are 500px × 38rem, sitting at the row top). -->
<div id="classesCard">
  <div class="classes-card">
    <h2 class="classes-card-title">Classes Today</h2>
    <div class="classes-card-scroll">
      <div id="classes-card-content"></div>
    </div>
  </div>
</div>

</div>
`,
    );

    // Insert Courses Cards into DOM (afterBegin so they're near top as before)
    cardParent.insertAdjacentHTML(
      "afterBegin",
      `

<div class="gmc-section-head">
  <h3 id="my-courses" class="heading_a">Courses</h3>
  <button type="button" class="gmc-collapse-btn" id="gmc-collapse-courses"
    aria-expanded="true" aria-controls="gmc-courses-section" title="Collapse Courses">
    <span class="material-icons">expand_more</span>
  </button>
</div>

<div class="gmc-container" id="gmc-courses-section">
  <div id="course-overview-card">${renderCourseOverview(coursesInfo, null, currentSemester, classesTodayList)}</div>
  ${renderCourses(coursesInfo)}
</div>

`,
    );

    /* === Notification & Updates section (moved from the sidebar onto the
         dashboard, directly below the Courses section). The widget itself —
         the Course Updates / UCP Notification tabs, the "Scan now" button and
         the live course-updates feed — is built by js/notification_page.js,
         which also runs on this page (see manifest) and exposes
         window.__ucpNotifPage.embed() in the same isolated world. We only
         provide the section head + a mount point here; the widget renders
         into #ucp-dash-notif. The .gmc-container grid is NOT reused because
         it is a multi-column auto-fit grid (built for the course cards); the
         widget is a single full-width block instead. */
    document
      .getElementById("gmc-courses-section")
      .insertAdjacentHTML(
        "afterend",
        `

<div id="gmc-notifications-block">
  <div class="gmc-section-head">
    <h3 id="my-notifications" class="heading_a">Notification &amp; Updates</h3>
    <button type="button" class="gmc-collapse-btn" id="gmc-collapse-notifications"
      aria-expanded="true" aria-controls="gmc-notifications-section" title="Collapse Notifications">
      <span class="material-icons">expand_more</span>
    </button>
  </div>
  <div id="gmc-notifications-section">
    <div id="ucp-dash-notif"></div>
  </div>
</div>

`,
      );

    // Mount the notification widget. The namespace is only present while
    // toggle_power is on (the same gate this whole dashboard runs under), so
    // a short retry covers the storage-callback timing; if it never shows up
    // we quietly leave the (empty) section in place.
    const notifMount = document.getElementById("ucp-dash-notif");
    const mountNotifWidget = (attempt) => {
      if (!notifMount || !notifMount.isConnected) return;
      if (window.__ucpNotifPage && typeof window.__ucpNotifPage.embed === "function") {
        try { window.__ucpNotifPage.embed(notifMount); }
        catch (e) { console.warn("UCP dashboard: notification embed failed", e); }
        return;
      }
      if (attempt > 10) return;
      setTimeout(() => mountNotifWidget(attempt + 1), 200);
    };
    mountNotifWidget(1);

    /* ------------------ Section expand / collapse (Academics + Courses) ------------------
       A chevron button on the right of each heading toggles the section's
       content (display:none). The choice persists in storage
       (ucp_dashboard_sections) so it survives a page load. */
    const SECTIONS_KEY = "ucp_dashboard_sections";
    function setSectionCollapsed(which, collapsed) {
      const target =
        which === "academics"
          ? document.getElementById("academics-module")
          : which === "notifications"
            ? document.getElementById("gmc-notifications-section")
            : document.getElementById("gmc-courses-section");
      if (target) target.style.display = collapsed ? "none" : "";
      const btn = document.getElementById("gmc-collapse-" + which);
      if (!btn) return;
      btn.classList.toggle("collapsed", collapsed);
      btn.setAttribute("aria-expanded", String(!collapsed));
      const label =
        which === "academics" ? "Academics"
        : which === "notifications" ? "Notifications"
        : "Courses";
      btn.title = (collapsed ? "Expand " : "Collapse ") + label;
      try {
        chrome.storage.local.get(SECTIONS_KEY, (r) => {
          const state = (r && r[SECTIONS_KEY]) || {};
          state[which] = !collapsed; // store the EXPANDED boolean
          chrome.storage.local.set({ [SECTIONS_KEY]: state });
        });
      } catch (e) {}
    }
    const collapseAcademicsBtn = document.getElementById("gmc-collapse-academics");
    if (collapseAcademicsBtn)
      collapseAcademicsBtn.addEventListener("click", () => {
        const t = document.getElementById("academics-module");
        if (t) setSectionCollapsed("academics", t.style.display !== "none");
      });
    const collapseCoursesBtn = document.getElementById("gmc-collapse-courses");
    if (collapseCoursesBtn)
      collapseCoursesBtn.addEventListener("click", () => {
        const t = document.getElementById("gmc-courses-section");
        if (t) setSectionCollapsed("courses", t.style.display !== "none");
      });
    const collapseNotifBtn = document.getElementById("gmc-collapse-notifications");
    if (collapseNotifBtn)
      collapseNotifBtn.addEventListener("click", () => {
        const t = document.getElementById("gmc-notifications-section");
        if (t) setSectionCollapsed("notifications", t.style.display !== "none");
      });
    // Blackish-glass fill for the course cards (painted inline — it beats
    // the CSS fallback). Matches the portal's dark card surfaces (see
    // styles/student_dashboard.css .gmc-card) and stays translucent so the
    // wallpaper shows through.
    const CARD_GLASS =
      "linear-gradient(135deg, rgba(10, 14, 20, 0.68), rgba(13, 18, 28, 0.5))";
    document.querySelectorAll(".gmc-card").forEach((card) => {
      card.style.background = CARD_GLASS;
    });

    /* ------------------ Course cards: config · sections · left/right click --
       ucp_course_card_config (Settings → Courses · Card Details) gates the
       code / credits chips and picks the DEFAULT ACTION: the card's href and
       the bottom-left pill both open that subpage on a left click. A right
       click opens a menu with EVERY course link instead (the portal's own
       context menu is suppressed on our cards). */
    const COURSE_CARD_CFG_KEY = "ucp_course_card_config";
    const COURSE_CARD_CFG_DEFAULT = { code: true, section: true, credits: true, defaultBtn: "gradebook" };
    // Settings "Default Card Button" value → subpage path + pill label.
    const COURSE_BTN_TARGETS = {
      gradebook: { path: "gradebook", label: "Open Gradebook" },
      announcements: { path: "announcement", label: "Open Announcement" },
      material: { path: "material", label: "Open Material" },
      assessments: { path: "assessment", label: "Open Assessments" },
      outline: { path: "outline", label: "Open Outline" },
    };
    // Every course subpage, for the right-click menu. path:null = the course
    // root (the card's own link).
    const COURSE_LINKS = [
      { icon: "home", label: "Course page", path: null },
      { icon: "grade", label: "Gradebook", path: "gradebook" },
      { icon: "assignment", label: "Submissions", path: "submission" },
      { icon: "article", label: "Course material", path: "material" },
      { icon: "quiz", label: "Assessments", path: "assessment" },
      { icon: "campaign", label: "Announcements", path: "announcement" },
      { icon: "list_alt", label: "Outline", path: "outline" },
    ];
    let courseCardCfg = { ...COURSE_CARD_CFG_DEFAULT };

    const cardCourseId = (card) => card.dataset.courseCode || "";
    const courseUrlFor = (card, path) => {
      const id = cardCourseId(card);
      if (!id) return "#";
      return path ? `/student/course/${path}/${id}` : `/student/course/${id}`;
    };

    function applyCourseCardConfig() {
      const target = COURSE_BTN_TARGETS[courseCardCfg.defaultBtn] || COURSE_BTN_TARGETS.gradebook;
      document.querySelectorAll(".gmc-card").forEach((card) => {
        // Left click (the card is the anchor) = the configured default action.
        card.href = courseUrlFor(card, target.path);
        const status = card.querySelector(".gmc-status");
        if (status) {
          status.dataset.courseTarget = target.path;
          status.textContent = target.label;
        }
      });
      // Chip visibility per settings; the Section chip is additionally gated
      // by resolution — syncSectionChip owns that one.
      document.querySelectorAll(".gmc-meta-item[data-card-item]").forEach((chip) => {
        const key = chip.dataset.cardItem;
        if (key === "section") return;
        chip.style.display = courseCardCfg[key] === false ? "none" : "";
      });
      document.querySelectorAll(".gmc-card").forEach(syncSectionChip);
    }

    // The Section chip is hidden while the full course code is still resolving
    // AND for invalid sections (A1…A99 shape only) — a bare "N/A" chip just
    // read as noise.
    const SECTION_RE = /^[A-Z][1-9]\d?$/;
    const sectionResolved = new Map(); // courseIndex → validated section string
    function syncSectionChip(card) {
      const chip = card?.querySelector('[data-card-item="section"]');
      if (!chip) return;
      const value = sectionResolved.get(card.dataset.courseIndex) || "";
      const show = courseCardCfg.section !== false && SECTION_RE.test(value);
      chip.style.display = show ? "" : "none";
      const val = chip.querySelector(".gmc-meta-value");
      if (val) val.textContent = value || "N/A";
    }

    // Pill (and card keyboard activation) open the configured target.
    function openStatusTarget(status) {
      const card = status.closest(".gmc-card");
      const id = (card && card.dataset.courseCode) || status.dataset.courseLink;
      const path = status.dataset.courseTarget || "gradebook";
      if (id) location.href = `/student/course/${path}/${id}`;
    }
    document.querySelectorAll(".gmc-card").forEach((card) => {
      // Left-click plumbing: the PILL is the only thing we intercept — its
      // click would otherwise bubble into the anchor and follow the card's
      // href; the pill explicitly goes to its configured target instead.
      // Everything else (title, chips, empty space) keeps the anchor default
      // = the default action.
      card.addEventListener("click", (e) => {
        const status = e.target.closest(".gmc-status");
        if (!status) return;
        e.preventDefault();
        e.stopPropagation();
        openStatusTarget(status);
      });
      const status = card.querySelector(".gmc-status");
      if (status) {
        // Guard delivery (registered before the portal's interceptor) plus a
        // fallback listener; keyboard activation for the tabbed pill.
        status.__ucpAction = () => openStatusTarget(status);
        status.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openStatusTarget(status);
        });
        status.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            openStatusTarget(status);
          }
        });
      }
    });

    /* Right-click → course-links menu (suppressed portal menu). The menu is
       rebuilt per invocation and its items carry __ucpAction so the
       document_start guard delivers the press; the <a> defaults are the
       fallback if the guard is stale. */
    let ctxMenuEl = null;
    const closeCourseMenu = () => {
      if (!ctxMenuEl) return;
      const el = ctxMenuEl;
      ctxMenuEl = null;
      el.remove();
      document.removeEventListener("click", onDocCloseMenu, true);
      document.removeEventListener("keydown", onEscCloseMenu, true);
      window.removeEventListener("scroll", onScrollCloseMenu, true);
    };
    const onDocCloseMenu = (e) => {
      if (ctxMenuEl && !ctxMenuEl.contains(e.target)) closeCourseMenu();
    };
    const onEscCloseMenu = (e) => {
      if (e.key === "Escape") closeCourseMenu();
    };
    const onScrollCloseMenu = () => closeCourseMenu();
    function showCourseMenu(card, x, y) {
      closeCourseMenu();
      const id = cardCourseId(card);
      if (!id) return;
      const menu = document.createElement("div");
      menu.className = "gmc-ctx-menu";
      menu.setAttribute("role", "menu");
      COURSE_LINKS.forEach((link) => {
        const a = document.createElement("a");
        a.className = "gmc-ctx-item";
        a.setAttribute("role", "menuitem");
        const url = courseUrlFor(card, link.path);
        a.href = url;
        a.innerHTML = `<span class="material-icons">${link.icon}</span><span>${link.label}</span>`;
        a.__ucpAction = () => {
          closeCourseMenu();
          location.href = url;
        };
        menu.appendChild(a);
      });
      document.body.appendChild(menu);
      // Position at the cursor, clamped inside the viewport.
      const left = Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8));
      const top = Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8));
      menu.style.left = left + "px";
      menu.style.top = top + "px";
      ctxMenuEl = menu;
      document.addEventListener("click", onDocCloseMenu, true);
      document.addEventListener("keydown", onEscCloseMenu, true);
      window.addEventListener("scroll", onScrollCloseMenu, true);
    }

    // Load the card config (defaults when absent) and keep it live — the
    // settings page can change it in another tab while the dashboard is open.
    const loadCourseCardConfig = () => {
      try {
        chrome.storage.local.get(COURSE_CARD_CFG_KEY, (r) => {
          courseCardCfg = { ...COURSE_CARD_CFG_DEFAULT, ...((r && r[COURSE_CARD_CFG_KEY]) || {}) };
          applyCourseCardConfig();
        });
      } catch (e) {
        applyCourseCardConfig();
      }
    };
    loadCourseCardConfig();
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[COURSE_CARD_CFG_KEY]) {
          courseCardCfg = { ...COURSE_CARD_CFG_DEFAULT, ...(changes[COURSE_CARD_CFG_KEY].newValue || {}) };
          applyCourseCardConfig();
        }
      });
    } catch (e) {}

    // 1B: resolve each course's Section immediately on load (no idle deferral)
    // so the Section chip fills in as soon as the dashboard paints. Cached
    // codes (rememberCourseCode) resolve with no network at all. Invalid
    // sections never reach the map, so the chip stays hidden for them.
    coursesInfo.forEach(async (course, index) => {
      const fullCourseCode = await fetchFullCourseCode(
        course.courseLink,
        course.courseName,
      );
      if (!fullCourseCode) return;
      const section = getCourseSection(fullCourseCode);
      if (!SECTION_RE.test(section)) return;
      sectionResolved.set(String(index), section);
      const card = document.querySelector(
        `.gmc-card[data-course-index="${index}"]`,
      );
      syncSectionChip(card);
    });

    const scheduleIdleWork = (callback) => {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(callback, { timeout: 1500 });
      } else {
        window.setTimeout(callback, 500);
      }
    };

    // 1B: resolve each course's Section immediately on load (no idle deferral)
    // so the Section chip fills in as soon as the dashboard paints. Cached
    // codes (rememberCourseCode) resolve with no network at all.
    coursesInfo.forEach(async (course, index) => {
      const fullCourseCode = await fetchFullCourseCode(
        course.courseLink,
        course.courseName,
      );
      if (!fullCourseCode) return;

      const card = document.querySelector(
        `.gmc-card[data-course-index="${index}"]`,
      );
      const section = card?.querySelector(".gmc-section-value");
      if (section) section.textContent = getCourseSection(fullCourseCode);
    });

    /* ------------------ NEW: Attach hover handlers to badges ------------------ */
    function attachBadgeHoverHandlers() {
      document.querySelectorAll(".gmc-card").forEach((card) => {
        const badge = card.querySelector(".gmc-badge");
        if (!badge || badge._bound) return;
        badge._bound = true;

        const code = card.dataset.courseCode;

        badge.addEventListener("mouseenter", () => {
          // No active submissions → the badge is fading out / hidden. Don't raise
          // a tooltip for it (and clear one if the cursor lingers over it).
          if (badge.dataset.empty) {
            hideTooltip();
            return;
          }

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
            // 1B: if the user moved onto a course-overview mini-card, its popup
            // just opened — don't hide it from this badge's stale timer.
            if (activeOverviewPopup) return;
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

    /* 1B: hover mini-popups on the "Submissions Left" + "Next Assessment"
       mini-cards. The "Submissions Left" card reuses the same submission list
       the per-course badge shows (course + name + due date + download); the
       "Next Assessment" card lists the cached assessment items. The mini-cards
       are rebuilt on every fetch (updateCourseOverview), so the handlers are
       re-bound there — a captured element would detach. */
    function buildSubmissionsPopupHtml() {
      const rows = [];
      coursesInfo.forEach((c) => {
        const code = (c.courseLink || "").split("/")[4] || "";
        const subs = submissionDetailsCache.get(code) || [];
        subs.forEach((s) =>
          rows.push({ course: c.courseName, name: s.name, dueDate: s.dueDate, link: s.attachmentLink }),
        );
      });
      let html = `<div class="tt-header"><span>Active Submissions</span></div>`;
      if (!rows.length) html += `<div class="no-submissions">No active submissions</div>`;
      else
        rows.forEach((r) => {
          const disabled = r.link ? "" : "disabled";
          const urlAttr = r.link ? `data-url="${r.link}"` : "";
          html += `
        <div class="submission-row">
          <div class="submission-name" title="${escapeHtml(r.course)}">${escapeHtml(r.course)}</div>
          <div class="submission-name">${escapeHtml(r.name)}</div>
          <div class="submission-name">${escapeHtml(r.dueDate)}</div>
          <button class="download-btn" ${disabled} ${urlAttr}>
            <i style="color:#fff !important; margin:0;" class="material-icons">download</i>
          </button>
        </div>`;
        });
      return html;
    }

    function buildAssessmentsPopupHtml() {
      let html = `<div class="tt-header"><span>Next Assessments</span></div>`;
      if (!assessmentItemsCache.length)
        html += `<div class="no-submissions">No assessments this month</div>`;
      else
        assessmentItemsCache.forEach((it) => {
          html += `
        <div class="submission-row">
          <div class="submission-name" title="${escapeHtml(it.courseName)}">${escapeHtml(it.courseName)}</div>
          <div class="submission-name">${escapeHtml(it.title)}</div>
        </div>`;
        });
      return html;
    }

    function wireDownloadBtns() {
      const tt = document.querySelector(".gmc-tooltip");
      tt.querySelectorAll(".download-btn[data-url]").forEach((btn) => {
        btn.onclick = () => {
          window.location.href = btn.dataset.url;
        };
      });
    }

    function attachOverviewCardHoverHandlers() {
      const sub = document.getElementById("cvo-submissions");
      const asmt = document.getElementById("cvo-assessments");
      if (sub && !sub._bound) {
        sub._bound = true;
        sub.addEventListener("mouseenter", () => {
          activeOverviewPopup = "sub";
          showTooltipAt(sub, buildSubmissionsPopupHtml());
          wireDownloadBtns();
        });
        sub.addEventListener("mouseleave", () => {
          activeOverviewPopup = null;
          setTimeout(() => {
            if (!tooltipEl?.matches(":hover")) hideTooltip();
          }, 120);
        });
      }
      if (asmt && !asmt._bound) {
        asmt._bound = true;
        asmt.addEventListener("mouseenter", () => {
          activeOverviewPopup = "asmt";
          showTooltipAt(asmt, buildAssessmentsPopupHtml());
        });
        asmt.addEventListener("mouseleave", () => {
          activeOverviewPopup = null;
          setTimeout(() => {
            if (!tooltipEl?.matches(":hover")) hideTooltip();
          }, 120);
        });
      }
    }

    /* Today's Classes — reuse the list extracted above (also used to gate the
       Term Week card). */
    const classesToday = classesTodayList;

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
          <span style="color:#ffffff !important;">No Classes Today</span>
        </div>`;
    } else {
      const groupedClasses = groupClasses(classesToday);

      let classesHTML = `<div class="classes-mini-list">`;

      groupedClasses.forEach((cls) => {
        classesHTML += `
          <div class="classes-mini-card">
            <div class="classes-mini-course">
              <span class="material-icons classes-card-icon">book</span>
              <span>${cls.courseName}</span>
            </div>
            <div class="classes-mini-times">
              <span class="classes-mini-time">
                <span class="material-icons classes-card-icon">schedule</span>
                ${cls.startTime || "N/A"}
              </span>
              <span class="classes-mini-time">
                <span class="material-icons classes-card-icon">timer</span>
                ${cls.endTime || "N/A"}
              </span>
            </div>
          </div>
        `;
      });

      classesHTML += `</div>`;
      content.innerHTML = classesHTML;
    }

    const attendanceChart = document.querySelector("#attendance-chart");
    if (attendanceChart) {
      attendanceChart.addEventListener("click", () => {
        window.location.href = "https://horizon.ucp.edu.pk/student/attendance";
      });
    }

    /* ------------------ New stat tiles: Attendance glance + Invoices ------
       Both navigate to their page on click / Enter / Space. The action is
       exposed as __ucpAction so the in-file click guard in js/settings_page.js
       (its document_start window-capture listener is registered before the
       portal's interceptor exists) delivers the press; the plain listeners
       are the fallback for a stale guard. Hover raises the shared
       .gmc-tooltip with the per-subject / per-invoice detail. */
    const glanceTile = document.getElementById("attendance-glance-stat");
    if (glanceTile) {
      const openAttendance = () => { location.href = "/student/attendance"; };
      glanceTile.__ucpAction = openAttendance;
      glanceTile.addEventListener("click", (e) => { e.stopPropagation(); openAttendance(); });
      glanceTile.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAttendance(); }
      });
      glanceTile.addEventListener("mouseenter", () => {
        hideTooltip();
        showTooltipAt(glanceTile, buildAttendanceDetailHtml());
      });
      glanceTile.addEventListener("mouseleave", () => {
        setTimeout(() => { if (!tooltipEl?.matches(":hover")) hideTooltip(); }, 120);
      });
    }
    const invoicesTile = document.getElementById("invoices-stat");
    if (invoicesTile) {
      const openInvoices = () => { location.href = "/student/invoices"; };
      invoicesTile.__ucpAction = openInvoices;
      invoicesTile.addEventListener("click", (e) => { e.stopPropagation(); openInvoices(); });
      invoicesTile.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openInvoices(); }
      });
      invoicesTile.addEventListener("mouseenter", () => {
        hideTooltip();
        showTooltipAt(invoicesTile, buildInvoicesDetailHtml());
      });
      invoicesTile.addEventListener("mouseleave", () => {
        setTimeout(() => { if (!tooltipEl?.matches(":hover")) hideTooltip(); }, 120);
      });
    }
    updateAttendanceGlance(); // attendanceInfo is ready synchronously
    fetchInvoicesOverview();  // fetches /student/invoices, fills the tile

    // attach hover handlers now that course cards are in DOM
    attachBadgeHoverHandlers();

    // Term Progress hover: reveal the earliest UPCOMING of the four key term
    // milestones (End of 8th Week, Mid Term, Final Term, Last withdrawal date)
    // as an in-card overlay — same hover-reveal pattern as Next Class / Credits
    // Info. The data comes from the shared academic-calendar module (live-fetched
    // + cached). No overlay when none of the four are still in the future.
    function renderTermProgressOverlay(model) {
      const card = document.getElementById("academic-term-progress-stat");
      if (!card || !model) return;
      const ac = window.__ucpAcadCal;
      if (!ac || !model.milestones) return;
      // Drop any prior overlay so a re-render never stacks.
      card.querySelector(".term-progress-tooltip")?.remove();
      const now = new Date();
      const pickers = [
        { re: /end of 8th week/i, label: "End of 8th Week" },
        { re: /mid[- ]?term/i, label: "Mid Term Examination" },
        { re: /final (term )?examination|finals/i, label: "Final Term Examination" },
        { re: /withdrawal/i, label: "Last Date for Withdrawal" },
      ];
      const candidates = [];
      for (const p of pickers) {
        const hit = (model.milestones || []).find(
          (m) => p.re.test(m.name) && m.dateISO && m.dateISO.getTime() > now.getTime(),
        );
        if (hit) candidates.push({ ...hit, label: p.label });
      }
      if (!candidates.length) return;
      candidates.sort((a, b) => a.dateISO - b.dateISO);
      const c = candidates[0];
      const tip = document.createElement("div");
      tip.className = "term-progress-tooltip";
      tip.setAttribute("role", "tooltip");
      tip.innerHTML = `
        <div class="tpc-label">${escapeHtml(c.label)}</div>
        <div class="tpc-date">${escapeHtml(ac.formatShortDate(c.dateISO))} • ${escapeHtml(ac.countdown(c.dateISO, now))}</div>`;
      card.appendChild(tip);
    }

    // Kick the calendar fetch off now (warm the shared 15-min cache) and again
    // each minute so the countdown / next-milestone stays current.
    if (window.__ucpAcadCal) {
      window.__ucpAcadCal.fetchCalendar().then(renderTermProgressOverlay).catch(() => {});
    }

    fetchCurrentSemester().then((semester) => {
      currentSemester = semester;
      updateCourseOverview(
        coursesInfo,
        coursesInfo,
        getSemesterWeek(currentSemester),
      );
      // 1A: project a CGPA for a 1st-semester student whose CGPA is N/A.
      applyPredictedCgpa();
    });

    setInterval(() => {
      updateCourseOverview(
        coursesInfo,
        coursesInfo,
        getSemesterWeek(currentSemester),
      );
      fetchMakeUpClasses();
      if (window.__ucpAcadCal) {
        window.__ucpAcadCal.fetchCalendar().then(renderTermProgressOverlay).catch(() => {});
      }
    }, 60000);

    // Optional course enrichment starts after the first dashboard paint.
    scheduleIdleWork(() => {
      loadCourseOverviewData();
      resolveSubmissionsLeft(coursesInfo);
      fetchMakeUpClasses();
    });

    /* "Updated … ago" — the last time the course data actually settled.
       resolveSubmissionsLeft (initial load AND manual refresh both await it)
       stamps the timestamp; the refresh button's hover line reads it. */
    const REFRESH_TS_KEY = "ucp_dash_course_refresh_ts";
    function saveRefreshTs() {
      try { chrome.storage.local.set({ [REFRESH_TS_KEY]: Date.now() }); } catch (e) {}
    }
    let refreshTs = 0;
    function readRefreshTs() {
      try {
        chrome.storage.local.get(REFRESH_TS_KEY, (r) => {
          refreshTs = (r && r[REFRESH_TS_KEY]) || 0;
        });
      } catch (e) {}
    }
    readRefreshTs();
    function relativeRefreshLabel() {
      if (!refreshTs) return "Not updated yet";
      const s = Math.floor((Date.now() - refreshTs) / 1000);
      if (s < 45) return "Updated just now";
      const m = Math.floor(s / 60);
      if (m < 60) return `Updated ${m} min ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `Updated ${h}h ago`;
      return `Updated ${Math.floor(h / 24)}d ago`;
    }
    let refreshInProgress = false;
    function refreshStatusRestore() {
      const status = document.getElementById("gmc-refresh-courses-status");
      if (status && !refreshInProgress) status.textContent = `Total courses: ${coursesInfo.length}`;
    }
    // The button is re-created on every overview rebuild, so the hover binding
    // is (re)attached there too — a new element starts unbound.
    function attachRefreshHoverHandlers() {
      const btn = document.getElementById("gmc-refresh-courses");
      if (!btn || btn._ucpHoverBound) return;
      btn._ucpHoverBound = true;
      const swap = () => {
        const status = document.getElementById("gmc-refresh-courses-status");
        if (status && !refreshInProgress) status.textContent = relativeRefreshLabel();
      };
      btn.addEventListener("mouseenter", swap);
      btn.addEventListener("mouseleave", refreshStatusRestore);
    }

    // Manual "Refresh courses" button (right of the mini-cards): re-fetch the
    // per-course submissions/assessments + make-up classes and rebuild the
    // overview. The button itself is re-created by updateCourseOverview on every
    // rebuild, so the click is delegated on the stable #gmc-courses-section.
    const refreshCourseSection = async () => {
      if (refreshInProgress) return;
      refreshInProgress = true;
      // The button (and its icon/status spans) is re-created by updateCourseOverview
      // when the refreshed data lands, so always re-query by id — a captured
      // element would be detached mid-refresh. The status mirrors the
      // academic calendar's Refresh button ("Refreshing…" → "Updated just now").
      const paint = (txt, spinning) => {
        const icon = document.querySelector("#gmc-refresh-courses .material-icons");
        const status = document.getElementById("gmc-refresh-courses-status");
        if (icon) icon.classList.toggle("is-spinning", spinning);
        if (status) status.textContent = txt;
      };
      paint("Refreshing…", true);
      // Replay the first-load "Checking…" state while the re-check runs:
      // course-card badges back to "Checking" (submissionsLeft null = loading)
      // and all three mini-cards to "Checking…" (the flags gate
      // renderCourseOverview; the make-up card gates on makeUpLoaded).
      makeUpLoaded = false;
      courseSubmissionsChecking = true;
      courseAssessmentsChecking = true;
      coursesInfo.forEach((course, index) => {
        course.submissionsLeft = null;
        const badge = document.querySelector(
          `.gmc-card[data-course-index="${index}"] .gmc-badge`,
        );
        if (badge) {
          badge.classList.remove("is-empty");
          delete badge.dataset.empty;
          badge.style.display = "";
          badge.classList.add("checking");
          badge.innerHTML = '<span class="count">Checking</span>';
        }
      });
      updateCourseOverview(coursesInfo, coursesInfo, getSemesterWeek(currentSemester));
      // 1B: re-check ALL three from scratch — submissions left (drop the
      // submission-page promise cache first, or fetchSubmissionCount/Details
      // would just re-parse the first-load pages), next assessments
      // (re-fetches the info/outline/assessment/announcement pages), and
      // make-up classes — and only mark "Updated just now" once they've ALL
      // settled (no fixed timer; resolveSubmissionsLeft awaits every check).
      try {
        submissionPageCache.clear();
        submissionDetailsCache.clear();
        await Promise.all([
          loadCourseOverviewData(),
          resolveSubmissionsLeft(coursesInfo),
          fetchMakeUpClasses(),
        ]);
        courseSubmissionsChecking = false;
        courseAssessmentsChecking = false;
        updateCourseOverview(coursesInfo, coursesInfo, getSemesterWeek(currentSemester));
        // The data just settled — stamp it (the hover line shows the
        // relative time) and restore the always-on "Total courses: N" line.
        readRefreshTs();
        saveRefreshTs();
        readRefreshTs();
        refreshStatusRestore();
      } finally {
        refreshInProgress = false;
        refreshStatusRestore();
      }
    };
    const coursesSectionEl = document.getElementById("gmc-courses-section");
    if (coursesSectionEl) {
      coursesSectionEl.addEventListener("click", (e) => {
        if (e.target.closest("#gmc-refresh-courses")) refreshCourseSection();
      });
      // Right-click a course card → the all-links menu (see showCourseMenu).
      // Delegated here on the stable section element — the cards themselves
      // are only ever created once, but the section outlives the overview
      // rebuilds, so this is the one stable delegation point.
      coursesSectionEl.addEventListener("contextmenu", (e) => {
        const card = e.target.closest(".gmc-card");
        if (!card) return;
        e.preventDefault();
        showCourseMenu(card, e.clientX, e.clientY);
      });
    }

    /* ------------------ Task 1a: make the academic stat mini-cards visually
       identical to the course mini-cards (same blackish-glass fill). The JS
       paints the exact CARD_GLASS gradient the .gmc-card uses inline, so the
       two card families read as one design. (CSS carries the fallback.) */
    document.querySelectorAll("#stats .entry").forEach((tile) => {
      tile.style.background = CARD_GLASS;
    });

    /* ------------------ Task 4a: flip the UCP student card once on load.
       A one-shot animation (not tied to :hover) plays the flip, then the
       class is removed so a later hover flip is unaffected. */
    const loadedCard = document.getElementById("card");
    if (loadedCard) {
      loadedCard.classList.add("card-load-anim");
      const clearLoadAnim = () => loadedCard.classList.remove("card-load-anim");
      loadedCard.addEventListener("animationend", clearLoadAnim, { once: true });
      setTimeout(clearLoadAnim, 2200); // fallback if animationend never fires
    }

    /* ------------------ Task 2: per-item dashboard visibility.
       Settings (js/settings_page.js) stores a map of item→bool under
       ucp_dashboard_items. Missing keys default to VISIBLE, so a fresh
       install shows everything. "earned" now controls the merged Credits Info
       card (in-progress is revealed on hover, no longer a separate card). The
       Course Overview card's three mini-sections (Submissions Left / Next
       Assessment / Make-Up Class) are each independently toggleable via the
       cvo-* ids below. */
    const DASH_ITEMS_KEY = "ucp_dashboard_items";
    const DASH_ITEM_MAP = {
      cgpa: "#stats .entry.cgpa",
      earned: "#stats .entry.credits-info",
      termProgress: "#academic-term-progress-stat",
      nextClass: "#academic-next-class-stat",
      attendanceGlance: "#attendance-glance-stat",
      invoices: "#invoices-stat",
      studentCard: "#card",
      attendance: "#attendance-chart",
      classesToday: "#classesCard",
      courseOverview: "#course-overview-card",
      courseSubmissions: "#cvo-submissions",
      courseAssessments: "#cvo-assessments",
      courseGrades: "#cvo-makeup",
    };
    function applyDashboardItemVisibility() {
      try {
        chrome.storage.local.get(DASH_ITEMS_KEY, (r) => {
          const state = (r && r[DASH_ITEMS_KEY]) || {};
          Object.keys(DASH_ITEM_MAP).forEach((key) => {
            const on = state[key] === undefined ? true : !!state[key];
            document.querySelectorAll(DASH_ITEM_MAP[key]).forEach((el) => {
              el.style.display = on ? "" : "none";
            });
          });
          // If every academic mini-card is hidden, hide the (now empty) row.
          const statsRow = document.getElementById("stats");
          if (statsRow) {
            const anyVisible = Array.from(statsRow.querySelectorAll(".entry")).some(
              (e) => e.style.display !== "none",
            );
            statsRow.style.display = anyVisible ? "" : "none";
          }
        });
      } catch (e) {}
    }
    applyDashboardItemVisibility();
    try {
      // Re-apply live if the settings page (this tab or another) changes the
      // map — e.g. the user toggles an item then returns to the dashboard.
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes[DASH_ITEMS_KEY]) return;
        applyDashboardItemVisibility();
      });
    } catch (e) {}
    };

    const waitForDashboardCard = () => {
      if (
        document.querySelector(".md-card .md-card-content") ||
        document.querySelector("#page_content .md-card-content") ||
        document.querySelector(".md-card-content")
      ) {
        renderDashboard();
        dismissDashboardLoader();
        return;
      }
      setTimeout(waitForDashboardCard, 250);
    };

    waitForDashboardCard();
  }
});
