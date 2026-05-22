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

    // Extract table rows
    const rows = document.querySelectorAll('table.table_tree tbody tr');
    const courseMaterial = [];

    rows.forEach(row => {
      try {
        const cols = row.querySelectorAll('td');
        const srNo = cols[0]?.innerText.trim() || '';
        const fileName = cols[1]?.innerText.trim() || '';
        const description = cols[2]?.innerText.replace(/\\s+/g, ' ').trim() || '';
        const downloadLink = cols[3]?.querySelector('a')?.getAttribute('href') || '';

        courseMaterial.push({
          srNo,
          courseMaterialFile: fileName,
          description,
          downloadLink
        });
      } catch (innerErr) {
        console.warn('Skipping a malformed row:', innerErr);
      }
    });

    courseData.courseMaterial = courseMaterial;
    return courseData;
  } catch (err) {
    console.error('Error extracting course material:', err);
    return { courseName: '', courseCode: '', courseMaterial: [] };
  }
}


const courseInfo = extractCourseMaterialData();
const courseMaterial = courseInfo?.courseMaterial;

const parentDiv = document.querySelector('#page_content_inner')
parentDiv.insertAdjacentHTML('beforebegin',
  `
      <div class="course-card">
    <div class="course-header">
      <div class="course-name" id="courseName">
      <span class="material-icons" style="margin-right: 1rem; font-size: 30px !important; color: #2563eb !important;">school</span>
      <span>${courseInfo.courseName} • Course Material</span>
      </div>
      <div class="course-code" id="courseCode">${courseInfo.courseCode}</div>
    </div>

    <button id="cm-downloadBtn" class="cm-button">
      <span class="material-icons cm-icon" style="color: #fff !important;">arrow_downward</span>
        Download All
    </button>

    <table>
      <thead>
        <tr>
          <th>Sr #</th>
          <th>File Name</th>
          <th>Description</th>
          <th>Download</th>
        </tr>
      </thead>
      <tbody id="materialBody"></tbody>
    </table>
  </div>
    
    `
)

const body = document.getElementById('materialBody');
courseMaterial.forEach(item => {
  const row = document.createElement('tr');
  row.innerHTML = `
        <td>${item.srNo}</td>
        <td>${item.courseMaterialFile}</td>
        <td>${item.description}</td>
        <td><a href="${item.downloadLink}" class="download-btn" target="_blank"><span class="material-icons" style="margin: 0;">arrow_downward</span></a></td>
      `;
  body.appendChild(row);
});


const btn = document.getElementById("cm-downloadBtn");
if (!courseMaterial || courseMaterial.length === 0) {
  btn.disabled = true;
}

btn.addEventListener("click", async () => {
  btn.disabled = true;
  btn.classList.add("cm-downloading");
  btn.innerHTML = `<span class="material-icons cm-icon spin">cached</span> Preparing...`;

  const zip = new JSZip();
  const folder = zip.folder(`${courseInfo?.courseName ?? ""}_Course_Material`);

  for (const item of courseMaterial) {
    try {
      const res = await fetch(item.downloadLink);
      const blob = await res.blob();
      folder.file(item.courseMaterialFile, blob);
    } catch (err) {
      console.error("Failed:", item.courseMaterialFile, err);
    }
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  saveAs(zipBlob, `${courseInfo?.courseName ?? ""}_CM.zip`);

  btn.classList.remove("cm-downloading");
  btn.innerHTML = `<span class="material-icons cm-icon">check_circle</span> Download Complete`;
  setTimeout(() => {
    btn.innerHTML = `<span class="material-icons cm-icon">arrow_downward</span> Download All`;
    btn.disabled = false;
  }, 3000);
});
