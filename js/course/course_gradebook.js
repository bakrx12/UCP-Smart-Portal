function extractGradeBookFromTabs(selector = "#tabs_anim1") {
  try {
    const root = document.querySelector(selector);
    if (!root) {
      console.warn("extractGradeBookFromTabs: selector not found:", selector);
      return [];
    }

    // find the table inside the selector (defensive)
    const table =
      root.querySelector("table.table_tree") || root.querySelector("table");
    if (!table) {
      console.warn(
        "extractGradeBookFromTabs: table not found inside",
        selector,
      );
      return [];
    }

    const rows = Array.from(table.querySelectorAll("tbody > tr"));
    const results = [];

    // helper to get trimmed text or empty string
    const txt = (el) =>
      el
        ? String(el.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
        : "";

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // parent rows have class 'table-parent-row'
      if (!row.classList.contains("table-parent-row")) continue;

      // assessment type and weightage are inside the first td (anchor + badge)
      const firstTd = row.querySelector("td") || row.querySelector("th");
      let assessmentType = "";
      let weightage = "";

      if (firstTd) {
        const anchor = firstTd.querySelector("a") || firstTd;
        // extract badge text if present
        const badge =
          anchor.querySelector(
            ".uk-badge, .md-bg-orange-800, .uk-badge-success, .uk-badge-danger",
          ) || null;
        if (badge) {
          weightage = txt(badge).replace("%", "").trim(); // remove % if present
        } else {
          // try to find numeric inside the td if badge missing
          const possible = txt(firstTd).match(/([0-9]+(?:\.[0-9]+)?)\s*%?/);
          if (possible) weightage = possible[1];
        }

        // clone the anchor and remove the badge element to extract a clean assessment name
        try {
          const clone = anchor.cloneNode(true);
          const b = clone.querySelector(
            ".uk-badge, .md-bg-orange-800, .uk-badge-success, .uk-badge-danger",
          );
          if (b) b.remove();
          assessmentType = txt(clone);
        } catch (e) {
          assessmentType = txt(anchor);
        }
      }

      // second cell: obtained percentage for the section
      const secondTd = row.querySelectorAll("td, th")[1];
      const obtainedPercentage = txt(secondTd);

      // collect following child rows until next parent row
      const details = [];
      let j = i + 1;
      for (; j < rows.length; j++) {
        const r = rows[j];
        // stop when encounter next parent row
        if (r.classList.contains("table-parent-row")) break;

        // skip header-like child row that uses <th>
        if (r.querySelectorAll("th").length) continue;

        // only consider table-child-row rows
        if (!r.classList.contains("table-child-row")) continue;

        const tds = Array.from(r.querySelectorAll("td, th"));
        if (tds.length < 5) {
          // skip malformed/empty child row
          continue;
        }

        const assessment = txt(tds[0]);
        const maxMark = txt(tds[1]);
        const obtainedMarks = txt(tds[2]);
        const classAverage = txt(tds[3]);
        const percentage = txt(tds[4]);

        // push detail object (keep values as strings)
        details.push({
          assessment,
          maxMark,
          obtainedMarks,
          classAverage,
          percentage,
        });
      }

      results.push({
        assessmentType: assessmentType || "Untitled",
        weightage: weightage || "0.0",
        obtainedPercentage: obtainedPercentage || "0.0",
        details,
      });

      // advance outer loop to the last child processed
      i = j - 1;
    }

    return results;
  } catch (err) {
    console.error("extractGradeBookFromTabs: unexpected error", err);
    return [];
  }
}

const parentNode = document.querySelector(".course-header");
parentNode.insertAdjacentHTML(
  "afterend",
  `
     <div class="ggb-wrap">
    <div class="ggb-card" id="ggb-root">
      <div class="ggb-header">
        <div class="ggb-title">
          <span class="material-icons">grade</span>
          <div>
            <h1>Gradebook Summary</h1>
            <div class="ggb-sub">Assessment overview & weightage</div>
          </div>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <div class="ggb-sum-card">
            <div class="ggb-sum-title">Overall Obtained %</div>
            <div class="ggb-sum-value" id="ggb-overall-obtained">—</div>
          </div>
          <div class="ggb-sum-card">
            <div class="ggb-sum-title">Class Average %</div>
            <div class="ggb-sum-value" id="ggb-overall-classavg">—</div>
          </div>
          <div class="ggb-final-grade ggb-sum-card" id="ggb-final-grade">
            <div class="ggb-final-value" id="ggb-final-grade-val">—</div>
            <div class="ggb-final-label">Final Grade</div>
          </div>
        </div>
      </div>

      <div class="ggb-list" id="ggb-list">
        <!-- rows inserted by JS -->
      </div>

      <div class="ggb-note">Hover progress circles to see percentage. Values are computed from raw assessment details.</div>
    </div>
  </div>
`,
);

/*

// Sample Gradebook array for representation
const gradeBook = [
  {
    assessmentType: "Class Participation",
    weightage: "5.0",
    obtainedPercentage: "90.00",
    details: [
      { assessment: "Class Participation 1", maxMark: "5.0", obtainedMarks: "5.00", classAverage: "3.54", percentage: "100.00" },
      { assessment: "Class Participation 2", maxMark: "5.0", obtainedMarks: "4.0", classAverage: "3.0", percentage: "80.00" }
    ]
  },
  {
    assessmentType: "Quizzes",
    weightage: "15.0",
    obtainedPercentage: "69.09",
    details: [
      { assessment: "Quiz 1", maxMark: "10.0", obtainedMarks: "8.00", classAverage: "6.64", percentage: "80.00" },
      { assessment: "Quiz 2", maxMark: "20.0", obtainedMarks: "10.0", classAverage: "15.0", percentage: "50.00" },
      { assessment: "Quiz 3", maxMark: "20.0", obtainedMarks: "15.0", classAverage: "18.0", percentage: "75.00" },
      { assessment: "Quiz 4", maxMark: "5.0", obtainedMarks: "5.0", classAverage: "4.0", percentage: "100.00" }
    ]
  }
];
*/

const gradeBook = extractGradeBookFromTabs();

/* Utility helpers (namespaced) */
const ggb = {
  pnum(v, dp = 2) {
    // parse number and format
    const n = Number(String(v).replace(/,/g, ""));
    if (!isFinite(n)) return 0;
    return Math.round(n * Math.pow(10, dp)) / Math.pow(10, dp);
  },
  fmt(v, dp = 2) {
    return ggb.pnum(v, dp).toFixed(dp);
  },
  chooseColorClass(p) {
    // p as percent number
    if (p > 80) return "ggb-clr-success";
    if (p > 70) return "ggb-clr-orange";
    if (p > 60) return "ggb-clr-gold";
    if (p > 55) return "gbb-clr-yellow";
    return "ggb-clr-danger";
  },
  computeFinalGrade(percent) {
    // return grade label and css class
    if (percent >= 90) return ["A+", "ggb-grade-Aplus"];
    if (percent >= 85) return ["A", "ggb-grade-A"];
    if (percent >= 80) return ["A-", "ggb-grade-Aminus"];
    if (percent >= 75) return ["B+", "ggb-grade-Bplus"];
    if (percent >= 70) return ["B", "ggb-grade-B"];
    if (percent >= 65) return ["B-", "ggb-grade-Bminus"];
    if (percent >= 60) return ["C+", "ggb-grade-Cplus"];
    if (percent >= 55) return ["C", "ggb-grade-C"];
    if (percent >= 50) return ["C-", "ggb-grade-Cminus"];
    return ["N/A", "ggb-grade-low"];
  },
};

/* Core rendering */
(function renderGradebook(data) {
  const listEl = document.getElementById("ggb-list");

  // compute global totals across all details
  let totalMaxAll = 0;
  let totalObtainedAll = 0;
  let totalClassAvgAll = 0;

  // we'll precompute per-assessment metrics
  const metrics = data.map((section) => {
    const details = Array.isArray(section.details) ? section.details : [];
    let sumMax = 0,
      sumObtained = 0,
      sumClassAvg = 0;
    details.forEach((d) => {
      const max = Number(d.maxMark) || 0;
      const obt = Number(d.obtainedMarks) || 0;
      const cavg = Number(d.classAverage) || 0;
      sumMax += max;
      sumObtained += obt;
      sumClassAvg += cavg;
    });

    totalMaxAll += sumMax;
    totalObtainedAll += sumObtained;
    totalClassAvgAll += sumClassAvg;

    // obtained % for this section if sumMax>0
    const pctObtained = sumMax > 0 ? (sumObtained / sumMax) * 100 : 0;
    const pctClassAvg = sumMax > 0 ? (sumClassAvg / sumMax) * 100 : 0;

    // weightage derived values
    const weight = Number(section.weightage) || 0;
    const secObtPct = Number(section.obtainedPercentage) || pctObtained; // fallback
    const obtainedWeightageValue = (secObtPct / 100) * weight;
    const obtainedWeightPct =
      weight > 0 ? (obtainedWeightageValue / weight) * 100 : 0;

    return {
      assessmentType: section.assessmentType || "Untitled",
      weightage: weight,
      sumMax,
      sumObtained,
      sumClassAvg,
      pctObtained,
      pctClassAvg,
      obtainedWeightageValue,
      obtainedWeightPct,
      details,
    };
  });

  // render rows
  metrics.forEach((m, idx) => {
    const row = document.createElement("div");
    row.className = "ggb-row";
    // create columns:
    // col1: name
    // col2: weight
    // col3: obtained marks circle
    // col4: class avg circle
    // col5: obtained weightage circle
    const colName = document.createElement("div");
    colName.className = "ggb-row-head";
    colName.innerHTML = `
      <div class="ggb-icon" aria-hidden><span class="material-icons">playlist_add_check</span></div>
      <div>
        <div class="ggb-type">${escapeHtml(m.assessmentType)}</div>
        <div class="ggb-subtype" style="color:var(--ggb-muted);font-size:13px;margin-top:4px">Items: ${m.details.length}</div>
      </div>
    `;

    const colWeight = document.createElement("div");
    colWeight.className = "ggb-weight";
    colWeight.textContent = `${ggb.fmt(m.weightage, 1)} wt`;

    // circle generator helper
    function createCircle(numerator, denominator, percent, label) {
      const wrap = document.createElement("div");
      wrap.className = "ggb-circle-wrap";
      // size and circle constants
      const size = 90;
      const stroke = 10;
      const radius = (size - stroke) / 2;
      const circumference = 2 * Math.PI * radius;
      // clamp percent
      const pct = Math.max(0, Math.min(100, Number(percent) || 0));
      const offset = circumference * (1 - pct / 100);

      // pick color class
      const colorClass = ggb.chooseColorClass(pct);

      // build svg
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("width", size);
      svg.setAttribute("height", size);
      svg.classList.add("ggb-circle-svg");

      const bg = document.createElementNS(svgNS, "circle");
      bg.setAttribute("cx", size / 2);
      bg.setAttribute("cy", size / 2);
      bg.setAttribute("r", radius);
      bg.setAttribute("class", "ggb-circle-bg");
      bg.setAttribute("stroke-width", stroke);
      svg.appendChild(bg);

      const fg = document.createElementNS(svgNS, "circle");
      fg.setAttribute("cx", size / 2);
      fg.setAttribute("cy", size / 2);
      fg.setAttribute("r", radius);
      fg.setAttribute("class", "ggb-circle-fg");
      fg.setAttribute("stroke-width", stroke);
      fg.setAttribute("stroke-dasharray", circumference);
      fg.setAttribute("stroke-dashoffset", offset);
      fg.classList.add(colorClass);
      svg.appendChild(fg);

      const inner = document.createElement("div");
      inner.className = "ggb-circle-text";
      inner.innerHTML = `<div class="num">${ggb.fmt(numerator, Number(denominator) % 1 === 0 ? 0 : 2)}</div><div class="den">/ ${ggb.fmt(denominator, Number(denominator) % 1 === 0 ? 0 : 2)}</div>`;

      const tooltip = document.createElement("div");
      tooltip.className = "ggb-tooltip";
      tooltip.textContent = `${ggb.fmt(pct, 2)}%`;

      wrap.appendChild(tooltip);
      wrap.appendChild(svg);
      wrap.appendChild(inner);

      // label under circle
      const circleLabel = document.createElement("div");
      circleLabel.className = "ggb-circle-label";
      circleLabel.textContent = label;

      // container with label stacked
      const container = document.createElement("div");
      container.style.display = "flex";
      container.style.flexDirection = "column";
      container.style.alignItems = "center";
      container.style.gap = "6px";
      container.appendChild(wrap);
      container.appendChild(circleLabel);

      return container;
    }

    const colObtMarks = createCircle(
      m.sumObtained,
      m.sumMax || 1,
      m.pctObtained,
      "Obtained Marks",
    );
    const colClassAvg = createCircle(
      m.sumClassAvg,
      m.sumMax || 1,
      m.pctClassAvg,
      "Class Average",
    );
    const colWeightObt = createCircle(
      m.obtainedWeightageValue,
      m.weightage || 1,
      m.obtainedWeightPct,
      "Weightage",
    );

    // append all columns
    row.appendChild(colName);
    row.appendChild(colWeight);
    row.appendChild(colObtMarks);
    row.appendChild(colClassAvg);
    row.appendChild(colWeightObt);

    listEl.appendChild(row);
  });

  // compute overall metrics & final grade
  const overallObtPct =
    totalMaxAll > 0 ? (totalObtainedAll / totalMaxAll) * 100 : 0;
  const overallClassAvgPct =
    totalMaxAll > 0 ? (totalClassAvgAll / totalMaxAll) * 100 : 0;

  document.getElementById("ggb-overall-obtained").textContent =
    `${ggb.fmt(overallObtPct, 2)}%`;
  document.getElementById("ggb-overall-classavg").textContent =
    `${ggb.fmt(overallClassAvgPct, 2)}%`;

  const [gradeLabel, gradeClass] = ggb.computeFinalGrade(overallObtPct);
  const gradeEl = document.getElementById("ggb-final-grade");
  const valEl = document.getElementById("ggb-final-grade-val");
  valEl.textContent = gradeLabel;
  // remove previous grade classes
  gradeEl.className = "ggb-final-grade ggb-sum-card " + gradeClass;
})(gradeBook);

/* small helper to escape HTML where used */
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
