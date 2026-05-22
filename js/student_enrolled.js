chrome.storage.local.get('toggle_power', (result) => {
  const enabled = result['toggle_power'];

  if (enabled) {
    function extractCoursesFromHTML() {
      try {
        const courseCards = document.querySelectorAll('#hierarchical_show2 .md-card');
        if (!courseCards.length) return [];

        const courses = [];

        courseCards.forEach(card => {
          const dept = card.querySelector('.uk-badge-danger')?.textContent.trim() || '';
          const anchor = card.querySelector('a[href]');
          const href = anchor?.getAttribute('href') || '';

          const name = card.querySelector('.md-list-heading')?.textContent.trim() || '';
          const spans = card.querySelectorAll('.sub-heading');
          const code = spans[0]?.textContent.trim() || '';

          // Extract numeric values safely
          const creditsText = [...spans].find(s => s.textContent.includes('Credits'))?.textContent || '';
          const creditsMatch = creditsText.match(/[\d.]+/);
          const credits = creditsMatch ? creditsMatch[0] : '';

          const typeText = [...spans].find(s => s.textContent.includes('Course Type'))?.textContent || '';
          const type = typeText.replace(/.*Course Type:\s*/i, '').trim();

          const term = card.querySelector('.md-bg-orange-800')?.textContent.trim() || '';

          // Skip incomplete entries
          if (name && code && href) {
            courses.push({
              courseName: name,
              courseCode: code,
              courseCredits: credits,
              courseType: type,
              courseTerm: term,
              courseDept: dept,
              href: href
            });
          }
        });

        return courses;
      } catch (err) {
        console.error('Error extracting course data:', err);
        return [];
      }
    }


    // Insert header + container — guarded in case the original anchor element is missing
    const headerTemplate = `
  <div class="course-header">
    <div class="course-name" id="courseName">
      <span class="material-icons" style="margin-right: 1rem; font-size: 30px !important; color: #2563eb !important;">school</span>
      <span>Course • Enrolled</span>
    </div>
    <div class="course-code" id="courseCode">Click on any course for more info</div>
  </div>
  <div class="courses-info-container" id="courses-info-container"></div>
`;

    // Find a sensible anchor to insert before; fallback to page_content_inner or body
    const anchor = document.querySelector('#page_content_inner .md-card')
      || document.querySelector('#page_content_inner')
      || document.body;

    if (anchor === document.body) {
      // insert at top of body if nothing better exists
      anchor.insertAdjacentHTML('afterbegin', headerTemplate);
    } else {
      anchor.insertAdjacentHTML('beforebegin', headerTemplate);
    }

    const coursesInfo = extractCoursesFromHTML();

    // Ensure container exists (in case something removed it)
    let container = document.getElementById('courses-info-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'courses-info-container';
      // place it below the header if present
      const hdr = document.querySelector('.course-header');
      if (hdr && hdr.parentNode) hdr.parentNode.insertBefore(container, hdr.nextSibling);
      else document.body.appendChild(container);
    }

    // If no courses found, show an informative empty state with icon
    if (!coursesInfo || coursesInfo.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'courses-info-empty';
      // Inline styles used so this works without external CSS; adjust to your stylesheet as needed
      emptyCard.setAttribute('style', `
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 1rem;
    border: 1px dashed #e5e7eb;
    border-radius: 8px;
    color: #6b7280;
    background: #fafafa78;
    margin-bottom: 1rem;
  `);
      emptyCard.setAttribute('role', 'status');
      emptyCard.setAttribute('aria-live', 'polite');

      emptyCard.innerHTML = `
    <span class="material-icons" aria-hidden="true" style="font-size:36px; color:#9ca3af;">info</span>
    <div>
      <div style="font-weight:600; margin-bottom:4px;">No courses found</div>
      <div style="font-size:0.9rem;">We couldn't find any courses to display. Try refreshing the page or check your enrollment.</div>
    </div>
  `;

      container.appendChild(emptyCard);
    } else {
      // Populate course cards as before
      coursesInfo.forEach(course => {
        const card = document.createElement('div');
        card.className = 'courses-info-card';

        card.innerHTML = `
      <div class="courses-info-header">
        <div class="courses-info-name">
          <span class="material-icons">menu_book</span>
          ${course.courseName}
        </div>
        <div class="courses-info-code">${course.courseCode}</div>
      </div>

      <div class="courses-info-details">
        <div class="courses-info-detail"><span class="material-icons">grade</span><p>${course.courseCredits} Credits</p></div>
        <div class="courses-info-detail course-type"><span class="material-icons">category</span><p>${course.courseType}</p></div>
        <div class="courses-info-detail"><span class="material-icons">calendar_today</span><p>${course.courseTerm}</p></div>
        <div class="courses-info-detail"><span class="material-icons">school</span><p>${course.courseDept}</p></div>
      </div>
    `;

        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
          window.location.href = course.href;
        });

        container.appendChild(card);
      });
    }


  }

})