/* Asesor IA — panel lateral dentro de claude.ai, chatgpt.com, gemini.google.com y chat.deepseek.com.
 * Lee solo lo que escribes y el texto visible del chat; no envía nada a ningún servidor. */
(function () {
  "use strict";
  if (window.__asesorIA) return;
  window.__asesorIA = true;
  const A = globalThis.AsesorIA;
  const ext = globalThis.chrome || globalThis.browser;

  const host = location.hostname;
  const PROVIDER = /claude\.ai$/.test(host) ? "claude"
    : /chatgpt\.com$|chat\.openai\.com$/.test(host) ? "chatgpt"
    : /gemini\.google\.com$/.test(host) ? "gemini"
    : /deepseek\.com$/.test(host) ? "deepseek" : "claude";

  const SELECTORS = {
    claude: ['div.ProseMirror[contenteditable="true"]', 'fieldset [contenteditable="true"]'],
    chatgpt: ["#prompt-textarea", 'form [contenteditable="true"]', "form textarea"],
    gemini: ['rich-textarea [contenteditable="true"]', '.ql-editor[contenteditable="true"]'],
    deepseek: ["textarea#chat-input", "textarea"],
  };
  const COLORS = ["#888", "#2d8653", "#2f68ad", "#b86a00", "#bf3b28"];

  // ---------- Almacenamiento (de la extensión, no de la página) ----------
  const st = {
    get(k, d) {
      return new Promise((res) => {
        try { ext.storage.local.get(k, (o) => res(o && k in o ? o[k] : d)); } catch (e) { res(d); }
      });
    },
    set(k, v) { try { ext.storage.local.set({ [k]: v }); } catch (e) {} },
  };

  // ---------- Encontrar la caja de texto del chat ----------
  let lastEditable = null;
  const isEditable = (el) => el && (el.tagName === "TEXTAREA" || el.isContentEditable);
  const visible = (el) => el && el.isConnected && el.getClientRects().length > 0;
  document.addEventListener("focusin", (e) => {
    const t = e.composedPath()[0];
    if (isEditable(t) && !(t.getRootNode() instanceof ShadowRoot && t.getRootNode().host === hostEl)) lastEditable = t;
  }, true);

  function findInput() {
    for (const sel of SELECTORS[PROVIDER]) {
      const all = Array.from(document.querySelectorAll(sel)).filter(visible);
      if (all.length) return all[all.length - 1];
    }
    if (visible(lastEditable)) return lastEditable;
    return null;
  }
  const readInput = (el) => (!el ? "" : el.tagName === "TEXTAREA" ? el.value : el.innerText || "");

  function writeInput(el, text) {
    el.focus();
    if (el.tagName === "TEXTAREA") {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    return document.execCommand("insertText", false, text);
  }

  // Texto visible de la conversación = lo que se reenvía en cada mensaje (aprox.).
  let ctxCache = { at: 0, tokens: 0 };
  function conversationTokens(inputText) {
    const now = Date.now();
    if (now - ctxCache.at < 4000) return ctxCache.tokens;
    const root = document.querySelector("main") || document.body;
    const all = root.innerText || "";
    ctxCache = { at: now, tokens: Math.max(0, A.estimateTokens(all) - A.estimateTokens(inputText)) };
    return ctxCache.tokens;
  }

  // ---------- Interfaz (Shadow DOM para no chocar con los estilos de la página) ----------
  const hostEl = document.createElement("div");
  hostEl.id = "asesor-ia-root";
  hostEl.style.cssText = "all:initial;position:fixed;z-index:2147483646;right:0;top:30%;";
  const root = hostEl.attachShadow({ mode: "open" });
  root.innerHTML = `
<style>
:host { --bg:#ffffff; --ink:#14212b; --muted:#556672; --line:#d3dce1; --soft:#eef2f4; --accent:#b86a00; --acc-ink:#fff; }
@media (prefers-color-scheme: dark) { :host { --bg:#15212a; --ink:#e4ecf0; --muted:#93a5b1; --line:#293a45; --soft:#0e161c; --accent:#f0a63a; --acc-ink:#14212b; } }
* { box-sizing:border-box; }
.wrap { display:flex; align-items:flex-start; font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif; color:var(--ink); }
.tab { writing-mode:vertical-rl; transform:rotate(180deg); border:1px solid var(--line); border-right:0; background:var(--bg); color:var(--ink);
  padding:10px 6px; border-radius:0 8px 8px 0; cursor:pointer; font:700 12px system-ui,sans-serif; display:flex; gap:6px; align-items:center; }
.dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
.panel { width:300px; max-height:72vh; overflow:auto; background:var(--bg); border:1px solid var(--line); border-right:0;
  border-radius:10px 0 0 10px; padding:12px; display:grid; gap:10px; box-shadow:0 6px 24px rgba(0,0,0,.18); }
.panel[hidden], .tab[hidden] { display:none; }
.row { display:flex; justify-content:space-between; gap:8px; }
.lbl { font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); font-weight:700; }
.model { font-size:20px; font-weight:800; line-height:1.15; }
.mode, .note { color:var(--muted); }
.note { font-size:11.5px; margin:0; }
.meter { display:grid; grid-template-columns:repeat(4,1fr); gap:3px; }
.meter span { height:7px; border-radius:2px; background:var(--soft); }
table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
td { padding:3px 0; border-bottom:1px solid var(--line); } td:last-child { text-align:right; }
tr.t td { border:0; font-weight:700; }
ul { margin:0; padding-left:16px; display:grid; gap:3px; }
.chks { display:flex; flex-wrap:wrap; gap:4px; }
.chk { font-size:11px; padding:1px 6px; border-radius:5px; border:1px solid var(--line); }
.chk.ok { color:#2d8653; border-color:#2d8653; } .chk.no { color:#bf3b28; border-color:#bf3b28; }
.btns { display:flex; gap:6px; flex-wrap:wrap; }
button { font:700 12px system-ui,sans-serif; border-radius:7px; padding:7px 10px; cursor:pointer; border:1px solid var(--line); background:var(--bg); color:var(--ink); }
button.p { background:var(--accent); color:var(--acc-ink); border-color:var(--accent); }
button:focus-visible, .tab:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
.status { min-height:1.2em; font-size:11.5px; color:#2d8653; margin:0; }
.x { border:0; background:none; font-size:16px; padding:0 4px; color:var(--muted); }
</style>
<div class="wrap">
  <button class="tab" id="tab" type="button" title="Asesor IA"><span class="dot" id="dot"></span>Asesor IA</button>
  <div class="panel" id="panel" hidden>
    <div class="row"><span class="lbl" id="where"></span><button class="x" id="close" type="button" aria-label="Cerrar">×</button></div>
    <div class="meter" id="meter"><span></span><span></span><span></span><span></span></div>
    <div><div class="lbl" id="lvl"></div><div class="model" id="model"></div><div class="mode" id="mode"></div></div>
    <table><tbody>
      <tr><td>Tu mensaje</td><td id="tIn"></td></tr>
      <tr><td>Historial visible</td><td id="tCtx"></td></tr>
      <tr><td>Respuesta + pensamiento</td><td id="tOut"></td></tr>
      <tr class="t"><td>Total aprox.</td><td id="tTot"></td></tr>
    </tbody></table>
    <p class="note" id="vs"></p>
    <div class="chks" id="chks"></div>
    <div class="btns"><button class="p" id="ins" type="button">Poner prompt mejorado</button><button id="cp" type="button">Copiar</button></div>
    <p class="status" id="status"></p>
    <div><div class="lbl">Para gastar menos</div><ul id="tips"></ul></div>
    <p class="note">Estimación ±30%. Uso real en Claude: Configuración → Uso (Settings → Usage).</p>
  </div>
</div>`;
  (document.body || document.documentElement).appendChild(hostEl);
  const $ = (id) => root.getElementById(id);

  let open = false, last = null, lastKey = "";

  function setOpen(v) {
    open = v;
    $("panel").hidden = !v;
    $("tab").hidden = v;
    st.set("asesor.open", v);
    if (v) { ctxCache.at = 0; tick(true); }
  }

  function li(ul, items) {
    ul.textContent = "";
    for (const t of items) { const e = document.createElement("li"); e.textContent = t; ul.appendChild(e); }
  }

  function tick(force) {
    const el = findInput();
    const text = readInput(el);
    const ctx = open ? conversationTokens(text) : 0;
    const key = text + "|" + ctx;
    if (!force && key === lastKey) return;
    lastKey = key;
    const r = A.analyze(text, { provider: PROVIDER, contextTokens: ctx });
    last = r;
    $("dot").style.background = text.trim() ? COLORS[r.level] : COLORS[0];
    if (!open) return;
    $("where").textContent = "En " + r.providerLabel;
    const spans = $("meter").children;
    for (let i = 0; i < 4; i++) spans[i].style.background = text.trim() && i < r.level ? COLORS[r.level] : "";
    if (!text.trim()) {
      $("lvl").textContent = "Escribe tu pedido en el chat";
      $("model").textContent = "—";
      $("mode").textContent = el ? "Aquí verás qué modelo usar." : "No encuentro la caja de texto: haz clic en ella.";
    } else {
      $("lvl").textContent = "Tarea " + r.levelName.toLowerCase() + " · usa";
      $("model").textContent = r.rec.model;
      $("mode").textContent = r.rec.mode;
    }
    $("tIn").textContent = A.fmt(r.tokens.input);
    $("tCtx").textContent = A.fmt(r.tokens.context);
    $("tOut").textContent = "~" + A.fmt(r.tokens.output + r.tokens.thinking);
    $("tTot").textContent = "~" + A.fmt(r.tokens.total);
    $("vs").textContent = r.vsOpus && text.trim() ? "Con Opus 5.5 pagarías ~" + r.vsOpus + "× más por token (precio de API)." : r.providerNote;
    const ch = $("chks"); ch.textContent = "";
    for (const a of r.audit.filter((x) => x.needed)) {
      const s = document.createElement("span");
      s.className = "chk " + (a.ok ? "ok" : "no");
      s.textContent = (a.ok ? "✓ " : "✗ ") + a.label;
      ch.appendChild(s);
    }
    li($("tips"), r.tips.slice(0, 3));
  }

  function flash(m) { $("status").textContent = m; setTimeout(() => ($("status").textContent = ""), 2500); }
  async function count() {
    const s = await st.get("asesor.stats", [0, 0, 0, 0, 0]);
    s[last.level]++; st.set("asesor.stats", s);
  }

  $("tab").addEventListener("click", () => setOpen(true));
  $("close").addEventListener("click", () => setOpen(false));
  $("ins").addEventListener("click", () => {
    const el = findInput();
    if (!el || !readInput(el).trim()) { flash("Escribe primero tu pedido en el chat."); return; }
    tick(true);
    const ok = writeInput(el, last.improved);
    flash(ok ? "Listo. Llena los [corchetes] y envía." : "No pude escribir en la caja; usa Copiar.");
    count();
  });
  $("cp").addEventListener("click", () => {
    const el = findInput();
    if (!readInput(el).trim()) { flash("Escribe primero tu pedido en el chat."); return; }
    tick(true);
    navigator.clipboard.writeText(last.improved).then(() => { flash("Copiado."); count(); }, () => flash("El navegador bloqueó el portapapeles."));
  });

  document.addEventListener("input", () => setTimeout(() => tick(false), 120), true);
  setInterval(() => tick(false), 2000);
  st.get("asesor.open", false).then(setOpen);
})();
