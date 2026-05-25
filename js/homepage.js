chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "TOGGLE_POWER_CHANGED") {
    chrome.runtime.sendMessage({ type: "RELOAD_ME" });
  }
});

const currentMonth = new Date().getMonth();
const isWinter = currentMonth >= 11 || currentMonth <= 1;
const isRamadan2026 = new Date() <= new Date("2026-03-19T23:59:59");
const body = document.querySelector("body.bg");

if (isRamadan2026) {
  body.style.background = `url("${chrome.runtime.getURL("/assets/homepage/bg-ramadan.jpg")}") no-repeat center center fixed`;
  body.style.backgroundSize = "cover";
  body.style.minHeight = "100vh";
  body.style.setProperty("--bg-overlay-transparency", "0.0");

  injectRamadanLanterns();
} else if (isWinter) {
  body.style.background = `url("${chrome.runtime.getURL("/assets/homepage/bg-winter.jpg")}") no-repeat center center fixed`;
  body.style.backgroundSize = "cover";
  body.style.minHeight = "100vh";

  const snowContainer = document.createElement("div");
  snowContainer.className = "snow-container";

  const layers = [
    { count: 140, size: [5, 8], speed: [18, 26], depth: "near" },
    { count: 150, size: [4, 6], speed: [26, 36], depth: "mid" },
    { count: 120, size: [3, 5], speed: [34, 48], depth: "far" },
  ];

  layers.forEach((layer) => {
    for (let i = 0; i < layer.count; i++) {
      const flake = document.createElement("div");
      flake.className = `snowflake depth-${layer.depth}`;

      const size = rand(layer.size);
      const duration = rand(layer.speed);
      const delay = Math.random() * -60;

      flake.style.width = `${size}px`;
      flake.style.height = `${size}px`;
      flake.style.left = `${Math.random() * 100}vw`;
      flake.style.opacity = Math.random() * 0.5 + 0.5;
      flake.style.animationDuration = `${duration}s`;
      flake.style.animationDelay = `${delay}s`;

      flake.style.setProperty("--drift", `${(Math.random() - 0.5) * 15}vw`);
      flake.style.setProperty("--sway", `${Math.random() * 8 + 4}s`);

      snowContainer.appendChild(flake);
    }
  });

  document.body.appendChild(snowContainer);

  // ---------------- Snow accumulation ----------------
  const snowGround = document.createElement("div");
  snowGround.className = "snow-ground";
  document.body.appendChild(snowGround);

  let snowHeight = 6;
  const maxSnowHeight = 140;
  const accumulationRate = 0.15;

  setInterval(() => {
    if (snowHeight < maxSnowHeight) {
      snowHeight += accumulationRate;
      snowGround.style.setProperty("--snow-height", `${snowHeight}px`);
    }
  }, 1000);
}

function rand([min, max]) {
  return Math.random() * (max - min) + min;
}

// ================= RAMADAN LANTERNS =================

function injectRamadanLanterns() {
  // ── Top bar ──────────────────────────────────────────────────────────────────
  const topBar = document.createElement("div");
  topBar.id = "ramadan-lanterns-bar";
  topBar.innerHTML = `
    <div id="ramadan-lanterns-bar-trim"></div>
    <span class="ramadan-bar-ornament">✦</span>
    <span id="ramadan-bar-text">رمضان كريم &nbsp;·&nbsp; Ramadan Kareem</span>
    <span class="ramadan-bar-ornament">✦</span>
  `;
  document.body.appendChild(topBar);

  // ── Lanterns scene ────────────────────────────────────────────────────────────
  const scene = document.createElement("div");
  scene.id = "ramadan-lanterns-scene";
  document.body.appendChild(scene);

  const LANTERNS = [
    {
      stringH: 55,
      bodyW: 46,
      bodyH: 62,
      lit: true,
      color: "#c0392b",
      dark: "#7a1a10",
      rib: "#8b1510",
      tassel: "#c0392b",
    },
    {
      stringH: 95,
      bodyW: 38,
      bodyH: 52,
      lit: false,
      color: "#c87820",
      dark: "#7a4a08",
      rib: "#9b5810",
      tassel: "#c87820",
    },
    {
      stringH: 38,
      bodyW: 56,
      bodyH: 72,
      lit: true,
      color: "#9b1a0c",
      dark: "#5a0e06",
      rib: "#7a1008",
      tassel: "#9b1a0c",
    },
    {
      stringH: 115,
      bodyW: 34,
      bodyH: 46,
      lit: false,
      color: "#d4940c",
      dark: "#8a5a04",
      rib: "#9a6408",
      tassel: "#d4940c",
    },
    {
      stringH: 68,
      bodyW: 48,
      bodyH: 64,
      lit: true,
      color: "#b02810",
      dark: "#6a1808",
      rib: "#8a1808",
      tassel: "#b02810",
    },
  ];

  LANTERNS.forEach((cfg, i) => {
    const W = cfg.bodyW,
      H = cfg.bodyH;

    const asm = document.createElement("div");
    asm.className = "ramadan-lantern-assembly" + (cfg.lit ? " lit" : "");
    asm.style.animation = `ramadan-idle-sway ${4.5 + i * 0.55}s ease-in-out ${i * 0.65}s infinite`;

    // String
    const str = document.createElement("div");
    str.className = "ramadan-string";
    str.style.height = cfg.stringH + "px";
    asm.appendChild(str);

    // Top cap
    const capT = document.createElement("div");
    capT.className = "ramadan-cap-top";
    capT.style.cssText = `width:${W * 0.66}px; height:11px; background:linear-gradient(to bottom,${rl_lighten(cfg.color, 0.28)},${cfg.dark});`;
    asm.appendChild(capT);

    // Frame
    const frame = document.createElement("div");
    frame.className = "ramadan-frame";
    frame.style.cssText = `width:${W}px; height:${H}px;`;

    // Halo
    const halo = document.createElement("div");
    halo.className = "ramadan-glow-halo";
    halo.style.cssText = `width:${W * 3.2}px; height:${H * 3.2}px; background:radial-gradient(ellipse at center,${rl_rgba(cfg.color, 0.52)} 0%,${rl_rgba(cfg.color, 0.18)} 32%,transparent 62%);`;
    frame.appendChild(halo);

    // Paper
    const paper = document.createElement("div");
    paper.className = "ramadan-paper";
    rl_setPaperBg(paper, cfg, cfg.lit);
    frame.appendChild(paper);

    // Inner glow
    const ig = document.createElement("div");
    ig.className = "ramadan-inner-glow";
    ig.style.opacity = cfg.lit ? "1" : "0";
    frame.appendChild(ig);

    // Flame
    const flame = document.createElement("div");
    flame.className = "ramadan-flame";
    flame.style.cssText = `width:${W * 0.13}px; height:${H * 0.16}px; bottom:${H * 0.28}px;`;
    frame.appendChild(flame);

    // Vertical ribs
    for (let r = 0; r < 8; r++) {
      const t = r / 7;
      const angle = (t - 0.5) * Math.PI * 0.9;
      const cx = W / 2 + (Math.sin(angle) * W) / 2;
      const ribW = Math.max(1, 2 * Math.abs(Math.cos(angle)));
      const opacity = (0.28 + 0.52 * Math.abs(Math.cos(angle))).toFixed(2);
      const rib = document.createElement("div");
      rib.style.cssText = `position:absolute;top:4%;height:92%;left:${cx - ribW / 2}px;width:${ribW}px;background:${cfg.rib};opacity:${opacity};border-radius:1px;`;
      frame.appendChild(rib);
    }

    // Horizontal bands
    [0.18, 0.5, 0.82].forEach((y) => {
      const band = document.createElement("div");
      band.style.cssText = `position:absolute;left:0;right:0;top:${y * 100}%;height:2px;background:${cfg.rib};opacity:0.55;border-radius:1px;`;
      frame.appendChild(band);
    });

    // Sheen
    const sheen = document.createElement("div");
    sheen.className = "ramadan-sheen";
    frame.appendChild(sheen);

    asm.appendChild(frame);

    // Bottom cap
    const capB = document.createElement("div");
    capB.className = "ramadan-cap-bottom";
    capB.style.cssText = `width:${W * 0.66}px;height:11px;background:linear-gradient(to bottom,${cfg.dark},${rl_darken(cfg.color, 0.55)});`;
    asm.appendChild(capB);

    // Tassel
    const tl = document.createElement("div");
    tl.className = "ramadan-tassel-line";
    tl.style.cssText = `height:14px;background:${cfg.tassel};`;
    asm.appendChild(tl);

    const tk = document.createElement("div");
    tk.className = "ramadan-tassel-knot";
    tk.style.cssText = `width:9px;height:9px;background:${cfg.tassel};`;
    asm.appendChild(tk);

    const fringe = document.createElement("div");
    fringe.className = "ramadan-tassel-fringe";
    for (let s = 0; s < 10; s++) {
      const st = document.createElement("div");
      st.className = "ramadan-tassel-strand";
      st.style.cssText = `height:${7 + Math.floor(Math.random() * 7)}px;background:linear-gradient(to bottom,${cfg.tassel},transparent);`;
      fringe.appendChild(st);
    }
    asm.appendChild(fringe);

    scene.appendChild(asm);

    // Hover sway
    asm.addEventListener("mousemove", (e) => {
      const r = asm.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / 28;
      asm.style.animationPlayState = "paused";
      asm.style.transform = `rotate(${Math.max(-9, Math.min(9, dx * 3.5))}deg)`;
    });
    asm.addEventListener("mouseleave", () => {
      asm.style.transform = "";
      asm.style.animationPlayState = "running";
    });

    // Click toggle
    asm.addEventListener("click", () => {
      const nowLit = asm.classList.toggle("lit");
      rl_setPaperBg(paper, cfg, nowLit);
      ig.style.opacity = nowLit ? "1" : "0";
      const idleAnim = asm.style.animation;
      asm.style.animation = "none";
      void asm.offsetWidth;
      asm.style.animation =
        "ramadan-click-swing 1.6s cubic-bezier(0.36,0.07,0.19,0.97) forwards";
      asm.addEventListener(
        "animationend",
        () => {
          asm.style.animation = idleAnim;
        },
        { once: true },
      );
    });
  });

  // Place nails
  function placeRamadanNails() {
    topBar.querySelectorAll(".ramadan-nail").forEach((n) => n.remove());
    scene.querySelectorAll(".ramadan-lantern-assembly").forEach((item) => {
      const rect = item.getBoundingClientRect();
      const nail = document.createElement("div");
      nail.className = "ramadan-nail";
      nail.style.left = rect.left + rect.width / 2 + "px";
      topBar.appendChild(nail);
    });
  }
  requestAnimationFrame(() => requestAnimationFrame(placeRamadanNails));
  window.addEventListener("resize", placeRamadanNails);

  // ── Colour helpers (prefixed to avoid collisions) ────────────────────────────
  function rl_hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }
  function rl_rgba(hex, a) {
    const { r, g, b } = rl_hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }
  function rl_lighten(hex, f) {
    const { r, g, b } = rl_hexToRgb(hex);
    return `rgb(${Math.min(255, r + Math.round((255 - r) * f))},${Math.min(255, g + Math.round((255 - g) * f))},${Math.min(255, b + Math.round((255 - b) * f))})`;
  }
  function rl_darken(hex, f) {
    const { r, g, b } = rl_hexToRgb(hex);
    return `rgb(${Math.max(0, Math.round(r * (1 - f)))},${Math.max(0, Math.round(g * (1 - f)))},${Math.max(0, Math.round(b * (1 - f)))})`;
  }
  function rl_setPaperBg(el, cfg, lit) {
    el.style.background = lit
      ? `radial-gradient(ellipse at 42% 38%,${rl_lighten(cfg.color, 0.92)} 0%,${rl_lighten(cfg.color, 0.48)} 26%,${cfg.color} 58%,${cfg.dark} 100%)`
      : `radial-gradient(ellipse at 42% 38%,${rl_lighten(cfg.color, 0.07)} 0%,${rl_darken(cfg.color, 0.42)} 55%,${cfg.dark} 100%)`;
  }
}

// ================= NEWS SECTION =================

const NEWS_URL =
  "https://raw.githubusercontent.com/raz0229/ucp-news/main/news.json";

function trimText(text, maxLength) {
  if (!text) return "";
  return text.length > maxLength ? text.slice(0, maxLength - 3) + "..." : text;
}

async function fetchNews() {
  try {
    const res = await fetch(NEWS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Fetch failed");
    return await res.json();
  } catch (e) {
    console.error("News fetch error:", e);
    return {
      headline: "Updates coming soon",
      subtitle: "Please check back later.",
    };
  }
}

async function createNewsSection() {
  const { headline, subtitle } = await fetchNews();

  const el = document.createElement("div");
  el.className = "news-section";

  el.innerHTML = `
    <div class="news-header">
      <span class="news-label">Latest UCP News</span>
    </div>
    <div class="news-headline">${trimText(headline, 50)}</div>
    <div class="news-subtitle">${trimText(subtitle, 70)}</div>
  `;

  document.body.appendChild(el);
}

function createFeedbackLink() {
  const feedbackLink = document.createElement("a");
  feedbackLink.className = "feedback-link";
  feedbackLink.href = "https://www.instagram.com/raz0229";
  feedbackLink.target = "_blank";

  feedbackLink.innerHTML = `
    <svg class="feedback-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
      <path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/>
    </svg>
    Give Feedback
  `;

  document.body.appendChild(feedbackLink);
}

// Initialize
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    createNewsSection();
    createFeedbackLink();
  });
} else {
  createNewsSection();
  createFeedbackLink();
}
