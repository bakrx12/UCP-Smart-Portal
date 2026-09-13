(() => {
  const saveRegistration = () => {
    const registration = document.querySelector(
      '#user_profile .user_heading .user_heading_content .sub-heading'
    )?.textContent.replace(/\s+/g, ' ').trim();
    if (!registration || registration === '----') return false;

    try {
      chrome.storage.local.set({ ucp_registration: registration });
    } catch (e) {}
    return true;
  };

  if (!saveRegistration()) {
    const registrationObserver = new MutationObserver(() => {
      if (saveRegistration()) registrationObserver.disconnect();
    });
    registrationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
})();

chrome.storage.local.get('toggle_power', (result) => {
  if (!result?.toggle_power) return;

  const root = document.getElementById('user_profile') || document;
  let fabObserver;

  const moveFabToHeader = () => {
    const header = root.querySelector('.user_heading');
    const fab = root.querySelector('button.profile_default_fields.md-fab, button.profile_default_fields, .md-fab');
    if (!header || !fab) return false;
    if (fab.closest('.user_heading')) return true;

    header.style.position = 'relative';
    header.classList.add('ucp-fab-inline-host');
    fab.classList.add('ucp-fab-inline');
    header.appendChild(fab);
    return true;
  };

  if (!moveFabToHeader()) {
    fabObserver = new MutationObserver(() => {
      if (moveFabToHeader()) fabObserver.disconnect();
    });
    fabObserver.observe(root, { childList: true, subtree: true });
  }

  const existingFab = root.querySelector('.ucp-fab-inline');
  if (existingFab && existingFab.closest('.user_heading')) return; // already done

  const isReddish = (rgb) => {
    const m = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '');
    if (!m) return false;
    return +m[1] >= 140 && +m[2] <= 130 && +m[3] <= 130;
  };

  // ------------------------------------------------------------------
  // About / Bio section headings (matched by text — the portal's own
  // class names are not stable).
  // ------------------------------------------------------------------
  const headings = Array.from(
    root.querySelectorAll('h1, h2, h3, h4, .heading_c, .heading_a, .md-list-heading')
  ).filter((h) => {
    const t = (h.textContent || '').replace(/\s+/g, ' ').trim();
    return t.length > 0 && t.length < 40
      && /^(about( me)?|about & bio|about and bio|bio(graphy)?)$/i.test(t);
  });

  // Put the profile edit control in the header even if the portal changes the
  // About/Bio heading text and the heading matcher above finds nothing.
  const header = root.querySelector('.user_heading');
  const globalFab = root.querySelector('.md-fab, button.profile_default_fields');
  if (header && globalFab && !globalFab.closest('.user_heading')) {
    header.style.position = 'relative';
    header.classList.add('ucp-fab-inline-host');
    globalFab.classList.add('ucp-fab-inline');
    header.appendChild(globalFab);
  }
  if (!headings.length) return;

  // The element the portal paints the red highlight box on: walk UP from
  // the heading and take the first ancestor with a red border or a red
  // box-shadow (the "glow"). Falls back to the heading's own parent.
  function findRedBox(heading) {
    let el = heading;
    for (let i = 0; i < 5 && el && el !== root && el !== document.body; i++) {
      el = el.parentElement;
      if (!el) break;
      let cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      const hasRedBorder = isReddish(cs.borderTopColor)
        && parseFloat(cs.borderTopWidth || '0') > 0;
      const shadowColor = (cs.boxShadow && cs.boxShadow !== 'none')
        ? (cs.boxShadow.match(/rgba?\([^)]+\)/) || [''])[0] : '';
      const hasRedGlow = cs.boxShadow && cs.boxShadow !== 'none' && isReddish(shadowColor);
      if (hasRedBorder || hasRedGlow) return el;
    }
    return heading.parentElement || heading;
  }

  let usedGlobalFab = false;

  headings.forEach((heading) => {
    const box = findRedBox(heading);
    box.classList.add('ucp-about-bio');

    // The section's own Edit button, else the profile's first one (once).
    const fab =
      box.querySelector('.md-fab') ||
      box.querySelector('button.profile_default_fields') ||
      (!usedGlobalFab ? (root.querySelector('#user_profile .md-fab') || root.querySelector('.md-fab') || root.querySelector('button.profile_default_fields')) : null);
    if (!fab || fab.closest('.ucp-fab-inline-host')) return;
    if (!fab.closest(box)) usedGlobalFab = true;

    // Move it beside the name and registration details in the profile header.
    const header = root.querySelector('.user_heading') || heading;
    header.style.position = 'relative';
    header.classList.add('ucp-fab-inline-host');
    fab.classList.add('ucp-fab-inline');
    header.appendChild(fab);
  });
});
