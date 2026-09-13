chrome.storage.local.get('toggle_power', (result) => {
  if (!result?.toggle_power) return;

  const PAGES = [
    { key: 'cards', re: /^\/student\/enrollment\/cards$/,                    href: 'https://horizon.ucp.edu.pk/student/enrollment/cards',              label: 'Enrollment card',      icon: 'credit_card' },
    { key: 'cart',  re: /^\/student\/enrollment\/cart$/,                     href: 'https://horizon.ucp.edu.pk/student/enrollment/cart',               label: 'Enrollment cart',      icon: 'shopping_cart' },
    { key: 'time',  re: /^\/student\/enrollment\/timetable$/,                href: 'https://horizon.ucp.edu.pk/student/enrollment/timetable',          label: 'Enrollment Timetable', icon: 'calendar_month' },
    { key: 'avail', re: /^\/student\/enrollment\/available_timetable$/,      href: 'https://horizon.ucp.edu.pk/student/enrollment/available_timetable', label: 'Available Courses',    icon: 'schedule' },
  ];
  const page = PAGES.find((p) => p.re.test(location.pathname));
  if (!page) return;

  document.body.classList.add('ucp-etnav', 'ucp-etnav-' + page.key);

  if (!document.getElementById('ucp-shell-icons')) {
    const l = document.createElement('link');
    l.id = 'ucp-shell-icons';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
    document.head.appendChild(l);
  }

  // Hide original portal top buttons
  const HIDE = /^(view (the )?(enrollment )?cart|view (the )?timetable|view available courses|back to (the )?enrollment (card|cards))$/i;
  function visibleText(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('.material-icons, [class*="material-icons"], svg, i').forEach((n) => n.remove());
    return (c.textContent || '').replace(/\s+/g, ' ').trim();
  }
  document.querySelectorAll('#page_content a, #page_content button').forEach((el) => {
    try {
      if (HIDE.test(visibleText(el))) el.style.display = 'none';
    } catch (e) {}
  });

  // Render navigation bar
  const host = document.getElementById('page_content');
  if (!host || host.querySelector('.ucp-etnav')) return;

  const nav = document.createElement('div');
  nav.className = 'ucp-etnav';
  nav.innerHTML = PAGES.map((p) => `
    <a class="ucp-etnav-btn ${p.key === page.key ? 'active' : ''}" href="${p.href}">
      <span class="material-icons">${p.icon}</span>${p.label}
    </a>`).join('');

  // Find the title element containing "Course Enrollment"
  let targetHeader = null;
  const headings = host.querySelectorAll('h1, h2, h3, h4, .uk-h1, .uk-h2, .uk-h3, div, span');
  for (const el of headings) {
    if (el.children.length === 0 && el.textContent.trim().toLowerCase().includes('course enrollment')) {
      targetHeader = el.closest('h1, h2, h3, h4, div') || el;
      break;
    }
  }

  // Insert below heading if found, otherwise top of content host
  if (targetHeader && targetHeader.parentNode) {
    targetHeader.parentNode.insertBefore(nav, targetHeader.nextSibling);
  } else {
    host.insertBefore(nav, host.firstChild);
  }

  // Plain click handler — the earlier click event was reaching the page
  // but never the button itself (a covering overlay was stealing the
  // hit-test), which is now fixed via z-index/pointer-events in the CSS.
  // No capture-phase interception needed.
  nav.querySelectorAll('.ucp-etnav-btn').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = a.getAttribute('href');
    });
  });
});