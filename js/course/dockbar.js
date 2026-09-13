chrome.storage.local.get('toggle_power', (result) => {
  const enabled = result['toggle_power'];

  if (enabled) {
    const parentContainer = document.querySelector('#page_content_inner');
    parentContainer.insertAdjacentHTML('afterend', `
  <div class="wrapper">
    <div class="liquidGlass-wrapper dock">
      <div class="liquidGlass-effect"></div>
      <div class="liquidGlass-tint"></div>
      <div class="liquidGlass-shine"></div>
      <div class="liquidGlass-text">
        <div class="dock">
          <a href="#" data-dock-key="info" title="Announcements">
            <span class="material-icons" aria-hidden="true">campaign</span>
          </a>
          <a href="#" data-dock-key="outline" title="Course Outline">
            <span class="material-icons" aria-hidden="true">account_tree</span>
          </a>
          <a href="#" data-dock-key="material" title="Course Material">
            <span class="material-icons" aria-hidden="true">menu_book</span>
          </a>
          <a href="#" data-dock-key="assessment" title="Course Assessment">
            <span class="material-icons" aria-hidden="true">assignment</span>
          </a>
          <a href="#" data-dock-key="submission" title="Submission">
            <span class="material-icons" aria-hidden="true">upload_file</span>
          </a>
          <a href="#" data-dock-key="gradebook" title="Gradebook">
            <span class="material-icons" aria-hidden="true">grade</span>
          </a>
          <a href="https://horizon.ucp.edu.pk/student/attendance" data-dock-key="attendance" title="Attendance">
            <span class="material-icons" aria-hidden="true">fact_check</span>
          </a>
        </div>
      </div>
    </div>

    <svg style="display: none">
      <filter id="glass-distortion" x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox">
        <feTurbulence type="fractalNoise" baseFrequency="0.01 0.01" numOctaves="1" seed="5" result="turbulence" />
        <feComponentTransfer in="turbulence" result="mapped">
          <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
          <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
          <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
        </feComponentTransfer>
        <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
        <feSpecularLighting in="softMap" surfaceScale="5" specularConstant="1" specularExponent="100" lighting-color="white" result="specLight">
          <fePointLight x="-200" y="-200" z="300" />
        </feSpecularLighting>
        <feComposite in="specLight" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litImage" />
        <feDisplacementMap in="SourceGraphic" in2="softMap" scale="150" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  </div>
`);


    // Tooltip + hover enlarge feature
    const tooltip = document.createElement('div');
    tooltip.className = 'dock-tooltip';
    document.body.appendChild(tooltip);

    document.querySelectorAll('.dock a .material-icons').forEach(icon => {
      icon.addEventListener('mouseenter', e => {
        const label = icon.parentElement.getAttribute('title');
        tooltip.textContent = label;
        tooltip.style.display = 'block';
        tooltip.style.opacity = '1';
        tooltip.style.left = e.pageX + 'px';
        tooltip.style.top = (e.pageY - 40) + 'px';
      });

      icon.addEventListener('mousemove', e => {
        tooltip.style.left = e.pageX + 'px';
        tooltip.style.top = (e.pageY - 40) + 'px';
      });

      icon.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
        tooltip.style.opacity = '0';
      });
    });


    // Select an item based on the URL
    // Keyword → Dock alt text mapping
    // Get current URL in lowercase
    const currentURL = window.location.href.toLowerCase();

    let selectedKey = null;
    for (const key of ["info", "outline", "material", "assessment", "submission", "gradebook", "attendance"]) {
      if (currentURL.includes(key)) {
        selectedKey = key;
        break;
      }
    }

    if (selectedKey) {
      document
        .querySelector(`.wrapper .dock .dock a[data-dock-key="${selectedKey}"]`)
        ?.classList.add('selected');
    }

    // Setup correct hrefs for each dock item:
    const hrefs = document.querySelector('div[data-uk-button-radio]').children;
    const targetItems = document.querySelector('.wrapper .dock .dock').children;
    for (let i = 0; i < targetItems.length - 1; i++) { // length-1 to escape attendance
      targetItems[i].setAttribute('href', hrefs[i].getAttribute('href'))
    }

  }

})