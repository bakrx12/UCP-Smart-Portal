chrome.storage.local.get('toggle_power', (result) => {
  const enabled = result['toggle_power'];

  if (!enabled) return;

  /***************************************************************************
   * UTILITIES
   ***************************************************************************/
  function hash(str) {
    let h = 0;
    if (!str) return 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function text(el) {
    if (!el) return '';
    return el.textContent.replace(/\s+/g, ' ').trim();
  }
  function html(el) {
    if (!el) return '';
    return el.innerHTML.trim();
  }

  function normalizeAmount(s) {
    if (s === null || s === undefined) return s;
    const cleaned = String(s).replace(/,/g, '').trim();
    return cleaned;
  }

  function parseDateForSort(s) {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function formatDate(s) {
    try {
      if (!s) return '-';
      const d = new Date(s);
      if (isNaN(d)) return s;
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return s; }
  }

  function formatAmount(a) {
    try {
      const n = parseFloat(a);
      if (!isFinite(n)) return String(a);
      return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (e) { return a; }
  }

  function safe(o, k, fb = 'N/A') { return (o && o[k] !== undefined && o[k] !== null) ? o[k] : fb; }

  /***************************************************************************
   * EXTRACT INVOICES (from page table)
   * Keeps original robust parsing behaviour but simplified helper usage.
   ***************************************************************************/
  function extractInvoices(selector = '.md-card-content .uk-overflow-container .table_check', options = { sortLatestFirst: true }) {
    try {
      const table = document.querySelector(selector);
      if (!table) {
        console.warn('extractInvoices: table not found for selector', selector);
        return [];
      }

      const rows = Array.from(table.querySelectorAll('tbody > tr'));
      const out = rows.map(row => {
        const tds = Array.from(row.querySelectorAll('td, th'));

        const invoiceDate = tds[0] ? text(tds[0]) : '';
        const dueDate = tds[1] ? text(tds[1]) : '';
        const term = tds[2] ? text(tds[2]) : '';
        const semester = tds[3] ? text(tds[3]) : '';
        const challanType = tds[4] ? text(tds[4]) : '';
        const challanID = tds[5] ? text(tds[5]) : '';
        const scholarshipPercent = tds[6] ? text(tds[6]) : '';
        const payableAmount = tds[7] ? normalizeAmount(text(tds[7])) : '0';
        const status = tds[8] ? text(tds[8]) : '';
        const printButtonHTML = tds[9] ? html(tds[9]) : '';
        const actionHTML = tds[10] ? html(tds[10]) : '';
        const paidDate = tds[11] ? text(tds[11]) : '';

        return {
          invoiceDate,
          dueDate,
          term,
          semester,
          challanType,
          challanID,
          scholarshipPercent,
          payableAmount,
          status,
          printButtonHTML,
          actionHTML,
          paidDate
        };
      });

      if (options && options.sortLatestFirst) {
        out.sort((a, b) => {
          const da = parseDateForSort(a.invoiceDate) || new Date(0);
          const db = parseDateForSort(b.invoiceDate) || new Date(0);
          return db - da;
        });
      }

      return out;
    } catch (err) {
      console.error('extractInvoices: unexpected error', err);
      return [];
    }
  }

  /***************************************************************************
   * PASTEL GLASS GRADIENTS (stable by term)
   ***************************************************************************/
  function termGradient(term) {
    const pastelGradients = [
      "linear-gradient(135deg, rgba(255,228,225,0.75), rgba(255,182,193,0.75))",
      "linear-gradient(135deg, rgba(240,248,255,0.75), rgba(224,255,255,0.75))",
      "linear-gradient(135deg, rgba(255,240,245,0.75), rgba(255,228,255,0.75))",
      "linear-gradient(135deg, rgba(230,245,255,0.75), rgba(210,240,255,0.75))",
      "linear-gradient(135deg, rgba(235,245,230,0.75), rgba(225,255,240,0.75))",
      "linear-gradient(135deg, rgba(245,235,255,0.75), rgba(235,225,255,0.75))",
      "linear-gradient(135deg, rgba(216,240,255,0.75), rgba(189,224,255,0.75))",
      "linear-gradient(135deg, rgba(255,239,213,0.75), rgba(255,218,185,0.75))"
    ];
    const idx = hash(String(term || '')) % pastelGradients.length;
    return pastelGradients[idx];
  }

  /***************************************************************************
   * STATUS CLASS (for pill styling)
   ***************************************************************************/
  function statusClass(s) {
    if (!s) return 'ig-status-due';
    const low = String(s).toLowerCase();
    if (/paid/.test(low)) return 'ig-status-paid';
    return 'ig-status-due';
  }

  /***************************************************************************
   * Render a single invoice card (glassmorphic pastel look)
   * - Paid invoices: slightly dimmed but still interactive (Copy ID works)
   ***************************************************************************/
  function renderInvoiceCard(inv) {
    const invDate = safe(inv, 'invoiceDate', '');
    const dueDate = safe(inv, 'dueDate', '');
    const term = safe(inv, 'term', '-');
    const challanType = safe(inv, 'challanType', '-');
    const challanID = safe(inv, 'challanID', '-');
    const scholarship = safe(inv, 'scholarshipPercent', '0');
    const payable = safe(inv, 'payableAmount', '0');
    const status = safe(inv, 'status', 'Unknown');
    const paidDate = safe(inv, 'paidDate', '-');
    const printHTML = safe(inv, 'printButtonHTML', '');

    const isPaid = String(status).toLowerCase().includes('paid');

    const card = document.createElement('article');
    card.className = 'ig-card';

    // Mark paid invoices to apply the dull effect
    if (String(status).toLowerCase().includes("paid")) {
      card.classList.add("ig-paid");
    }

    // Set gradient via CSS variable used by your CSS
    const grad = termGradient(term);
    card.style.setProperty('--invoice-grad', grad);

    // Small dimming for paid (still readable and interactive)
    if (isPaid) {
      card.style.opacity = '0.88';
      card.style.filter = 'brightness(0.92) saturate(0.82)';
      // slightly stronger glass overlay
    } else {
      card.style.opacity = '1';
      card.style.filter = 'none';
    }

    card.style.position = 'relative';

    // overlay element (glass)
    const overlay = `<div class="ig-glass-overlay" aria-hidden></div>`;

    card.innerHTML = `
      ${overlay}
      <div class="ig-top">
        <div>
          <div class="ig-badge">${escapeHtml(challanType)}</div>
          <div style="margin-top:8px;font-weight:800;opacity:${isPaid ? 0.86 : 1}">
            Challan <span style="color:var(--muted);font-weight:600">${escapeHtml(challanID)}</span>
          </div>
          <div class="ig-small" style="margin-top:6px;opacity:${isPaid ? 0.78 : 1}">Term: ${escapeHtml(term)}</div>
        </div>

        <div style="text-align:right">
          <div class="ig-status-pill ${statusClass(status)}" style="${isPaid ? 'opacity:0.95' : ''}">
            ${escapeHtml(status)}
          </div>
          <div class="ig-small" style="margin-top:8px;opacity:${isPaid ? 0.78 : 1}">Invoice</div>
          <div style="font-weight:800;opacity:${isPaid ? 0.86 : 1}">${formatDate(invDate)}</div>
        </div>
      </div>

      <div class="ig-divider" style="${isPaid ? 'opacity:0.6' : ''}"></div>

      <div class="ig-meta" style="${isPaid ? 'opacity:0.92' : ''}">
        <div class="ig-m">Due: <strong>${formatDate(dueDate)}</strong></div>
        <div class="ig-m">Scholarship: <strong>${escapeHtml(scholarship)}%</strong></div>
        <div class="ig-m">Payable: <strong class="ig-amount">${formatAmount(payable)}</strong></div>
        <div class="ig-m">Paid on: <strong>${formatDate(paidDate)}</strong></div>
      </div>

      <div class="ig-info-row">
        <div class="ig-actions" style="margin-top:10px">
          <div id="ig-print-wrapper-${escapeHtml(challanID)}"></div>
          <button class="ig-btn ig-copy-btn" data-challan="${escapeHtml(challanID)}" style="${isPaid ? 'opacity:0.9' : ''}">
            Copy ID
          </button>
        </div>
      </div>
    `;

    // Insert print button HTML (preserve original if available)
    const pw = card.querySelector('#ig-print-wrapper-' + escapeHtml(challanID));
    if (pw) {
      if (printHTML && String(printHTML).trim()) {
        pw.innerHTML = printHTML;
      } else {
        const disabledBtn = document.createElement('button');
        disabledBtn.className = 'ig-btn disabled';
        disabledBtn.setAttribute('aria-disabled', 'true');
        disabledBtn.setAttribute('title', 'Print unavailable');
        disabledBtn.innerHTML = '<span class="material-icons" aria-hidden style="opacity:0.6">print</span>';
        disabledBtn.style.pointerEvents = 'none';
        pw.appendChild(disabledBtn);
      }
    }

    // Copy ID — ALWAYS active, even on Paid (user requested)
    const copyBtn = card.querySelector('.ig-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async (ev) => {
        try {
          const textToCopy = copyBtn.getAttribute('data-challan') || challanID;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(textToCopy);
          }
          // give quick feedback
          const prev = copyBtn.innerHTML;
          copyBtn.innerHTML = '<span class="material-icons" aria-hidden>check</span>';
          copyBtn.classList.add('disabled');
          setTimeout(() => {
            copyBtn.innerHTML = 'Copy ID';
            copyBtn.classList.remove('disabled');
          }, 1400);
        } catch (e) {
          console.error('copy failed', e);
        }
      });
    }

    return card;
  }

  /***************************************************************************
   * INSERT WRAPPER + HEADER + GRID into DOM
   ***************************************************************************/
  const parentContainer = document.querySelector('#page_content_inner');
  if (!parentContainer) {
    console.warn('Invoices UI: parent container #page_content_inner not found — aborting UI insert.');
    return;
  }

  parentContainer.insertAdjacentHTML('beforebegin', `
    <div class="ig-bg-blobs" aria-hidden>
      <div class="ig-blob ig-b1"></div>
      <div class="ig-blob ig-b2"></div>
    </div>

    <div class="ig-wrap">
      <div class="ig-header">
        <div class="ig-title">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:48px;height:48px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,#eef2ff,#f6fff0);border:1px solid rgba(255,255,255,0.6)">
              <span class="material-icons" style="color:var(--accent);font-size:26px">receipt_long</span>
            </div>
          </div>
          <div>
            <div class="ig-app-title">Invoices</div>
            <div class="ig-app-sub">Recent invoices — latest first</div>
          </div>
        </div>

        <div class="ig-controls">
          <input class="ig-search" id="ig-inv-search" placeholder="Filter by term, challan, status..." />
          <button class="ig-sort-btn" id="ig-inv-sort" title="Toggle sort by invoice date"><span class="material-icons">swap_vert</span> Sort by Date</button>
          <button class="ig-sort-btn" id="ig-inv-toggleorder" title="Toggle newest/oldest">Toggle Order</button>
        </div>
      </div>

      <div id="ig-invoiceGrid" class="ig-invoice-grid"></div>
    </div>
  `);

  /***************************************************************************
   * STATE, RENDER LOOP, INTERACTIONS
   ***************************************************************************/
  // Get invoices from page table
  let invoicesList = extractInvoices();

  const grid = document.getElementById('ig-invoiceGrid');
  const sortBtn = document.getElementById('ig-inv-sort');
  const toggleOrderBtn = document.getElementById('ig-inv-toggleorder');
  const searchInput = document.getElementById('ig-inv-search');

  const state = {
    items: Array.from(invoicesList),
    sortDesc: true, // newest first
    query: ''
  };

  function parseDate(s) {
    const d = new Date(s);
    if (isNaN(d)) return null;
    return d;
  }

  function render() {
    grid.innerHTML = '';
    let items = state.items.slice();

    // filter
    const q = state.query.trim().toLowerCase();
    if (q) {
      items = items.filter(it => {
        return (safe(it, 'term', '') + ' ' + safe(it, 'challanType', '') + ' ' + safe(it, 'challanID', '') + ' ' + safe(it, 'status', '')).toLowerCase().includes(q);
      });
    }

    // sort
    items.sort((a, b) => {
      const da = parseDate(safe(a, 'invoiceDate', '')) || new Date(0);
      const db = parseDate(safe(b, 'invoiceDate', '')) || new Date(0);
      return state.sortDesc ? db - da : da - db;
    });

    // render cards
    items.forEach(inv => {
      try {
        const c = renderInvoiceCard(inv);
        grid.appendChild(c);
      } catch (e) {
        console.error('render card failed for', inv, e);
      }
    });
  }

  // interactions
  sortBtn.addEventListener('click', () => { state.sortDesc = !state.sortDesc; render(); });
  toggleOrderBtn.addEventListener('click', () => { state.sortDesc = !state.sortDesc; render(); });
  searchInput.addEventListener('input', (e) => { state.query = e.target.value; render(); });

  // ensure latest first initially if possible
  state.items.sort((a, b) => {
    const da = parseDate(a.invoiceDate) || new Date(0);
    const db = parseDate(b.invoiceDate) || new Date(0);
    return db - da;
  });

  // initial render
  render();

  // expose for debugging
  window.__invoicesList = invoicesList;
  window.__renderInvoices = render;
});
