// Diapositivas: navegación, construcción animada por diapositiva y video embebido.
(() => {
  "use strict";
  const W = 1920, H = 1080;
  const stage = document.getElementById("stage");
  const slides = [...stage.querySelectorAll(".slide")];
  const pageno = document.getElementById("pageno");
  const secName = document.getElementById("sec-name");
  const segs = [...document.querySelectorAll("#rail .seg")];
  const frame = document.getElementById("video-frame");
  const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SECTION_LABEL = { r1: "Ronda 1", iv: "Entrevista", r2: "Ronda 2" };
  const fmt = new Intl.NumberFormat("es-CO");
  let current = -1;
  const timers = [];

  function fit() {
    const sc = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.transform = "translate(-50%, -50%) scale(" + sc + ")";
  }
  window.addEventListener("resize", fit);
  fit();

  // Las puntas de flecha aparecen cuando su línea termina de dibujarse, no antes.
  for (const p of stage.querySelectorAll("path.a-draw[marker-end]")) {
    const st = p.getAttribute("style") || "";
    const d = parseFloat((st.match(/--d:\s*([\d.]+)s/) || [])[1] || 0);
    const t = parseFloat((st.match(/--t:\s*([\d.]+)s/) || [])[1] || 1.2);
    const head = p.cloneNode(false);
    head.setAttribute("class", "a-fade");
    head.setAttribute("style", "--d:" + (d + t * 0.85).toFixed(2) + "s");
    head.setAttribute("stroke", "none");
    head.setAttribute("fill", "none");
    head.removeAttribute("pathLength");
    p.removeAttribute("marker-end");
    p.after(head);
  }

  // Cifras que cuentan hasta su valor al abrir la diapositiva.
  function runCounters(slide) {
    for (const el of slide.querySelectorAll("[data-count]")) {
      const end = parseFloat(el.dataset.count);
      if (reduce()) { el.textContent = fmt.format(end); continue; }
      const host = el.closest("[style*='--d']");
      const delay = host ? parseFloat(getComputedStyle(host).getPropertyValue("--d")) * 1000 || 0 : 0;
      el.textContent = "0";
      const t0 = performance.now() + delay;
      const dur = 1100;
      const step = (now) => {
        const k = Math.min(1, Math.max(0, (now - t0) / dur));
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt.format(Math.round(end * e));
        if (k < 1 && slide.classList.contains("on")) requestAnimationFrame(step);
        else el.textContent = fmt.format(end);
      };
      requestAnimationFrame(step);
    }
  }

  function videoDoc() {
    try { return frame && frame.contentDocument; } catch { return null; }
  }
  function sendKeyToVideo(key) {
    const d = videoDoc();
    if (d) d.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  }
  function pauseVideo() {
    const d = videoDoc();
    const a = d && d.getElementById("audio");
    if (a && !a.paused) a.pause();
  }

  function go(n, opts = {}) {
    n = Math.max(0, Math.min(slides.length - 1, n));
    if (n === current) return;
    const dir = n > current ? 1 : -1;
    const prev = slides[current];
    if (prev) {
      prev.classList.remove("on");
      prev.classList.toggle("past", dir > 0);
      if (prev.classList.contains("video")) pauseVideo();
    }
    const s = slides[n];
    stage.style.setProperty("--dir", dir);
    s.classList.remove("past");
    // Reiniciar las animaciones de construcción cada vez que se entra.
    void s.offsetWidth;
    s.classList.add("on");
    current = n;

    if (s.classList.contains("video") && frame && !frame.getAttribute("src")) frame.setAttribute("src", frame.dataset.src);
    stage.classList.toggle("is-video", s.classList.contains("video"));
    stage.classList.toggle("is-cover", s.classList.contains("cover"));
    runCounters(s);

    const sec = s.dataset.section;
    secName.textContent = SECTION_LABEL[sec] + " · " + s.dataset.name;
    pageno.textContent = (n + 1) + " / " + slides.length;
    const order = ["r1", "iv", "r2"];
    for (const g of segs) {
      const gs = g.dataset.sec;
      const idx = slides.filter((x) => x.dataset.section === gs);
      const done = idx.filter((x) => slides.indexOf(x) <= n).length;
      const fill = order.indexOf(gs) < order.indexOf(sec) ? 1 : gs === sec ? done / idx.length : 0;
      g.querySelector("i").style.setProperty("--fill", fill.toFixed(3));
      g.classList.toggle("now", gs === sec);
    }
    if (!opts.noHash) history.replaceState(null, "", "#" + (n + 1));
  }

  const next = () => go(current + 1);
  const prev = () => go(current - 1);

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const onVideo = slides[current] && slides[current].classList.contains("video");
    if (onVideo && [" ", "k", "K", "j", "J", "l", "L"].includes(k)) { e.preventDefault(); sendKeyToVideo(k.toLowerCase()); return; }
    if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "Enter") { e.preventDefault(); next(); }
    else if (k === "ArrowLeft" || k === "PageUp" || k === "Backspace") { e.preventDefault(); prev(); }
    else if (k === "Home") { e.preventDefault(); go(0); }
    else if (k === "End") { e.preventDefault(); go(slides.length - 1); }
    else if (k === "f" || k === "F") {
      e.preventDefault();
      if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
    }
  }
  document.addEventListener("keydown", onKey);
  // El video, cuando tiene el foco, devuelve aquí las flechas de navegación.
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || !e.data || !e.data.deckNav) return;
    if (e.data.deckNav === "next") next();
    else if (e.data.deckNav === "prev") prev();
    else if (e.data.deckNav === "fullscreen") onKey({ key: "f", preventDefault() {} });
  });

  const start = Math.max(1, Math.min(slides.length, parseInt((location.hash || "#1").slice(1), 10) || 1));
  go(start - 1, { noHash: true });
  window.addEventListener("hashchange", () => {
    const n = parseInt(location.hash.slice(1), 10);
    if (n) go(n - 1, { noHash: true });
  });

  // Acceso para las pruebas.
  window.__deck = { go, get current() { return current; }, get count() { return slides.length; }, slides };
})();
