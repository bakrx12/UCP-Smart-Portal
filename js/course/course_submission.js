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
const parentDiv = document.querySelector('.md-card .md-card-content .uk-tab')
parentDiv.insertAdjacentHTML('afterEnd',
    `

    <div class="course-header">
      <div class="course-name" id="courseName">
      <span class="material-icons" style="margin-right: 1rem; font-size: 30px !important; color: #2563eb !important;">school</span>
      <span>${courseInfo.courseName}${((m = window.location.href.match(/(assessment|submission|info|outline|gradebook)/i)) => 
  m ? " • " + m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : ""
)()}</span>
      </div>
      <div class="course-code" id="courseCode">${courseInfo.courseCode}</div>
    </div>
    
    `
)


const closeModalButton = document.querySelector('.modal-header button.btn-close');
if (closeModalButton) {
  closeModalButton.innerHTML = `
<span class="material-icons" style="margin: 0;">close</span>
`;
}