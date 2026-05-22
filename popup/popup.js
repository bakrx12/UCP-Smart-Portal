/* ========== Settings & images ========== */
/* eight real images (picsum.photos -> royalty-free photos). You can replace these with your own URLs */
const ucpBackgrounds = [
  "/assets/bgs/bg.jpg",
  "/assets/bgs/bg1.jpg",
  "/assets/bgs/bg2.jpg",
  "/assets/bgs/bg3.jpg",
  "/assets/bgs/bg4.jpg",
  "/assets/bgs/bg5.jpg",
  "/assets/bgs/bg6.jpg",
  "/assets/bgs/bg7.jpg",
];

const STORAGE_KEY = "ucp-ext-settings-v1";

/* ========== utility & state ========== */
const ucpState = {
  enabled: false,
  stayActive: false,
  bgIndex: 0,
};

function ucpSaveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ucpState));
  } catch (e) {
    /* storage may be disabled in some contexts */
  }
}

function ucpLoadState() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      Object.assign(ucpState, JSON.parse(s));
    } else {
      // 🟢 First-time defaults
      ucpState.enabled = true; // default ON
      ucpState.stayActive = false;
      ucpState.bgIndex = 0;
      ucpSaveState();
      // also sync to chrome.storage.local
      chrome.storage.local.set({ toggle_power: true });
    }
  } catch (e) {
    // if parsing failed, assume default ON
    ucpState.enabled = true;
    ucpSaveState();
    chrome.storage.local.set({ toggle_power: true });
  }
}

/* small hook: call this when user does something (so you can attach logic later) */
async function ucpOnAction(actionName, payload) {
  console.log("UCP action:", actionName, payload);

  if (actionName == "toggle_stay") {
    await chrome.storage.local.set({
      toggle_stay: Boolean(payload.stayActive),
    });
  } else if (actionName == "toggle_power") {
    await chrome.storage.local.set({ toggle_power: Boolean(payload.enabled) });
  }
}

/* ========== UI wiring ========== */
const el = {
  root: document.getElementById("ucp-root"),
  power: document.getElementById("ucp-power"),
  powerIcon: document.getElementById("ucp-power-icon"),
  powerStateText: document.getElementById("ucp-power-state"),
  stayToggle: document.getElementById("ucp-stay-toggle"),
  carousel: document.getElementById("ucp-carousel"),
  prevBtn: document.getElementById("ucp-prev"),
  nextBtn: document.getElementById("ucp-next"),
  bgLayer: document.getElementById("ucp-bg"),
};

ucpLoadState();

/* apply initial background to bgLayer (subtle blurred photo behind glass) */
async function applyBgLayer(url) {
  await chrome.storage.local.set({ "background-wallpaper-path": url });
}

/* carousel content rendering */
function renderCarousel(idx) {
  idx =
    ((idx % ucpBackgrounds.length) + ucpBackgrounds.length) %
    ucpBackgrounds.length;
  const url = ucpBackgrounds[idx];
  el.carousel.innerHTML = "";
  const img = document.createElement("img");
  img.decoding = "async";
  img.src = url;
  img.alt = `Background ${idx + 1}`;
  img.style.transform = "scale(1.02)";
  img.onload = () => {
    img.style.transform = "scale(1.06)";
  };
  const caption = document.createElement("div");
  caption.className = "ucp-caption";
  caption.textContent = `${idx + 1} / ${ucpBackgrounds.length}`;
  el.carousel.appendChild(img);
  el.carousel.appendChild(caption);
  applyBgLayer(url);
}

/* toggle visuals */
function updatePowerUI() {
  if (ucpState.enabled) {
    el.power.classList.add("ucp-on");
    el.power.setAttribute("aria-pressed", "true");
    el.powerIcon.style.transform = "rotate(0deg)";
    el.powerIcon.style.transition = "transform .24s";
    el.powerIcon.style.opacity = "1";
    el.powerStateText.textContent = "On";
  } else {
    el.power.classList.remove("ucp-on");
    el.power.setAttribute("aria-pressed", "false");
    el.powerIcon.style.transform = "rotate(-12deg)";
    el.powerStateText.textContent = "Off";
  }
}

function updateStayUI() {
  const t = el.stayToggle;
  if (ucpState.stayActive) {
    t.classList.add("ucp-checked");
    t.setAttribute("aria-checked", "true");
  } else {
    t.classList.remove("ucp-checked");
    t.setAttribute("aria-checked", "false");
  }
}

/* actions */
el.power.addEventListener("click", () => {
  ucpState.enabled = !ucpState.enabled;
  ucpSaveState();
  updatePowerUI();
  ucpOnAction("toggle_power", { enabled: ucpState.enabled });
});

el.power.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    el.power.click();
  }
});

el.stayToggle.addEventListener("click", () => {
  ucpState.stayActive = !ucpState.stayActive;
  ucpSaveState();
  updateStayUI();
  ucpOnAction("toggle_stay", { stayActive: ucpState.stayActive });
});

el.prevBtn.addEventListener("click", () => {
  ucpState.bgIndex =
    (ucpState.bgIndex - 1 + ucpBackgrounds.length) % ucpBackgrounds.length;
  renderCarousel(ucpState.bgIndex);
  ucpSaveState();
  ucpOnAction("bg_prev", { index: ucpState.bgIndex });
});

el.nextBtn.addEventListener("click", () => {
  ucpState.bgIndex = (ucpState.bgIndex + 1) % ucpBackgrounds.length;
  renderCarousel(ucpState.bgIndex);
  ucpSaveState();
  ucpOnAction("bg_next", { index: ucpState.bgIndex });
});

/* keyboard arrows for slider */
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") {
    el.prevBtn.click();
  }
  if (e.key === "ArrowRight") {
    el.nextBtn.click();
  }
});

/* credits links */
document.getElementById("ucp-credits").addEventListener("toggle", (ev) => {
  ucpOnAction("credits_toggle", { open: ev.target.open });
});

/* initialize UI from state */
(function init() {
  ucpState.bgIndex = ucpState.bgIndex || 0;
  renderCarousel(ucpState.bgIndex);
  updatePowerUI();
  updateStayUI();
  ucpOnAction("init", { state: ucpState });
})();

/* expose API */
el.root.ucpSetEnabled = function (v) {
  ucpState.enabled = !!v;
  ucpSaveState();
  updatePowerUI();
};
el.root.ucpSetBackgroundIndex = function (i) {
  ucpState.bgIndex = i % ucpBackgrounds.length;
  renderCarousel(ucpState.bgIndex);
  ucpSaveState();
};

/* Preload images */
ucpBackgrounds.forEach((u) => {
  const i = new Image();
  i.src = u;
});

/* smooth <details> transition */
const details = document.getElementById("ucp-credits");
details.addEventListener("toggle", () => {
  if (details.open) {
    const contentHeight = details.scrollHeight;
    details.style.height = contentHeight + "px";
  } else {
    details.style.height = details.scrollHeight + "px";
    window.requestAnimationFrame(() => {
      details.style.height = "38px";
    });
  }
});
details.addEventListener("transitionend", (e) => {
  if (e.propertyName === "height" && details.open) {
    details.style.height = "";
  }
});
