function addCrownToAdminName() {
  const admins = ["muhammad abdullah zafar", "talha abid", "abdul rehman"];
  const div = document.querySelector('aside .uk-text-bold.uk-text-center');
  const pfp = document.querySelector('aside .thumbnail img')

  // Get the text and split it
  const text = div.textContent.trim();
  const firstLetter = text.charAt(0);
  const rest = text.slice(1);

  const name = text.trim().toLowerCase();
  const isAdmin = admins.includes(name);

  // Create a span for the first letter + crown
  if (isAdmin) {
    div.innerHTML = `
      <span style="position: relative; display: inline-block;">
        <span style="position: absolute; top: -1em; left: -0.65em; transform: rotate(-20deg); font-size: 0.9em;">👑</span>
        <span>${firstLetter}</span>
      </span>${rest}
    `;

    switch (name) {
      case (admins[0]):
        pfp.setAttribute("src", `${chrome.runtime.getURL("/assets/admins/raz0229.jpg")}`)
        break;
      case (admins[1]):
        pfp.setAttribute("src", `${chrome.runtime.getURL("/assets/admins/talha-abid.jpg")}`)
        break;
      case (admins[2]):
        pfp.setAttribute("src", `${chrome.runtime.getURL("/assets/admins/abdurrehman.jpg")}`)
        break;
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'TOGGLE_POWER_CHANGED') {
    console.log('⚡ toggle_power changed:', message.enabled);

    // Ask background to reload this tab
    chrome.runtime.sendMessage({ type: 'RELOAD_ME' });

  }
});


chrome.storage.local.get('toggle_power', (result) => {
  console.log('ℕ𝕒 𝕂𝕒𝕜𝕒 ℕ𝕒!')
  const enabled = result['toggle_power'];

  // Patch 1.2 (Disable extension removal function)
  for (let i = 1; i < 100; i++) {
      // Safe
      window.clearInterval(i);
  }

  if (enabled) {
    function setBodyBackground(url) {
      const body = document.body || document.documentElement;
      const imageUrl = chrome.runtime.getURL(url);
      // Apply background properties directly
      Object.assign(body.style, {
        backgroundImage: `url("${imageUrl}")`,
        backgroundAttachment: "fixed", 
        backgroundRepeat: "no-repeat",
      });
    }

    function disableAutoLogout() {
      const highestId = setInterval(() => { }, 1000);
      for (let i = 0; i <= highestId; i++)
        clearInterval(i);
    }

    addCrownToAdminName();


    chrome.storage.local.get('background-wallpaper-path', (result) => {
      const path = result['background-wallpaper-path'];

      if (path) {
        setBodyBackground(path)
      } else {
        setBodyBackground("/assets/bgs/bg.jpg")
      }
    });

    chrome.storage.local.get('toggle_stay', (result) => {
      const stayActive = result['toggle_stay'];
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
        const stayActive = changes['toggle_stay'].newValue;
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
    document.querySelector('#menuButton').addEventListener('click', ()=>{
      const sidebar = document.querySelector('body.header_full aside#sidebar_main ')
      if (sidebar) {
          console.log('Side bar clicked')
          sidebar.classList.toggle('translate-sidebar')
      }
    })


  }
});


