// Pruebas de las diapositivas en Chrome sin interfaz (protocolo DevTools, sin dependencias).
// Uso:  node tests/run-tests.mjs [URL]   (con serve.py corriendo; por defecto http://127.0.0.1:8140/diapositivas/)
// Sale con código 1 si alguna prueba falla. Guarda capturas en tests/capturas/.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_DECK = process.argv[2] || "http://127.0.0.1:8140/diapositivas/";
const SHOTS = join(HERE, "capturas");
const PORT = 9335;
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const results = [];
const pass = (n, d = "") => { results.push({ ok: true }); console.log("  OK    " + n + (d ? "  · " + d : "")); };
const fail = (n, d = "") => { results.push({ ok: false }); console.log("  FALLA " + n + (d ? "\n        " + d : "")); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "deck-cdp-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--autoplay-policy=no-user-gesture-required", "--mute-audio", "--hide-scrollbars", "--window-size=1920,1080", "--no-first-run", "about:blank"], { stdio: "ignore" });
let ws, seq = 0; const pending = new Map(); const listeners = [];
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject, method }); ws.send(JSON.stringify({ id, method, params })); });
async function evaluate(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("Error en la página: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function key(k) {
  const map = { " ": ["Space", 32], ArrowRight: ["ArrowRight", 39], ArrowLeft: ["ArrowLeft", 37], k: ["KeyK", 75], l: ["KeyL", 76], j: ["KeyJ", 74] };
  const [code, vk] = map[k];
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, text: k.length === 1 ? k : undefined });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
}

const HELPERS = `
window.__t = {
  stage: document.getElementById('stage'),
  vis(el) { for (let n = el; n && n !== this.stage; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return false; } return true; },
  boxes(slide) {
    const sr = this.stage.getBoundingClientRect(), k = sr.width / 1920, out = [];
    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
    const byEl = new Map();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement; if (!this.vis(el)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        const b = { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k };
        const block = el.closest('p,li,h1,h2,div,span,td,th,text,cite,strong,small') || el;
        if (!byEl.has(block)) byEl.set(block, []);
        byEl.get(block).push(b);
      }
    }
    for (const [el, bs] of byEl) {
      const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
      const r = Math.max(...bs.map(b => b.x + b.w)), bt = Math.max(...bs.map(b => b.y + b.h));
      out.push({ el, label: el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 42), x, y, w: r - x, h: bt - y });
    }
    return out;
  },
  check(slide, isCover) {
    const b = this.boxes(slide), bad = [];
    const sr = this.stage.getBoundingClientRect(), k = sr.width / 1920;
    const headBottom = (document.querySelector('.runhead').getBoundingClientRect().bottom - sr.top) / k;
    const footTop = (document.querySelector('.foot').getBoundingClientRect().top - sr.top) / k;
    for (const r of b) {
      if (r.x < 0 || r.y < 0 || r.x + r.w > 1920 || r.y + r.h > 1080) bad.push('fuera del lienzo: «' + r.label + '»');
      else if (!isCover && !slide.classList.contains('video') && (r.y < headBottom + 4 || r.y + r.h > footTop - 4)) bad.push('invade encabezado o pie: «' + r.label + '» y=' + Math.round(r.y) + '–' + Math.round(r.y + r.h));
    }
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
      const A = b[i], B = b[j];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const ix = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), iy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      if (ix > 2 && iy > 2) bad.push('se cruzan: «' + A.label + '» y «' + B.label + '» (' + Math.round(ix) + '×' + Math.round(iy) + ')');
    }
    return bad;
  },
  hidden(slide) {
    return [...slide.querySelectorAll('[class*="a-"]')].filter(e => { const cs = getComputedStyle(e); return parseFloat(cs.opacity) < 0.99 && !e.closest('.video'); }).map(e => (e.getAttribute('class') + ' ' + (e.textContent || '').trim().slice(0, 30)));
  },
};
true;`;

async function main() {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch {} await sleep(100); }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(p.method + ": " + msg.error.message)) : p.resolve(msg.result); } else if (msg.method) listeners.forEach((f) => f(msg)); };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const loaded = new Promise((r) => listeners.push((m) => m.method === "Page.loadEventFired" && r()));
  await send("Page.navigate", { url: URL_DECK + "#1" });
  await loaded;
  await evaluate(`document.fonts.ready.then(() => true)`);
  await evaluate(HELPERS);

  console.log("\nCarga");
  const info = await evaluate(`({ n: __deck.count, fonts: [...document.fonts].map(f => f.family + ':' + f.status), logo: document.querySelector('.cover-brand img').naturalWidth })`);
  info.n === 26 ? pass("26 diapositivas") : fail("número de diapositivas", String(info.n));
  info.fonts.every((f) => f.endsWith("loaded")) ? pass("fuente local cargada", info.fonts.join(", ")) : fail("fuente local", info.fonts.join(", "));
  info.logo > 0 ? pass("logo UPB cargado") : fail("logo UPB no carga");

  console.log("\nCada diapositiva al terminar su animación");
  rmSync(SHOTS, { recursive: true, force: true }); mkdirSync(SHOTS, { recursive: true });
  for (let i = 0; i < info.n; i++) {
    await evaluate(`__deck.go(${i})`);
    const isVideo = await evaluate(`__deck.slides[${i}].classList.contains('video')`);
    await sleep(isVideo ? 2500 : 4200);
    const r = await evaluate(`(() => { const s = __deck.slides[${i}]; return { name: s.dataset.name, bad: __t.check(s, s.classList.contains('cover')), hid: __t.hidden(s), on: s.classList.contains('on') }; })()`);
    const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 0.5 } });
    writeFileSync(join(SHOTS, `${String(i + 1).padStart(2, "0")}-final.png`), Buffer.from(shot.data, "base64"));
    const probs = [...r.bad, ...r.hid.map((h) => "no terminó visible: " + h)];
    probs.length === 0 && r.on ? pass(`${i + 1}. ${r.name}`) : fail(`${i + 1}. ${r.name}`, probs.join("\n        "));
    if (!isVideo) {
      // Captura a mitad de la construcción, para revisar el movimiento.
      await evaluate(`__deck.go(${i === 0 ? 1 : 0})`); await sleep(150);
      await evaluate(`__deck.go(${i})`); await sleep(900);
      const mid = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 0.5 } });
      writeFileSync(join(SHOTS, `${String(i + 1).padStart(2, "0")}-mitad.png`), Buffer.from(mid.data, "base64"));
    }
  }

  console.log("\nNavegación");
  await evaluate(`__deck.go(2)`); await sleep(300);
  await key("ArrowRight"); await sleep(300);
  let c = await evaluate(`({ cur: __deck.current, hash: location.hash, page: document.getElementById('pageno').textContent })`);
  c.cur === 3 && c.hash === "#4" && c.page === "4 / 26" ? pass("→ avanza, actualiza el número y el enlace", c.page) : fail("→ avanza", JSON.stringify(c));
  await key("ArrowLeft"); await sleep(300);
  c = await evaluate(`__deck.current`);
  c === 2 ? pass("← retrocede") : fail("← retrocede", String(c));

  console.log("\nVideo embebido");
  const vi = await evaluate(`__deck.slides.findIndex(s => s.classList.contains('video'))`);
  await evaluate(`__deck.go(${vi})`);
  await evaluate(`new Promise(r => { const f = document.getElementById('video-frame'); const ok = () => { const a = f.contentDocument && f.contentDocument.getElementById('audio'); if (a && a.readyState >= 1) r(true); else setTimeout(ok, 200); }; ok(); })`);
  await key(" "); await sleep(2200);
  let v = await evaluate(`(() => { const a = document.getElementById('video-frame').contentDocument.getElementById('audio'); return { t: a.currentTime, paused: a.paused }; })()`);
  v.t > 1 && !v.paused ? pass("Espacio arranca el video desde las diapositivas", v.t.toFixed(2) + " s") : fail("Espacio arranca el video", JSON.stringify(v));
  await key("k"); await sleep(400);
  const t1 = await evaluate(`document.getElementById('video-frame').contentDocument.getElementById('audio').currentTime`);
  await key("l"); await sleep(500);
  const t2 = await evaluate(`document.getElementById('video-frame').contentDocument.getElementById('audio').currentTime`);
  Math.abs(t2 - t1 - 1) < 0.1 ? pass("K pausa y L avanza 1 s dentro del video", t1.toFixed(2) + " → " + t2.toFixed(2)) : fail("K y L en el video", t1 + " → " + t2);
  await key(" "); await sleep(600);
  await key("ArrowRight"); await sleep(500);
  v = await evaluate(`({ cur: __deck.current, paused: document.getElementById('video-frame').contentDocument.getElementById('audio').paused })`);
  v.cur === vi + 1 && v.paused ? pass("→ sale del video y lo deja en pausa") : fail("salir del video", JSON.stringify(v));
  const pal = await evaluate(`(() => { const d = document.getElementById('video-frame').contentDocument; const cs = d.defaultView.getComputedStyle(d.getElementById('stage')); return { bg: cs.backgroundColor, font: d.defaultView.getComputedStyle(d.querySelector('.q-text')).fontFamily, ribbon: d.defaultView.getComputedStyle(d.documentElement).getPropertyValue('--ribbon').trim() }; })()`);
  pal.bg === "rgb(242, 242, 242)" && /Manrope/.test(pal.font) && pal.ribbon === "#072e36" ? pass("el video usa la paleta y la letra de las diapositivas", JSON.stringify(pal)) : fail("paleta del video", JSON.stringify(pal));

  console.log("\nMovimiento reducido");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate(`__deck.go(0)`); await sleep(200);
  await evaluate(`__deck.go(3)`); await sleep(250);
  const rm = await evaluate(`__t.hidden(__deck.slides[3]).length`);
  rm === 0 ? pass("con movimiento reducido todo aparece de inmediato") : fail("movimiento reducido", rm + " elementos ocultos");
}

try { await main(); } catch (e) { fail("error de ejecución", e.stack || String(e)); }
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad} pruebas bien, ${bad} con falla.`);
try { ws?.close(); } catch {}
chrome.kill(); await sleep(300);
try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(bad ? 1 : 0);
