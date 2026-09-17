// NOTE: An orphaned snippet that referenced an undefined `div` used to sit at the
// top of this file and threw "div is not defined" on every student page. That
// abort also prevented the background-image + sidebar setup below from running.
// It has been removed.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'TOGGLE_POWER_CHANGED') {
    console.log('⚡ toggle_power changed:', message.enabled);

    // Ask background to reload this tab
    chrome.runtime.sendMessage({ type: 'RELOAD_ME' });

  }
});


chrome.storage.local.get('toggle_power', (result) => {
  console.log('UCP Smart Portal has started!')
  const enabled = result['toggle_power'];

  // Patch 1.2 (Disable extension removal function)
  for (let i = 1; i < 100; i++) {
      // Safe
      window.clearInterval(i);
  }

  if (enabled) {
    const DEFAULT_BG = 'assets/bgs/bg.jpg'; // bundled  always exists

    function setBodyBackground(url) {
      const body = document.body || document.documentElement;
      // Custom backgrounds are stored as data: / http(s): URLs and must be used
      // verbatim; bundled presets are extension paths (wrapped with getURL).
      // Extension paths are passed WITHOUT a leading slash (the convention
      // used everywhere else in this extension) so getURL resolves them
      // cleanly to chrome-extension://<id>/assets/... .
      let imageUrl;
      try {
        imageUrl = /^data:|^https?:/i.test(url)
          ? url
          : chrome.runtime.getURL(String(url).replace(/^\/+/, ''));
      } catch (e) {
        console.warn('setBodyBackground: could not resolve background url', url, e);
        imageUrl = chrome.runtime.getURL(DEFAULT_BG);
      }
      // Validate that the image actually loads before publishing it as the
      // wallpaper  a stale saved background (deleted custom file, invalid
      // data URL, bad path) would otherwise leave the page with NO background.
      // On failure, fall back to the bundled default wallpaper.
      const apply = (finalUrl) => {
        // Expose the wallpaper as a CSS variable. styles/shell.css renders it
        // via a fixed body::before layer (the sole background) so it can be
        // grayed out (night mode) and/or blurred (blur toggle) without
        // touching page content. The body itself stays background-less.
        try {
          body.style.setProperty('--ucp-bg-image', `url("${finalUrl}")`);
          body.style.setProperty('--ucp-bg-url', finalUrl);
        } catch (e) {}
      };
      const probe = new Image();
      // Publish the cached wallpaper immediately. Validation remains async so
      // a bad saved URL can still fall back without delaying first paint.
      apply(imageUrl);
      probe.onload = () => apply(imageUrl);
      probe.onerror = () => {
        console.warn('setBodyBackground: background failed to load, using default', imageUrl);
        const fallback = chrome.runtime.getURL(DEFAULT_BG);
        if (fallback !== imageUrl) apply(fallback);
      };
      probe.src = imageUrl;
    }

    function disableAutoLogout() {
      const highestId = setInterval(() => { }, 1000);
      for (let i = 0; i <= highestId; i++)
        clearInterval(i);
    }



    chrome.storage.local.get('background-wallpaper-path', (result) => {
      const path = result['background-wallpaper-path'];

      if (path) {
        setBodyBackground(path)
      } else {
        setBodyBackground("/assets/bgs/bg.jpg")
      }
    });

    // Stay Active is ON by default: a missing value means "stay on".
    chrome.storage.local.get('toggle_stay', (result) => {
      const v = result['toggle_stay'];
      const stayActive = (v === undefined || v === null) ? true : !!v;
      if (stayActive)
        disableAutoLogout();

    })


    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes['background-wallpaper-path']) {
        const url = changes['background-wallpaper-path'].newValue;
        if (url && url.trim().length !== 0) {
          setBodyBackground(url);
        }
      } else if (area === 'local' && changes['toggle_stay']) {
        console.log('toggle stay changed')
        const v = changes['toggle_stay'].newValue;
        const stayActive = (v === undefined || v === null) ? true : !!v;
        if (stayActive)
          disableAutoLogout();

      }
    });



    // Activate Sidebar
    document.querySelector('body').classList.add('sidebar_main_active');

    // insert menu button
    const docBody = document.querySelector('body.header_full');
    if (docBody) {
      docBody.insertAdjacentHTML('afterbegin', `
        <button id="menuButton" aria-label="Open menu" title="Open menu" style="position: fixed; top: 16px; left: 16px; z-index: 9999; display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; padding: 0px; margin: 0px; border: none; border-radius: 50%; background: white; box-shadow: rgba(0, 0, 0, 0.18) 0px 6px 14px; cursor: pointer; transition: transform 150ms, box-shadow 150ms; outline: none;" onmouseover="this.style.transform='translateY(-2px) scale(1.02)'; this.style.boxShadow='0 10px 20px rgba(0,0,0,0.20)';" onmouseout="this.style.transform=''; this.style.boxShadow='0 6px 14px rgba(0,0,0,0.18)';" onfocus="this.style.boxShadow='0 10px 20px rgba(0,0,0,0.20)';" onblur="this.style.boxShadow='0 6px 14px rgba(0,0,0,0.18)';">
    <span class="material-icons" aria-hidden="true" style="font-size:22px;line-height:1;margin: 0;">
      menu
    </span>
  </button>
        `)
    }

    // Insert logout button
    const parent = document.querySelector('.menu_section ul');
    if (parent) {
      parent.insertAdjacentHTML('beforeend', `
  <li title="Log Out" class="logout-btn current_section">
    <a href="/web/session/logout?redirect=/">
      <span class="menu_icon">
        <i style="color: #fff !important" class="material-icons">exit_to_app</i>
      </span>
      <span style="color: #fff !important" class="menu_title">Logout</span>
    </a>
  </li>
`);
    }
    // Open the sidebar for smaller view ports
    const menuButton = document.querySelector('#menuButton');
    if (menuButton) menuButton.addEventListener('click', ()=>{
      const sidebar = document.querySelector('body.header_full aside#sidebar_main ')
      if (sidebar) {
          console.log('Side bar clicked')
          sidebar.classList.toggle('translate-sidebar')
      }
    })
  }
});


