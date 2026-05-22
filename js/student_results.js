chrome.storage.local.get('toggle_power', (result) => {
  const enabled = result['toggle_power'];

  if (enabled) {
    function extractCoursesInfo() {
      const courses = []

      try {
        const containers = document.querySelectorAll('#tabs_anim1 li:nth-child(1) .md-card.md-card-hover')

        for (const container of containers) {
          const courseName = container.children[1].children[0].children[0].textContent;
          const courseInstructor = container.children[0].textContent;
          const courseCode = container.children[1].children[0].children[1].textContent;
          const courseCredits = container.children[2].children[0].children[1].textContent;
          const courseStatus = container.children[2].children[0].children[2].textContent;
          const courseLink = container.children[1].getAttribute("href");

          courses.push({
            courseName, courseInstructor, courseCode, courseCredits, courseStatus, courseLink
          })
        }

      } catch (e) {
        console.log('Something went wrong while parsing elements on page ;/')
      }

      return courses;
    }

    function parseTranscriptTable(tableSelector = '.table_tree') {
      try {
        const table = document.querySelector(tableSelector);
        if (!table) {
          console.warn('parseTranscriptTable: table not found for selector', tableSelector);
          return [];
        }

        const text = el => {
          if (!el) return 'N/A';
          return el.textContent.replace(/\s+/g, ' ').trim();
        };

        const rows = Array.from(table.querySelectorAll('tbody > tr'));
        const terms = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];

          // Only treat rows with the parent marker as term rows
          if (row.classList.contains('table-parent-row')) {
            const tds = Array.from(row.querySelectorAll('td, th'));

            const termNameCell = tds[0] || null;
            const termName = termNameCell
              ? (termNameCell.querySelector('a') ? text(termNameCell.querySelector('a')) : text(termNameCell))
              : 'Untitled Term';

            const gradePoints = tds[1] ? text(tds[1]) : 'N/A';
            const cumulativeGP = tds[2] ? text(tds[2]) : 'N/A';
            const attemptedCH = tds[3] ? text(tds[3]) : 'N/A';
            const earnedCH = tds[4] ? text(tds[4]) : 'N/A';
            const cumulativeCH = tds[5] ? text(tds[5]) : 'N/A';
            const sgpa = tds[6] ? text(tds[6]) : 'N/A';
            const cgpa = tds[7] ? text(tds[7]) : 'N/A';

            // collect following child rows until next parent row
            const details = [];
            let j = i + 1;
            for (; j < rows.length; j++) {
              const sib = rows[j];
              if (sib.classList.contains('table-parent-row')) break;
              // skip header-like child row that uses <th>
              if (sib.querySelectorAll('th').length) continue;
              if (!sib.classList.contains('table-child-row')) continue;

              const childTds = Array.from(sib.querySelectorAll('td, th'));
              const courseName = childTds[0] ? text(childTds[0]) : 'Untitled Course';
              const creditHours = childTds[1] ? text(childTds[1]) : '0.0';
              const gradePts = childTds[2] ? text(childTds[2]) : '0.0';
              const finalGrade = childTds[3] ? text(childTds[3]) : 'N/A';

              details.push({
                courseName,
                creditHours,
                gradePts,
                finalGrade
              });
            }

            terms.push({
              termName,
              gradePoints,
              cumulativeGP,
              attemptedCH,
              earnedCH,
              cumulativeCH,
              sgpa,
              cgpa,
              details
            });

            i = j - 1; // advance outer loop
          }
        }

        // return reversed so latest term is first
        return terms.reverse();
      } catch (err) {
        console.error('parseTranscriptTable: unexpected error', err);
        return [];
      }
    }

    function extractObeResults(selector = '.table_tree') {
      try {
        const table = document.querySelectorAll(selector)[1];
        if (!table) {
          console.warn('extractObeResults: table not found');
          return [];
        }

        const rows = Array.from(table.querySelectorAll('tbody > tr'));
        const results = rows.map(row => {
          const cells = Array.from(row.querySelectorAll('td')).map(td =>
            td.textContent.trim()
          );
          return {
            code: cells[0] || 'N/A',
            ploPoints: cells[1] || '0.0',
            ploLevel: cells[2] || '0.0',
            attainment: cells[3] || '0.0',
            description: cells[4] || 'N/A'
          };
        });

        return results;
      } catch (err) {
        console.error('extractObeResults: unexpected error', err);
        return [];
      }
    }


    const coursesInfo = extractCoursesInfo();
    const results = parseTranscriptTable();
    const obeResults = extractObeResults();

    // Insert Tabs
    const parentContainer = document.querySelector('#page_content_inner');
    parentContainer.insertAdjacentHTML('beforebegin', `
    
    <div style="justify-items: center;">

  <!-- Glass Tab Bar -->
  <div class="glass-tabs-bar">
    <div class="glass-tabs-tab glass-tabs-active" data-tab="glass-tabs-active-courses">
      <span class="material-icons">play_circle_filled</span>
      Active Courses
    </div>
    <div class="glass-tabs-tab" data-tab="glass-tabs-previous-courses">
      <span class="material-icons">history</span>
      Previous Courses
    </div>
    <div class="glass-tabs-tab" data-tab="glass-tabs-obe-result">
      <span class="material-icons">assessment</span>
      OBE Result
    </div>
    <div class="glass-tabs-indicator"></div>
  </div>

  <!-- Content Sections -->
  <div id="glass-tabs-active-courses" class="glass-tabs-content glass-tabs-active">
    <h2>Current Results</h2>
    <p style="margin: 2rem 0;">You are currently enrolled in ${coursesInfo.length} courses. Way to go champ! 🚀 Click down below to get results</p>

<div class="gmc-container">

      ${coursesInfo.map(item => {
      return `
         <a href="${item.courseLink}" class="gmc-card">
          <div class="gmc-title">${item.courseName}</div>
          <div class="gmc-instructor">${item.courseInstructor}</div>
          <div class="gmc-details">${item.courseCode} | Credits: ${item.courseCredits}</div>
          <span class="gmc-status">${item.courseStatus}</span>
        </a>
      `;
    }).join('')}

  </div>
  </div>

  <div id="glass-tabs-previous-courses" class="glass-tabs-content">
    <div class="gmg-app">
<!-- floating download -->
<a class="gmg-download-btn" href="/student/unofficial/transcript/download" aria-label="Download Unofficial Transcript" title="Download Unofficial Transcript">
<span class="material-icons gmg-icon-download">cloud_download</span>
<div class="gmg-tip">Download Unofficial Transcript</div>
</a>


<!-- Term header -->
<div class="gmg-term-card gmg-fade-in" id="gmg-termCard">
<div class="gmg-term-left">
<div class="gmg-nav-btn" id="gmg-prevBtn" title="Previous term" role="button"><span class="material-icons">chevron_left</span></div>
<div>
<div class="gmg-term-title" id="gmg-termName">Term</div>
<div class="gmg-term-sub" id="gmg-termSubtitle">—</div>
</div>
</div>


<div class="gmg-term-meta" id="gmg-termMeta"></div>


<div style="display:flex;align-items:center;gap:12px">
<div class="gmg-nav-btn" id="gmg-nextBtn" title="Next term" role="button"><span class="material-icons">chevron_right</span></div>
</div>
</div>


<!-- stats area -->
<div class="gmg-term-card gmg-fade-in" style="flex-direction:column;gap:12px">
<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
<div style="font-weight:700">Term Summary</div>
<div style="font-size:13px;color:var(--muted)">Overview of grade points and credits</div>
</div>


<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">
<div class="gmg-stats-wrap" id="gmg-statsWrap" style="flex:1"></div>


<div style="display:flex;flex-direction:column;gap:10px;align-items:center">
<div class="gmg-progress-wrap">
<div class="gmg-progress" id="gmg-sgpaWrap" title="SGPA"></div>
<div class="gmg-progress" id="gmg-cgpaWrap" title="CGPA"></div>
</div>
<div style="font-size:12px;color:var(--muted);">Progress out of 4.00</div>
</div>
</div>
</div>


<!-- details -->
<div class="gmg-details-card gmg-fade-in">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
<div style="font-weight:700">Course Details</div>
<div style="font-size:13px;color:var(--muted)">List of courses and grades</div>
</div>
<div class="gmg-course-list" id="gmg-courseList"></div>
</div>
</div>
  </div>

<div id="glass-tabs-obe-result" class="obe-wrap">
    <div class="obe-card" id="obe-card-root">
      <div class="obe-header">
        <div>
          <div class="obe-title">PLO Attainment — Summary</div>
          <div class="obe-sub" id="obe-sub">Overall Program Learning Outcomes</div>
        </div>

        <div class="obe-controls">
          <input class="obe-search" id="obe-search" placeholder="Search PLO or description..." />
          <button class="obe-btn" id="obe-sort-btn" title="Sort by attainment (desc)"><span class="material-icons">swap_vert</span> Sort</button>

          <!-- Download link requested by user -->
          <a class="obe-download-link" id="obe-download-link" href="/student/download/plo/transcript" title="Download PLO Transcript">
            <span class="material-icons">cloud_download</span>
            <span>Download</span>
          </a>

          <div class="obe-badge" id="obe-count">0 items</div>
        </div>
      </div>

      <div class="obe-table-wrap" id="obe-table-wrap">
        <table class="obe-table" id="obe-table" role="table">
          <thead>
            <tr>
              <th style="min-width:120px">PLO Code</th>
              <th style="min-width:320px">Description</th>
              <th style="width:120px">PLO Points</th>
              <th style="width:90px">PLO Level</th>
              <th style="width:260px">Attainment (%)</th>
            </tr>
          </thead>
          <tbody id="obe-tbody"></tbody>
        </table>
      </div>

      <div class="obe-footer">
        <div class="obe-meta" id="obe-stats">Showing 0 of 0 PLOs</div>
      </div>
    </div>
  </div>
  </div>


    
    `)


    // Color the courses
    // Define some distinct gradient backgrounds
    const gradients = [
      "linear-gradient(135deg, rgba(255,99,132,0.2), rgba(255,159,64,0.25))",
      "linear-gradient(135deg, rgba(54,162,235,0.2), rgba(153,102,255,0.25))",
      "linear-gradient(135deg, rgba(75,192,192,0.2), rgba(255,206,86,0.25))",
      "linear-gradient(135deg, rgba(201,90,255,0.2), rgba(255,90,160,0.25))",
      "linear-gradient(135deg, rgba(0,242,254,0.2), rgba(67,233,123,0.25))",
      "linear-gradient(135deg, rgba(255,0,132,0.2), rgba(255,206,86,0.25))",
      "linear-gradient(135deg, rgba(72,219,251,0.2), rgba(255,159,243,0.25))",
      "linear-gradient(135deg, rgba(253,200,48,0.2), rgba(243,115,53,0.25))"
    ]
    // Apply to each card
    document.querySelectorAll(".gmc-card").forEach((card, index) => {
      const gradient = gradients[index % gradients.length];
      card.style.background = gradient;
      card.style.backdropFilter = "blur(15px)";
      card.style.webkitBackdropFilter = "blur(15px)";
    });




    const glassTabs = document.querySelectorAll('.glass-tabs-tab');
    const glassIndicator = document.querySelector('.glass-tabs-indicator');
    const glassContents = document.querySelectorAll('.glass-tabs-content');

    function updateIndicator(index) {
      const isMobile = window.innerWidth <= 600;
      if (isMobile) {
        // Vertical mode
        glassIndicator.style.transform = `translateY(${index * 100}%)`;
      } else {
        // Horizontal mode
        glassIndicator.style.transform = `translateX(${index * 100}%)`;
      }
    }

    glassTabs.forEach((tab, index) => {
      tab.addEventListener('click', () => {
        glassTabs.forEach(t => t.classList.remove('glass-tabs-active'));
        tab.classList.add('glass-tabs-active');

        updateIndicator(index);

        glassContents.forEach(c => c.classList.remove('glass-tabs-active'));
        document.getElementById(tab.dataset.tab).classList.add('glass-tabs-active');
      });
    });

    // Ensure correct indicator on resize
    window.addEventListener('resize', () => {
      const activeIndex = Array.from(glassTabs).findIndex(t =>
        t.classList.contains('glass-tabs-active')
      );
      if (activeIndex >= 0) updateIndicator(activeIndex);
    });

    // Initialize position
    updateIndicator(0);







    // Second Tab
    const safe = (obj, key, fallback = 'N/A') => (obj && obj[key] !== undefined && obj[key] !== null) ? obj[key] : fallback;

    const termNameEl = document.getElementById('gmg-termName');
    const termSubtitleEl = document.getElementById('gmg-termSubtitle');
    const termMetaEl = document.getElementById('gmg-termMeta');
    const statsWrap = document.getElementById('gmg-statsWrap');
    const sgpaWrap = document.getElementById('gmg-sgpaWrap');
    const cgpaWrap = document.getElementById('gmg-cgpaWrap');
    const courseList = document.getElementById('gmg-courseList');
    const prevBtn = document.getElementById('gmg-prevBtn');
    const nextBtn = document.getElementById('gmg-nextBtn');

    let idx = 0;

    function renderIndex(i) {
      if (!Array.isArray(results) || results.length === 0) {
        termNameEl.textContent = 'No terms available';
        termSubtitleEl.textContent = '';
        statsWrap.innerHTML = '';
        courseList.innerHTML = '';
        sgpaWrap.innerHTML = '';
        cgpaWrap.innerHTML = '';
        prevBtn.setAttribute('aria-disabled', 'true'); nextBtn.setAttribute('aria-disabled', 'true');
        return;
      }

      idx = Math.max(0, Math.min(i, results.length - 1));
      const term = results[idx] || {};

      // header
      termNameEl.textContent = safe(term, 'termName', 'Untitled Term');
      termSubtitleEl.textContent = `Showing term ${idx + 1} of ${results.length}`;

      // small header meta (cumulative GP + CH)
      termMetaEl.innerHTML = '';
      const metaPairs = [
        ['Grade Points', safe(term, 'gradePoints', '0')],
        ['Cumulative GP', safe(term, 'cumulativeGP', '0')],
        ['Attempted CH', safe(term, 'attemptedCH', '0')]
      ];
      metaPairs.forEach(([label, val]) => {
        const el = document.createElement('div'); el.className = 'gmg-meta-item';
        el.innerHTML = `<div class="gmg-label">${label}</div><div class="gmg-value">${val}</div>`;
        termMetaEl.appendChild(el);
      });

      // stats grid
      statsWrap.innerHTML = '';
      const stats = [
        { k: 'gradePoints', label: 'Grade Pts', glow: 'gmg-glow-a', card: 'gmg-stat-a' },
        { k: 'cumulativeGP', label: 'Cum. GP', glow: 'gmg-glow-b', card: 'gmg-stat-b' },
        { k: 'attemptedCH', label: 'Attempted CH', glow: 'gmg-glow-c', card: 'gmg-stat-c' },
        { k: 'earnedCH', label: 'Earned CH', glow: 'gmg-glow-d', card: 'gmg-stat-d' },
      ];
      stats.forEach(s => {
        const card = document.createElement('div'); card.className = `gmg-stat-card ${s.glow} ${s.card}`;
        const val = safe(term, s.k, 'N/A');
        card.innerHTML = `<div class="gmg-stat-label">${s.label}</div><div class="gmg-stat-value">${val}</div>`;
        statsWrap.appendChild(card);
      });

      // SGPA / CGPA progress
      makeProgress(sgpaWrap, parseFloat(safe(term, 'sgpa', 0)), 'SGPA');
      makeProgress(cgpaWrap, parseFloat(safe(term, 'cgpa', 0)), 'CGPA');

      // course list
      courseList.innerHTML = '';
      const details = Array.isArray(term.details) ? term.details : [];
      if (details.length === 0) {
        courseList.innerHTML = '<div style="color:var(--muted)">No courses found for this term.</div>';
      }

      details.forEach((c, ci) => {
        const name = safe(c, 'courseName', 'Untitled Course');
        const credits = safe(c, 'creditHours', '0');
        const pts = safe(c, 'gradePts', '0');
        const grade = safe(c, 'finalGrade', 'N/A');

        const box = document.createElement('div'); box.className = 'gmg-course';
        // choose icon letter and grade class
        const iconLetter = name.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase().slice(0, 2);
        const gradeCls = gradeToClass(grade);

        box.innerHTML = `
          <div class="gmg-icon" style="background:${/^A/.test(grade) ? "#50ff6a59" : (/^B/.test(grade) ? "#509eff59" : "#ff7f5059")};border:1px solid rgba(10,20,60,0.03)"><span style="font-weight:700">${iconLetter}</span></div>
          <div class="gmg-info">
            <div class="gmg-name">${name}</div>
            <div class="gmg-meta"> <span>Credits: ${credits}</span> <span>GradePts: ${pts}</span> </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <div class="gmg-grade-pill ${gradeCls}">${grade}</div>
            <div style="font-size:11px;color:var(--muted)">${gradeDescription(grade)}</div>
          </div>
        `;

        // small flair for excellent grades
        if (/^A/.test(grade)) {
          const sparkle = document.createElement('div');
          sparkle.style.position = 'absolute'; sparkle.style.right = '8px'; sparkle.style.top = '8px';
          sparkle.innerHTML = '<span class="material-icons" style="font-size:14px;color:#06b06a">sparkles</span>';
          box.appendChild(sparkle);
        }

        courseList.appendChild(box);
      });

      // nav buttons enable/disable
      prevBtn.setAttribute('aria-disabled', idx === 0 ? 'true' : 'false');
      nextBtn.setAttribute('aria-disabled', idx === results.length - 1 ? 'true' : 'false');
    }

    function gradeToClass(g) {
      if (!g) return 'gmg-grade-other';
      if (/^A|A\+/.test(g)) return 'gmg-grade-A';
      if (/^B/.test(g)) return 'gmg-grade-B';
      if (/^C|D|F|S/.test(g)) return 'gmg-grade-C';
      return 'gmg-grade-other';
    }
    function gradeDescription(g) {
      if (!g) return '';
      if (/^A|A\+/.test(g)) return 'Excellent';
      if (/^B\+|B/.test(g)) return 'Good';
      if (/^C\+|C-|C/.test(g)) return 'Needs Improvement';
      if (/^D/.test(g)) return 'Barely Passing';
      if (/^F/.test(g)) return 'Fail';
      if (/^S/.test(g)) return 'Satisfactory/Pass';
      return '';
    }

    function makeProgress(container, value, label) {
      container.innerHTML = '';
      const v = (isFinite(value) ? value : 0);
      const pct = Math.max(0, Math.min(100, (v / 4) * 100));
      const stroke = 8;
      const size = 96;
      const r = (size - stroke) / 2;
      const circ = 2 * Math.PI * r;
      const offset = circ * (1 - pct / 100);

      // color rule
      let color = '#16a34a'; // green
      if (v <= 2.0) color = '#ef4444';
      else if (v <= 3.0) color = '#f59e0b';

      const svg = `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden>
          <defs>
            <linearGradient id="gmg-g-${label}" x1="0%" x2="100%">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.95"/>
              <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.95"/>
            </linearGradient>
          </defs>
          <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke="rgba(15,23,42,0.06)" fill="none" />
          <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke="url(#gmg-g-${label})" stroke-linecap="round" fill="none"
            stroke-dasharray="${circ}" stroke-dashoffset="${circ}" style="transition:stroke-dashoffset .9s cubic-bezier(.2,.9,.25,1), stroke .3s" />
        </svg>
      `;

      const wrapper = document.createElement('div'); wrapper.innerHTML = svg;
      // number + label grouped inside
      const inner = document.createElement('div'); inner.className = 'gmg-inner';
      const num = document.createElement('div'); num.className = 'gmg-num'; num.textContent = isFinite(v) ? v.toFixed(2) : '0.00';
      const lab = document.createElement('div'); lab.className = 'gmg-label'; lab.textContent = label;
      inner.appendChild(num); inner.appendChild(lab);

      container.appendChild(wrapper);
      container.appendChild(inner);

      // animate stroke after adding to DOM
      requestAnimationFrame(() => {
        const circEl = container.querySelector('circle[stroke-dasharray]');
        if (circEl) {
          circEl.style.strokeDashoffset = offset;
        }
      });

      // set color highlight for outer container
      container.style.filter = 'drop-shadow(0 6px 18px rgba(59,130,246,0.06))';
    }

    // interactions
    prevBtn.addEventListener('click', () => { renderIndex(idx - 1) });
    nextBtn.addEventListener('click', () => { renderIndex(idx + 1) });
    // keyboard
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') renderIndex(idx - 1);
      if (e.key === 'ArrowRight') renderIndex(idx + 1);
    });

    // initial render
    renderIndex(0);

    // expose for debugging
    window.__gmgGradeResults = results;




    // OBE results
    const obeSafe = (o, k, fb = 'N/A') => (o && o[k] !== undefined && o[k] !== null) ? o[k] : fb;
    const tbody = document.getElementById('obe-tbody');
    const countEl = document.getElementById('obe-count');
    const statsEl = document.getElementById('obe-stats');
    const searchEl = document.getElementById('obe-search');
    const sortBtn = document.getElementById('obe-sort-btn');

    // render state
    let obeState = { items: Array.from(obeResults), sortDesc: true, query: '' };

    // helpers
    function fmtNum(v) {
      const n = parseFloat(v);
      if (!isFinite(n)) return String(v);
      return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
    }

    function getColorForAtt(v) {
      if (!isFinite(v)) return 'linear-gradient(90deg,#9ca3ff,#6ee7b7)';
      if (v <= 60) return `linear-gradient(90deg, ${getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#ef4444'}, #fb7185)`;
      if (v <= 75) return `linear-gradient(90deg, ${getComputedStyle(document.documentElement).getPropertyValue('--warn') || '#f59e0b'}, #fb923c)`;
      return `linear-gradient(90deg, ${getComputedStyle(document.documentElement).getPropertyValue('--success') || '#16a34a'}, #34d399)`;
    }

    function renderTable() {
      const items = obeState.items.filter(it => {
        const q = obeState.query.trim().toLowerCase();
        if (!q) return true;
        return (obeSafe(it, 'code', '') + ' ' + obeSafe(it, 'description', '')).toLowerCase().includes(q);
      }).slice();

      // sort
      items.sort((a, b) => {
        const av = parseFloat(obeSafe(a, 'attainment', 0));
        const bv = parseFloat(obeSafe(b, 'attainment', 0));
        return obeState.sortDesc ? bv - av : av - bv;
      });

      tbody.innerHTML = '';
      items.forEach(it => {
        const code = obeSafe(it, 'code', '-');
        const desc = obeSafe(it, 'description', '-');
        const points = obeSafe(it, 'ploPoints', '0');
        const level = obeSafe(it, 'ploLevel', '0');
        const att = parseFloat(obeSafe(it, 'attainment', '0'));
        const attPct = isFinite(att) ? att : 0;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="obe-plo">${escapeHtml(code)}</td>
          <td class="obe-desc">${escapeHtml(desc)}</td>
          <td class="obe-points">${escapeHtml(fmtNum(points))}</td>
          <td class="obe-level">${escapeHtml(fmtNum(level))}</td>
          <td style="padding:12px 12px">
            <div class="obe-progress-outer" aria-hidden>
              <div class="obe-progress-inner" style="width:${Math.max(0, Math.min(100, attPct))}% ; background:${getColorForAtt(attPct)}">${isFinite(attPct) ? attPct.toFixed(2) + '%' : 'N/A'}</div>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });

      // update counts
      countEl.textContent = `${items.length} items`;
      statsEl.textContent = `Showing ${items.length} of ${obeResults.length} PLOs`;
    }

    // simple HTML-escape
    function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    // interactions
    searchEl.addEventListener('input', e => { obeState.query = e.target.value; renderTable(); });
    sortBtn.addEventListener('click', () => { obeState.sortDesc = !obeState.sortDesc; sortBtn.title = obeState.sortDesc ? 'Sort by attainment (desc)' : 'Sort by attainment (asc)'; renderTable(); });

    // initial render
    renderTable();

    // expose for debugging
    window.__obeResults = obeResults;
    window.__obeRender = renderTable;

  }

})

