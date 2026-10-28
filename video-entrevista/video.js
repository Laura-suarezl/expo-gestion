// El audio es el reloj: todo el estado de la pantalla se calcula desde audio.currentTime.
(() => {
  "use strict";

  const TR = 0.6;          // duración del cambio de escena dentro de una pregunta (s)
  const TR_FOLD = 1.0;     // duración del cambio de pregunta: la cinta sube y despliega la página (s)
  const DUR = 0.7;         // duración por defecto de una entrada (s)
  const OUT_DUR = 0.45;    // duración por defecto de una salida (s)
  const W = 1920, H = 1080;
  const TL_X0 = 96, TL_X1 = 1824, TL_Y = 50;

  const audio = document.getElementById("audio");
  const stage = document.getElementById("stage");
  const veil = document.getElementById("veil");
  const turnSvg = document.getElementById("turn");
  const turnPath = document.getElementById("turn-path");
  const turnRing = document.getElementById("turn-ring");
  const clockTime = document.getElementById("clock-time");
  const clockState = document.getElementById("clock-state");
  const clock = document.getElementById("clock");
  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduce = reduceQuery.matches;
  reduceQuery.addEventListener("change", (e) => { reduce = e.matches; render(); });

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const easeOut = (x) => 1 - Math.pow(1 - x, 4);
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const num = (v, d) => (v === undefined || v === "" ? d : parseFloat(v));

  // Progreso 0..1 de una transición que empieza en `start` y dura `dur`.
  function prog(t, start, dur, ease = easeOut) {
    if (reduce) return t >= start ? 1 : 0;
    return ease(clamp((t - start) / dur, 0, 1));
  }

  // Lo que el HTML declara: rangos de escena/pregunta y segundos de entrada/salida.
  const segs = [...document.querySelectorAll(".scene[data-from], .q[data-from]")].map((el) => ({
    el,
    isScene: el.classList.contains("scene"),
    from: num(el.dataset.from, 0),
    to: num(el.dataset.to, Infinity),
    s: -1, x: -1, vis: null,
  }));
  const items = [...document.querySelectorAll("[data-in]")].map((el) => ({
    el,
    tin: num(el.dataset.in, 0),
    dur: num(el.dataset.dur, DUR),
    tout: el.dataset.out === undefined ? null : num(el.dataset.out, null),
    odur: num(el.dataset.outdur, OUT_DUR),
    p: -1, q: -1,
  }));
  const scenes = segs.filter((s) => s.isScene);
  const questions = segs.filter((s) => !s.isScene);

  // Preguntas: primero sale la anterior y luego entra la nueva, para que dos textos nunca se monten.
  // Escenas dentro de una pregunta: pase tranquilo de TR segundos.
  // Escena que abre una pregunta (TR_FOLD segundos): la página anterior se va en el primer 35 %,
  // la cinta sube desde su nudo y dobla hacia el marcador, y la página nueva se despliega
  // desde el nudo en la segunda mitad.
  function segState(seg, t) {
    if (!seg.isScene) {
      const d = TR / 2;
      const s = seg.from <= 0 ? 1 : prog(t, seg.from - d, d);
      const x = seg.to === Infinity ? 0 : prog(t, seg.to - TR, d);
      return { s, x };
    }
    let s;
    if (seg.from <= 0) s = 1;
    else if (seg.turn === "fold") s = prog(t, seg.from - TR_FOLD * 0.5, TR_FOLD * 0.5, easeInOut);
    else s = prog(t, seg.from - TR, TR, easeInOut);
    let x;
    if (seg.to === Infinity) x = 0;
    else if (seg.foldOut) x = prog(t, seg.to - TR_FOLD, TR_FOLD * 0.35, easeOut);
    else x = prog(t, seg.to - TR, TR, easeInOut);
    return { s, x };
  }
  function itemState(it, t) {
    const p = prog(t, it.tin, it.dur);
    const q = it.tout === null ? 0 : prog(t, it.tout, it.odur);
    return { p, q };
  }

  // Cinta de la entrevista (abajo): roja hasta el segundo actual, hilo gris hacia adelante.
  const tlSilk = document.getElementById("tl-silk");
  const tlSheen = document.getElementById("tl-sheen");
  const tlThread = document.getElementById("tl-thread");
  const tlClip = document.getElementById("tl-clip-rect");
  const tlNow = document.getElementById("tl-now");
  const tlFolds = document.getElementById("tl-folds");
  const waveY = (x) => TL_Y + 9 * Math.sin(((x - TL_X0) / (TL_X1 - TL_X0)) * Math.PI * 2 * 5);
  (function buildRibbon() {
    let d = "";
    for (let x = TL_X0; x <= TL_X1; x += 6) d += (d ? " L" : "M") + x + " " + waveY(x).toFixed(1);
    tlSilk.setAttribute("d", d);
    tlSheen.setAttribute("d", d);
    tlThread.setAttribute("d", d);
  })();
  let duration = 291.5;
  const xAt = (t) => TL_X0 + (clamp(t, 0, duration) / duration) * (TL_X1 - TL_X0);
  const folds = [];
  function buildFolds() {
    tlFolds.textContent = "";
    folds.length = 0;
    const marks = questions.map((q) => ({ t: q.from, label: q.el.querySelector(".q-mark span").textContent }));
    const closing = scenes[scenes.length - 1];
    marks.push({ t: closing.from, label: "cierre" });
    const ns = "http://www.w3.org/2000/svg";
    for (const m of marks) {
      const g = document.createElementNS(ns, "g");
      g.setAttribute("class", "tl-fold");
      const x = xAt(m.t);
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", x); c.setAttribute("cy", waveY(x)); c.setAttribute("r", 8);
      const t1 = document.createElementNS(ns, "text");
      t1.setAttribute("x", x); t1.setAttribute("y", 104); t1.setAttribute("text-anchor", "middle");
      t1.textContent = m.label;
      const t2 = document.createElementNS(ns, "text");
      t2.setAttribute("x", x); t2.setAttribute("y", 132); t2.setAttribute("text-anchor", "middle");
      t2.textContent = fmt(m.t);
      g.append(c, t1, t2);
      tlFolds.append(g);
      folds.push({ g, t: m.t });
    }
    // Cada escena sabe cómo entra: desplegándose desde el nudo si abre una pregunta.
    for (const sc of scenes) {
      const opens = sc.from <= 0 || marks.some((m) => Math.abs(m.t - sc.from) < 1);
      sc.turn = opens ? "fold" : "quiet";
      sc.ox = xAt(sc.from);
      sc.el.dataset.turn = sc.turn;
      sc.el.style.setProperty("--ox", sc.ox.toFixed(1) + "px");
    }
    scenes.forEach((sc, i) => {
      sc.foldOut = !!scenes[i + 1] && scenes[i + 1].turn === "fold";
      sc.trOut = sc.foldOut ? TR_FOLD : TR;
    });
  }
  function fmt(t) {
    t = Math.max(0, t);
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  let started = false;

  function render(tOverride) {
    const t = typeof tOverride === "number" ? tOverride : audio.currentTime;

    let turnSeg = null;
    for (const seg of segs) {
      const { s, x } = segState(seg, t);
      if (s !== seg.s) { seg.el.style.setProperty("--s", s.toFixed(4)); seg.s = s; }
      if (x !== seg.x) { seg.el.style.setProperty("--x", x.toFixed(4)); seg.x = x; }
      const vis = s > 0 && x < 1;
      if (vis !== seg.vis) { seg.el.style.visibility = vis ? "visible" : "hidden"; seg.vis = vis; }
      seg.el.toggleAttribute("data-active", t >= seg.from && t < seg.to);
      if (seg.isScene && seg.turn === "fold" && seg.from > 0 && t >= seg.from - TR_FOLD && t < seg.from) turnSeg = { seg, s };
    }
    for (const it of items) {
      const { p, q } = itemState(it, t);
      if (p !== it.p) { it.el.style.setProperty("--p", p.toFixed(4)); it.p = p; }
      if (q !== it.q) { it.el.style.setProperty("--q", q.toFixed(4)); it.q = q; }
    }

    // Cambio de pregunta: la cinta sube desde su nudo, dobla hacia el marcador de la pregunta
    // y la página nueva se despliega desde el nudo, con su borde visible.
    if (turnSeg && !reduce) {
      const { seg, s } = turnSeg;
      const u = clamp((t - (seg.from - TR_FOLD)) / TR_FOLD, 0, 1);
      const draw = easeInOut(clamp((u - 0.3) / 0.45, 0, 1));
      const fade = u > 0.85 ? (1 - u) / 0.15 : 1;
      if (turnPath.dataset.for !== String(seg.from)) {
        turnPath.setAttribute("d", "M" + seg.ox.toFixed(1) + " 942 V214 H104 V106");
        turnRing.setAttribute("cx", seg.ox.toFixed(1));
        turnPath.dataset.for = String(seg.from);
      }
      turnPath.style.strokeDashoffset = (1 - draw).toFixed(4);
      turnRing.setAttribute("r", (s * 2300).toFixed(1));
      turnRing.style.opacity = s > 0 && s < 1 ? "1" : "0";
      turnSvg.style.opacity = fade.toFixed(3);
      turnSvg.style.visibility = "visible";
      // El reloj se aparta mientras la cinta sube, para que nunca quede tapado.
      const c = u < 0.25 ? 1 - u / 0.25 : u > 0.9 ? (u - 0.9) / 0.1 : 0;
      clock.style.opacity = c.toFixed(3);
    } else {
      turnSvg.style.visibility = "hidden";
      clock.style.opacity = "1";
    }

    const x = xAt(t);
    tlClip.setAttribute("width", x.toFixed(1));
    tlNow.setAttribute("cx", x.toFixed(1));
    tlNow.setAttribute("cy", waveY(x).toFixed(1));
    let current = null;
    for (const f of folds) { if (t >= f.t - 0.001) current = f; }
    for (const f of folds) {
      f.g.classList.toggle("done", t >= f.t - 0.001);
      f.g.classList.toggle("now", f === current);
    }
    clockTime.textContent = fmt(t) + " / " + fmt(duration);
    clockState.textContent = started && audio.paused && !audio.ended ? "en pausa" : "";
  }

  // Bucle: solo corre mientras suena; al pausar, la pantalla queda congelada.
  let raf = 0;
  function loop() {
    render();
    raf = audio.paused ? 0 : requestAnimationFrame(loop);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }
  audio.addEventListener("play", kick);
  audio.addEventListener("playing", kick);
  for (const ev of ["pause", "seeked", "seeking", "timeupdate", "ended"]) audio.addEventListener(ev, () => render());
  audio.addEventListener("loadedmetadata", () => {
    if (isFinite(audio.duration) && audio.duration > 0) duration = audio.duration;
    buildFolds();
    render();
  });

  function start() {
    started = true;
    veil.classList.add("gone");
    audio.play().catch(() => {});
  }
  function toggle() {
    if (!started) return start();
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
    render();
  }
  function seekBy(d) {
    const target = clamp(audio.currentTime + d, 0, duration);
    audio.currentTime = target;
    render(target);
  }
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    // Embebido en las diapositivas: las flechas y F pertenecen a la presentación.
    if (window.parent !== window) {
      const nav = { arrowright: "next", pagedown: "next", arrowleft: "prev", pageup: "prev", f: "fullscreen" }[k];
      if (nav) { e.preventDefault(); window.parent.postMessage({ deckNav: nav }, location.origin); return; }
    }
    if (k === " " || k === "k") { e.preventDefault(); toggle(); }
    else if (k === "j") { e.preventDefault(); seekBy(-1); }
    else if (k === "l") { e.preventDefault(); seekBy(1); }
    else if (k === "f") { e.preventDefault(); fullscreen(); }
  });
  document.addEventListener("click", toggle);

  // Escala del lienzo 16:9 sin deformar.
  function fit() {
    const sc = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.transformOrigin = "50% 50%";
    stage.style.transform = "translate(-50%, -50%) scale(" + sc + ")";
  }
  window.addEventListener("resize", fit);
  fit();

  buildFolds();
  render(0);

  // Acceso para las pruebas automáticas.
  window.__video = {
    TR, TR_FOLD, segs, items,
    get duration() { return duration; },
    get started() { return started; },
    get reduce() { return reduce; },
    render,
    expectedItem: (it, t) => itemState(it, t),
    expectedSeg: (seg, t) => segState(seg, t),
  };
})();
