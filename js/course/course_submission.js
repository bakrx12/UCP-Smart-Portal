function extractCourseMaterialData() {
  try {
    const courseData = {};

    // Extract course name and code from tab
    const titleEl = document.querySelector('.md-card .md-card-content .uk-tab li.uk-active a');
    if (titleEl) {
      const text = titleEl.innerText.trim().replace(/\s+/g, ' ');
      // Example: "Operating System - Lab (AICC3061-F25-BS-AI-F23-AE1)"
      const match = text.match(/^(.+?)\s*\(([^)]+)\)$/);
      courseData.courseName = match ? match[1].trim() : text;
      courseData.courseCode = match ? match[2].trim() : '';
    } else {
      courseData.courseName = '';
      courseData.courseCode = '';
    }

    return courseData;
  } catch (err) {
    console.error('Error extracting course data:', err);
    return { courseName: '', courseCode: ''};
  }
}

const courseInfo = extractCourseMaterialData();
const courseInfoId = window.location.pathname.split('/').filter(Boolean).pop();
if (courseInfoId && courseInfo.courseCode) {
  chrome.storage.local.get('ucp_course_codes', (result) => {
    const courseCodes = result.ucp_course_codes || {};
    courseCodes[courseInfoId] = courseInfo.courseCode;
    chrome.storage.local.set({ ucp_course_codes: courseCodes });
  });
}

const parentDiv = document.querySelector('.md-card .md-card-content .uk-tab')
parentDiv.insertAdjacentHTML('afterEnd',
    `

    <div class="course-header">
      <div class="course-name" id="courseName">
      <span class="material-icons course-title-icon">school</span>
      <span>${courseInfo.courseName}${((m = window.location.href.match(/(assessment|submission|info|outline|gradebook)/i)) => 
  m ? " • " + m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : ""
)()}</span>
      </div>
    </div>

    `
)


const closeModalButton = document.querySelector('.modal-header button.btn-close');
if (closeModalButton) {
  closeModalButton.innerHTML = `
<span class="material-icons" style="margin: 0;">close</span>
`;
}

// ---- 1D: Info + Outline pages get a compact "Course code / Section / Instructor" card ----
// Placed right below the injected .course-header. Course code = everything before the
// first hyphen of the full code; Section = the last two characters; Instructor is a
// best-effort read of the live page (the info page lists the instructor in a labelled cell).

function ccEscape(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function extractInstructorName() {
  try {
    const labelRe = /^(instructor|instructor name|course instructor|faculty|faculty name)\s*:?\s*$/i;
    const nodes = document.querySelectorAll(
      'td, th, dt, dd, li, p, h1, h2, h3, h4, h5, h6, label, strong, .ph, .md-label, .sub-heading'
    );
    for (const el of nodes) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!labelRe.test(t)) continue;
      let val = '';
      const row = el.closest('tr');
      if (row) {
        const cells = Array.from(row.querySelectorAll('td, th'));
        const i = cells.indexOf(el);
        if (i >= 0 && cells[i + 1]) val = cells[i + 1].textContent.trim();
      }
      if (!val && el.nextElementSibling) val = el.nextElementSibling.textContent.trim();
      val = (val || '').replace(/\s+/g, ' ').trim();
      if (val && val.length >= 3 && val.length < 80 && !labelRe.test(val)) return val;
    }
    return '';
  } catch (e) {
    return '';
  }
}

(function addCourseCodeCard() {
  const m = window.location.href.match(/(assessment|submission|info|outline|gradebook)/i);
  const page = m ? m[1].toLowerCase() : '';
  if (page !== 'info' && page !== 'outline') return;

  const full = (courseInfo.courseCode || '').trim();
  if (!full) return;
  const courseCodeLabel = (full.split('-')[0] || full).trim();
  const sectionLabel = full.length >= 2 ? full.slice(-2) : 'N/A';
  const instructor = extractInstructorName() || 'N/A';

  const header = document.querySelector('.course-header');
  if (!header || document.getElementById('courseCodeCard')) return;
  header.insertAdjacentHTML(
    'afterend',
    `
    <div class="course-code-card" id="courseCodeCard">
      <div class="ccm-row ccm-row-full"><span class="ccm-label">Full course code</span><span class="ccm-value ccm-full-code">${ccEscape(full)}</span></div>
      <div class="ccm-row"><span class="ccm-label">Course code</span><span class="ccm-value">${ccEscape(courseCodeLabel)}</span></div>
      <div class="ccm-row"><span class="ccm-label">Section</span><span class="ccm-value">${ccEscape(sectionLabel)}</span></div>
    </div>
    `
  );
})();
