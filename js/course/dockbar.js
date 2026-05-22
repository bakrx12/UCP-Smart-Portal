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
          <a href="#" title="Announcements">
            <img src="${chrome.runtime.getURL("assets/news.png")}" alt="Announcements" />
          </a>
          <a href="#" title="Course Outline">
            <img src="${chrome.runtime.getURL("assets/outline.png")}" alt="Course Outline" />
          </a>
          <a href="#" title="Course Material">
            <img src="${chrome.runtime.getURL("assets/material.png")}" alt="Course Material" />
          </a>
          <a href="#" title="Course Assessment">
            <img src="${chrome.runtime.getURL("assets/assesment.png")}" alt="Course Assessment" />
          </a>
          <a href="#" title="Submission">
            <img src="${chrome.runtime.getURL("assets/submission.png")}" alt="Submission" />
          </a>
          <a href="#" title="Gradebook">
            <img src="${chrome.runtime.getURL("assets/gradebook.png")}" alt="Gradebook" />
          </a>
          <a href="https://horizon.ucp.edu.pk/student/attendance" title="Attendance">
            <img src="${chrome.runtime.getURL("assets/attendance.png")}" alt="Attendance" />
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

    document.querySelectorAll('.dock a img').forEach(img => {
      img.addEventListener('mouseenter', e => {
        const alt = img.getAttribute('alt');
        tooltip.textContent = alt;
        tooltip.style.display = 'block';
        tooltip.style.opacity = '1';
        tooltip.style.left = e.pageX + 'px';
        tooltip.style.top = (e.pageY - 40) + 'px';
        img.style.transform = 'scale(1.2)'; // enlarge on hover
      });

      img.addEventListener('mousemove', e => {
        tooltip.style.left = e.pageX + 'px';
        tooltip.style.top = (e.pageY - 40) + 'px';
      });

      img.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
        tooltip.style.opacity = '0';
        img.style.transform = 'scale(1)'; // reset size
      });
    });


    // Select an item based on the URL
    // Keyword → Dock alt text mapping
    const dockMap = {
      info: "Announcements",
      outline: "Course Outline",
      material: "Course Material",
      assessment: "Course Assessment",
      submission: "Submission",
      gradebook: "Gradebook",
      attendance: "Attendance"
    };

    // Get current URL in lowercase
    const currentURL = window.location.href.toLowerCase();

    // Find which keyword matches
    let selectedAlt = null;
    for (const [keyword, altText] of Object.entries(dockMap)) {
      if (currentURL.includes(keyword)) {
        selectedAlt = altText;
        break;
      }
    }

    // Highlight the matching dock item
    if (selectedAlt) {
      const selectedImg = Array.from(document.querySelectorAll('.dock a img'))
        .find(img => img.alt === selectedAlt);
      if (selectedImg && selectedImg.parentElement) {
        selectedImg.parentElement.classList.add('selected');
      }
    }

    // Setup correct hrefs for each dock item:
    const hrefs = document.querySelector('div[data-uk-button-radio]').children;
    const targetItems = document.querySelector('.wrapper .dock .dock').children;
    for (let i = 0; i < targetItems.length - 1; i++) { // length-1 to escape attendance
      targetItems[i].setAttribute('href', hrefs[i].getAttribute('href'))
    }

  }

})