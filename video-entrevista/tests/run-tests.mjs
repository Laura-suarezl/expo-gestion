// Pruebas automáticas del video en Chrome sin interfaz (protocolo DevTools, sin dependencias).
// Uso:  node tests/run-tests.mjs [URL]   (el servidor serve.py debe estar corriendo)
// Sale con código 1 si alguna prueba falla.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_PAGE = process.argv[2] || "http://127.0.0.1:8137/";
const SHOTS = join(HERE, "capturas");
const PORT = 9333;
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);

const results = [];
const pass = (name, detail = "") => { results.push({ ok: true, name }); console.log("  OK    " + name + (detail ? "  · " + detail : "")); };
const fail = (name, detail = "") => { results.push({ ok: false, name, detail }); console.log("  FALLA " + name + (detail ? "\n        " + detail : "")); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Chrome + CDP ----------
const profile = mkdtempSync(join(tmpdir(), "video-cdp-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--autoplay-policy=no-user-gesture-required", "--mute-audio", "--hide-scrollbars",
  "--window-size=1920,1080", "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: "ignore" });

async function waitForPort() {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return; } catch {}
    await sleep(100);
  }
  throw new Error("Chrome no abrió el puerto de depuración");
}

let ws, seq = 0;
const pending = new Map();
const listeners = [];
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
}
async function evaluate(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("Error en la página: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function key(k) {
  const map = { " ": ["Space", 32], k: ["KeyK", 75], j: ["KeyJ", 74], l: ["KeyL", 76] };
  const [code, vk] = map[k];
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, text: k });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
}

// ---------- Ayudantes que corren en la página ----------
const PAGE_HELPERS = `
window.__t = {
  audio: document.getElementById('audio'),
  async frames() { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); },
  async seek(t) {
    const a = this.audio; if (!a.paused) a.pause();
    await new Promise(res => { const to = setTimeout(res, 2500); a.addEventListener('seeked', () => { clearTimeout(to); res(); }, { once: true }); a.currentTime = t; });
    await this.frames();
    return a.currentTime;
  },
  // Compara el DOM con el estado que corresponde al segundo actual.
  mismatches() {
    const V = window.__video, t = this.audio.currentTime, bad = [];
    for (const it of V.items) {
      const e = V.expectedItem(it, t);
      const p = parseFloat(it.el.style.getPropertyValue('--p')), q = parseFloat(it.el.style.getPropertyValue('--q'));
      if (Math.abs(p - e.p) > 0.002 || Math.abs(q - e.q) > 0.002) bad.push({ in: it.tin, p, ep: e.p, q, eq: e.q });
    }
    for (const sg of V.segs) {
      const e = V.expectedSeg(sg, t);
      const s = parseFloat(sg.el.style.getPropertyValue('--s')), x = parseFloat(sg.el.style.getPropertyValue('--x'));
      if (Math.abs(s - e.s) > 0.002 || Math.abs(x - e.x) > 0.002) bad.push({ seg: sg.from, s, es: e.s, x, ex: e.x });
    }
    return bad;
  },
  snapshot() { return window.__video.items.map(it => it.el.style.getPropertyValue('--p') + '|' + it.el.style.getPropertyValue('--q')).join(',') + '#' + document.getElementById('tl-clip-rect').getAttribute('width'); },
  effOpacity(el) { let o = 1; for (let n = el; n && n.id !== 'stage'; n = n.parentElement) { const cs = getComputedStyle(n); o *= parseFloat(cs.opacity); if (cs.visibility === 'hidden') return 0; } return o; },
  // Cajas de texto visibles en coordenadas del lienzo (1920 × 1080).
  textBoxes() {
    const stage = document.getElementById('stage'), sr = stage.getBoundingClientRect(), k = sr.width / 1920;
    const out = [];
    const add = (el, label) => {
      if (this.effOpacity(el) < 0.35) return;
      let r;
      if (el.classList.contains('stamp') || el.classList.contains('tag') || el.classList.contains('tab')) r = el.getBoundingClientRect();
      else { const rg = document.createRange(); rg.selectNodeContents(el); r = rg.getBoundingClientRect(); }
      if (r.width < 1 || r.height < 1) return;
      out.push({ label: label || el.textContent.trim().slice(0, 40), x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k });
    };
    document.querySelectorAll('.scene .txt').forEach(el => add(el));
    document.querySelectorAll('.q .q-text').forEach(el => add(el));
    document.querySelectorAll('.record p, #clock-time').forEach(el => add(el));
    document.querySelectorAll('#tl-folds text').forEach(el => add(el));
    return out;
  },
  overlaps() {
    const b = this.textBoxes(), bad = [];
    for (const r of b) if (r.x < -1 || r.y < -1 || r.x + r.w > 1921 || r.y + r.h > 1081) bad.push('fuera del lienzo: «' + r.label + '» ' + JSON.stringify([Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)]));
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
      const A = b[i], B = b[j];
      const ix = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), iy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      if (ix > 2 && iy > 2) bad.push('se cruzan: «' + A.label + '» y «' + B.label + '» (' + Math.round(ix) + '×' + Math.round(iy) + ' px)');
    }
    return bad;
  },
};
true;`;

async function main() {
  await waitForPort();
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(p.method + ": " + msg.error.message)) : p.resolve(msg.result);
    } else if (msg.method) listeners.forEach((f) => f(msg));
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const loaded = new Promise((r) => listeners.push((m) => m.method === "Page.loadEventFired" && r()));
  await send("Page.navigate", { url: URL_PAGE });
  await loaded;
  await evaluate(`(async () => { await document.fonts.ready; const a = document.getElementById('audio'); if (a.readyState < 1) await new Promise(r => a.addEventListener('loadedmetadata', r, { once: true })); return true; })()`);
  await evaluate(PAGE_HELPERS);

  console.log("\nCarga");
  const info = await evaluate(`(async () => { await Promise.all([...document.fonts].map(f => f.load().catch(() => null))); return 0; })().then(() => ({ dur: window.__video.duration, fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.style), total: document.fonts.size, scenes: window.__video.segs.filter(s => s.isScene).length, items: window.__video.items.length }))`);
  Math.abs(info.dur - 291.5) < 0.6 ? pass("el audio carga y dura " + info.dur.toFixed(2) + " s") : fail("duración del audio", String(info.dur));
  info.fonts.length === info.total && info.total >= 1 ? pass("fuentes locales cargadas", info.fonts.join(", ")) : fail("fuentes locales", info.fonts.join(", "));
  pass(`${info.scenes} escenas y ${info.items} elementos con segundo de entrada`);

  console.log("\nReproducir");
  const before = await evaluate(`__t.snapshot()`);
  await key(" ");
  await sleep(2500);
  const play = await evaluate(`({ t: __t.audio.currentTime, paused: __t.audio.paused, veil: document.getElementById('veil').classList.contains('gone'), snap: __t.snapshot() })`);
  play.t > 1.2 && !play.paused ? pass("espacio arranca el audio y el tiempo avanza", play.t.toFixed(2) + " s") : fail("reproducir hace avanzar el tiempo", JSON.stringify(play));
  play.veil ? pass("el velo de inicio desaparece") : fail("el velo de inicio no desaparece");
  play.snap !== before ? pass("la pantalla cambia mientras suena") : fail("la pantalla no cambia al reproducir");

  console.log("\nPausar");
  await key("k");
  await sleep(300);
  const p1 = await evaluate(`({ t: __t.audio.currentTime, paused: __t.audio.paused, snap: __t.snapshot() })`);
  await sleep(1500);
  const p2 = await evaluate(`({ t: __t.audio.currentTime, snap: __t.snapshot(), mm: __t.mismatches().length, state: document.getElementById('clock-state').textContent })`);
  p1.paused && Math.abs(p2.t - p1.t) < 0.001 ? pass("K pausa y el tiempo queda quieto", p1.t.toFixed(3) + " s") : fail("pausar congela el tiempo", JSON.stringify({ p1: p1.t, p2: p2.t }));
  p1.snap === p2.snap ? pass("la animación queda congelada") : fail("la animación sigue moviéndose en pausa");
  p2.mm === 0 ? pass("la pantalla corresponde al segundo en pausa") : fail("estado en pausa", p2.mm + " diferencias");
  p2.state === "en pausa" ? pass("se muestra «en pausa»") : fail("indicador de pausa", p2.state);

  console.log("\nJ y L");
  await evaluate(`__t.seek(50)`);
  await key("l");
  await evaluate(`new Promise(r => setTimeout(r, 400)).then(() => __t.frames())`);
  let r = await evaluate(`({ t: __t.audio.currentTime, mm: __t.mismatches() })`);
  Math.abs(r.t - 51) < 0.05 ? pass("L avanza 1 s", "50 → " + r.t.toFixed(3)) : fail("L avanza 1 s", "50 → " + r.t);
  r.mm.length === 0 ? pass("tras L, la pantalla corresponde a ese segundo") : fail("tras L", JSON.stringify(r.mm.slice(0, 5)));
  await key("j"); await key("j");
  await evaluate(`new Promise(r => setTimeout(r, 400)).then(() => __t.frames())`);
  r = await evaluate(`({ t: __t.audio.currentTime, mm: __t.mismatches() })`);
  Math.abs(r.t - 49) < 0.05 ? pass("J retrocede 1 s (dos veces)", "51 → " + r.t.toFixed(3)) : fail("J retrocede 1 s", "51 → " + r.t);
  r.mm.length === 0 ? pass("tras J, la pantalla corresponde a ese segundo") : fail("tras J", JSON.stringify(r.mm.slice(0, 5)));
  await evaluate(`__t.seek(200)`);
  await evaluate(`__t.seek(20)`);
  r = await evaluate(`({ mm: __t.mismatches(), later: window.__video.items.filter(i => i.tin > 21).filter(i => parseFloat(i.el.style.getPropertyValue('--p')) > 0).length, vis: window.__video.segs.filter(s => s.isScene && s.el.style.visibility === 'visible').map(s => s.from) })`);
  r.mm.length === 0 && r.later === 0 && r.vis.length === 1 && r.vis[0] === 0
    ? pass("al retroceder de 200 s a 20 s desaparece lo que aún no se ha dicho")
    : fail("retroceso largo", JSON.stringify({ mm: r.mm.length, later: r.later, vis: r.vis }));

  console.log("\nFinal de cada escena");
  const sc = await evaluate(`window.__video.segs.filter(s => s.isScene).map(s => ({ from: s.from, to: s.to === Infinity ? null : s.to, trOut: s.trOut, name: s.el.dataset.name }))`);
  const dur = info.dur;
  for (const s of sc) {
    const tEnd = s.to === null ? dur : s.to - s.trOut - 0.02;
    await evaluate(`__t.seek(${tEnd})`);
    const res = await evaluate(`(() => {
      const V = window.__video, t = __t.audio.currentTime;
      const scene = V.segs.find(x => x.isScene && x.from === ${s.from});
      const own = V.items.filter(it => scene.el.contains(it.el));
      const hidden = own.filter(it => !(it.tout !== null && it.tout <= t)).filter(it => parseFloat(it.el.style.getPropertyValue('--p')) < 0.999 || __t.effOpacity(it.el) < 0.3).map(it => it.tin);
      const exited = own.filter(it => it.tout !== null && it.tout <= t).length;
      return { t, n: own.length, hidden, exited, sceneVis: __t.effOpacity(scene.el) };
    })()`);
    res.hidden.length === 0 && res.sceneVis > 0.99
      ? pass(`«${s.name}»: los ${res.n - res.exited} elementos están visibles en ${res.t.toFixed(2)} s` + (res.exited ? ` (${res.exited} salidas intencionales)` : ""))
      : fail(`«${s.name}» al final`, `sin terminar de entrar: ${JSON.stringify(res.hidden)} · escena ${res.sceneVis}`);
  }

  console.log("\nCapturas y cruces de texto");
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  const moments = await evaluate(`(() => {
    const V = window.__video, m = [];
    for (const it of V.items) m.push({ t: it.tin + it.dur + 0.05, kind: 'clave' });
    for (const s of V.segs.filter(s => s.isScene)) m.push({ t: s.to === Infinity ? V.duration : s.to - s.trOut - 0.02, kind: 'fin' });
    m.sort((a, b) => a.t - b.t);
    for (const s of V.segs.filter(s => s.isScene && s.from > 0)) m.push({ t: s.from - V.TR / 2, kind: 'transicion' });
    const out = [];
    m.sort((a, b) => a.t - b.t);
    for (const x of m) { if (x.kind === 'transicion') { out.push({ ...x }); continue; } const last = out[out.length - 1]; if (last && x.t - last.t < 0.3) { if (x.kind === 'fin') last.kind = 'fin'; last.t = Math.max(last.t, x.t); } else out.push({ ...x }); }
    return out.map(x => ({ ...x, t: Math.min(x.t, V.duration) }));
  })()`);
  const index = [];
  let overlapFails = 0;
  for (let i = 0; i < moments.length; i++) {
    const m = moments[i];
    await evaluate(`__t.seek(${m.t})`);
    // En pleno barrido conviven dos escenas recortadas; ahí no se mide el cruce de textos.
    const ov = m.kind === 'transicion' ? [] : await evaluate(`__t.overlaps()`);
    const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 0.5 } });
    const file = `${String(i).padStart(3, "0")}-${m.t.toFixed(2)}s-${m.kind}.png`;
    writeFileSync(join(SHOTS, file), Buffer.from(shot.data, "base64"));
    index.push({ file, t: m.t, kind: m.kind, overlaps: ov });
    if (ov.length) { overlapFails++; fail(`texto a los ${m.t.toFixed(2)} s`, ov.join("\n        ")); }
  }
  writeFileSync(join(SHOTS, "indice.json"), JSON.stringify(index, null, 1));
  if (!overlapFails) pass(`${moments.length} capturas sin textos cruzados ni fuera del lienzo`);

  console.log("\nMovimiento reducido");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate(`new Promise(r => setTimeout(r, 200))`);
  const rm = await evaluate(`(async () => {
    const V = window.__video; const it = V.items.find(i => i.tin > 100 && i.el.classList.contains('fx-rise'));
    await __t.seek(it.tin + it.dur / 3);
    const mid = { p: it.el.style.getPropertyValue('--p'), tr: getComputedStyle(it.el).transform, reduce: V.reduce };
    await __t.seek(it.tin - 0.1);
    const before = it.el.style.getPropertyValue('--p');
    const s = V.segs.find(x => x.isScene && x.from > 100);
    await __t.seek(s.from - 0.3);
    const sweep = getComputedStyle(document.getElementById('turn')).display;
    return { mid, before, sweep, mm: __t.mismatches().length };
  })()`);
  rm.mid.reduce && parseFloat(rm.mid.p) === 1 && (rm.mid.tr === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(rm.mid.tr))
    ? pass("en movimiento reducido el elemento aparece en su estado final, sin desplazarse")
    : fail("movimiento reducido: estado final sin movimiento", JSON.stringify(rm.mid));
  parseFloat(rm.before) === 0 ? pass("en movimiento reducido sigue sincronizado (antes de su segundo no aparece)") : fail("movimiento reducido: sincronía", rm.before);
  rm.sweep === "none" ? pass("en movimiento reducido no hay cinta de transición") : fail("movimiento reducido: cinta de transición", rm.sweep);
  rm.mm === 0 ? pass("en movimiento reducido la pantalla corresponde al segundo") : fail("movimiento reducido: estado", String(rm.mm));
}

let code = 0;
try {
  await main();
} catch (e) {
  fail("error de ejecución", e.stack || String(e));
} finally {
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad} pruebas bien, ${bad} con falla.`);
  code = bad ? 1 : 0;
  try { ws?.close(); } catch {}
  chrome.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(code);
}
