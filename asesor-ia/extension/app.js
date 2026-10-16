/* Asesor IA — interfaz (app web, teléfono y panel lateral de la extensión de Chrome). */
(function () {
  "use strict";
  var A = window.AsesorIA;
  var $ = function (id) { return document.getElementById(id); };
  var SAMPLE = "Hazme un script en PowerShell 7 que liste los programas instalados y los guarde en C:\\Reportes\\programas.csv";
  var COLORS = ["", "var(--l1)", "var(--l2)", "var(--l3)", "var(--l4)"];
  var IN_EXTENSION = location.protocol === "chrome-extension:";
  var chromeStore = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage.local : null;

  // ---------- Almacenamiento: chrome.storage en la extensión (lo comparte con la pestaña del chat), localStorage en la web ----------
  var store = {
    get: function (k, d) {
      if (chromeStore) return new Promise(function (res) { try { chromeStore.get(k, function (o) { res(o && k in o ? o[k] : d); }); } catch (e) { res(d); } });
      try { var v = localStorage.getItem(k); return Promise.resolve(v ? JSON.parse(v) : d); } catch (e) { return Promise.resolve(d); }
    },
    set: function (k, v) {
      if (chromeStore) { try { var o = {}; o[k] = v; chromeStore.set(o); } catch (e) {} return; }
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    }
  };

  var state = { profile: A.cleanProfile(null), learned: A.cleanLearned(null), answers: {}, last: null };
  var timer = null;

  function resetAnswers() { state.answers = {}; $("qs").dataset.key = ""; }
  function provider() { var c = document.querySelector('input[name="app"]:checked'); return c ? c.value : "claude"; }
  function li(list, items) {
    list.textContent = "";
    items.forEach(function (t) { var e = document.createElement("li"); e.textContent = t; list.appendChild(e); });
  }
  function flash(el, msg) { el.textContent = msg; clearTimeout(el._t); el._t = setTimeout(function () { el.textContent = ""; }, 3000); }

  // ---------- Análisis ----------
  function render() {
    var text = $("prompt").value;
    var r = A.analyze(text, {
      provider: provider(), contextTokens: A.contextFromMessages($("ctx").value),
      profile: state.profile, learned: state.learned, answers: state.answers
    });
    state.last = r;
    var spans = $("meter").children;
    for (var i = 0; i < 4; i++) spans[i].style.background = i < r.level ? COLORS[r.level] : "";
    $("levelPill").textContent = "Tarea " + r.levelName.toLowerCase();
    $("levelPill").style.background = COLORS[r.level];
    $("useLabel").textContent = "Usa en " + r.providerLabel;
    $("model").textContent = r.rec.model;
    $("mode").textContent = r.rec.mode;
    li($("why"), [r.levelShort].concat(r.why));
    $("provNote").textContent = r.providerNote;

    $("tIn").textContent = A.fmt(r.tokens.input);
    $("tImp").textContent = A.fmt(r.improvedTokens);
    $("tCtx").textContent = A.fmt(r.tokens.context);
    $("tOut").textContent = "~" + A.fmt(r.tokens.output);
    $("tThink").textContent = r.tokens.thinking ? "~" + A.fmt(r.tokens.thinking) : "0";
    $("tTotal").textContent = "~" + A.fmt(r.improvedTokens + r.tokens.context + r.tokens.output + r.tokens.thinking);
    if (r.vsOpus) {
      $("vsOpus").hidden = false;
      $("vsOpus").textContent = "Si hicieras esto con Opus 5.5 pagarías unas " + r.vsOpus + " veces más por token que con " + r.rec.model + " (precio de API).";
    } else { $("vsOpus").hidden = true; }

    renderQuestions(r);
    var checks = $("checks"); checks.textContent = "";
    r.audit.filter(function (a) { return a.needed; }).forEach(function (a) {
      var s = document.createElement("span");
      s.className = "chk " + (a.ok ? "ok" : "no");
      s.textContent = (a.ok ? "✓ " : "✗ ") + a.label;
      checks.appendChild(s);
    });
    $("improved").value = text.trim() ? r.improved : "";
    li($("tips"), r.tips);
    $("sampleHint").hidden = text !== SAMPLE;
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(render, 150); }

  // Las preguntas se redibujan solo si cambian, para no perder lo que la persona está escribiendo.
  function renderQuestions(r) {
    var key = r.questions.map(function (q) { return q.id; }).join(",");
    var box = $("qs");
    $("qCard").hidden = !r.questions.length && !r.remembered.length;
    if (box.dataset.key !== key) {
      box.dataset.key = key;
      box.textContent = "";
      r.questions.forEach(function (q) {
        var wrap = document.createElement("div"); wrap.className = "q";
        var lab = document.createElement("label"); lab.htmlFor = "q-" + q.id; lab.textContent = q.q;
        var row = document.createElement("div"); row.className = "row";
        var inp = document.createElement("input"); inp.type = "text"; inp.id = "q-" + q.id; inp.value = state.answers[q.id] || "";
        inp.addEventListener("input", function () { state.answers[q.id] = inp.value; schedule(); });
        var mic = micButton(function (txt) { inp.value = (inp.value ? inp.value + " " : "") + txt; state.answers[q.id] = inp.value; render(); }, "Dictar respuesta");
        row.appendChild(inp); if (mic) row.appendChild(mic);
        wrap.appendChild(lab); wrap.appendChild(row);
        box.appendChild(wrap);
      });
    }
    var known = $("known"); known.textContent = "";
    r.remembered.forEach(function (k) { var s = document.createElement("span"); s.className = "tag"; s.textContent = k.label + ": " + k.value; known.appendChild(s); });
    $("knownBox").hidden = !r.remembered.length;
  }

  // ---------- Aprendizaje ----------
  function commit() {
    var r = state.last;
    if (!r || !$("prompt").value.trim()) return;
    state.learned = A.learn(state.learned, r, r.answered);
    store.set("asesor.learned", state.learned);
    renderTraining();
  }

  function renderTraining() {
    var l = state.learned;
    var box = $("stats"); box.textContent = "";
    ["Simple", "Normal", "Compleja", "Experta"].forEach(function (n, i) {
      var d = document.createElement("div");
      var num = document.createElement("span"); num.className = "num"; num.textContent = l.levels[i + 1];
      var sm = document.createElement("small"); sm.textContent = n;
      d.appendChild(num); d.appendChild(sm); box.appendChild(d);
    });
    $("exportCode").value = A.exportCode(state.profile, l);
    var ins = A.insights(l, state.profile);
    li($("insights"), ins);
    $("statsText").textContent = l.n ? (ins.length ? "" : "Sigue usando la app: con 3 pedidos empiezo a darte consejos personales.")
      : "Cada vez que copies o uses un prompt aprendo de cómo pides las cosas.";
    var facts = Object.keys(l.facts);
    $("factsBox").hidden = !facts.length;
    var ul = $("facts"); ul.textContent = "";
    facts.forEach(function (k) {
      var item = document.createElement("li");
      var s = document.createElement("span"); s.textContent = k + ": " + l.facts[k];
      var b = document.createElement("button"); b.className = "small"; b.type = "button"; b.textContent = "Olvidar";
      b.addEventListener("click", function () { delete state.learned.facts[k]; store.set("asesor.learned", state.learned); renderTraining(); render(); });
      item.appendChild(s); item.appendChild(b); ul.appendChild(item);
    });
  }

  // ---------- Perfil ----------
  var FIELDS = ["nombre", "rol", "nivel", "sistema", "herramientas", "rutas", "metas", "estilo", "noQuiero"];
  function fillProfileForm() {
    FIELDS.forEach(function (f) { $("p-" + f).value = state.profile[f] || (f === "nivel" ? "intermedio" : ""); });
    $("p-enApp").checked = state.profile.enApp;
    renderProfileExtras();
  }
  function readProfileForm() {
    var p = {}; FIELDS.forEach(function (f) { p[f] = $("p-" + f).value; }); p.enApp = $("p-enApp").checked;
    state.profile = A.cleanProfile(p);
    store.set("asesor.profile", state.profile);
    renderProfileExtras(); render();
    flash($("profileStatus"), "Guardado.");
  }
  function renderProfileExtras() {
    var has = A.hasProfile(state.profile);
    $("profileBanner").hidden = has;
    var txt = has ? A.personalText(state.profile) : "";
    $("personal").value = txt;
    $("personalCount").textContent = txt ? txt.length + " caracteres" : "Llena tu perfil para generar este texto.";
    $("whereToPaste").textContent = A.WHERE_TO_PASTE[provider()];
    $("exportCode").value = A.exportCode(state.profile, state.learned);
  }

  // ---------- Copiar ----------
  function copyText(text, ok, el) {
    var fallback = function () { el.focus(); el.select(); ok("Seleccionado. Cópialo con Ctrl+C o mantén presionado → Copiar."); };
    try { navigator.clipboard.writeText(text).then(function () { ok(null); }, fallback); } catch (e) { fallback(); }
  }

  // ---------- Voz ----------
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var hasTTS = "speechSynthesis" in window;
  var activeRec = null;

  function voiceMsg(m) { $("voiceStatus").textContent = m || ""; }
  function micError(code) {
    if (code === "not-allowed" || code === "service-not-allowed") {
      if (IN_EXTENSION) { $("micBanner").hidden = false; return "Falta el permiso del micrófono. Toca «Permitir micrófono» arriba."; }
      return "El micrófono está bloqueado aquí. Usa el micrófono de tu teclado (Gboard) o abre la app instalada.";
    }
    if (code === "no-speech") return "No te escuché. Toca otra vez y habla cerca del micrófono.";
    if (code === "network") return "El dictado necesita internet.";
    if (code === "audio-capture") return "No encuentro un micrófono conectado.";
    return code === "aborted" ? "" : "No se pudo usar el micrófono (" + code + ").";
  }

  // Escucha una frase. Devuelve el texto final.
  function listenOnce(onPartial) {
    return new Promise(function (resolve, reject) {
      if (!SR) { reject("unsupported"); return; }
      var rec = new SR(); activeRec = rec;
      rec.lang = "es-CO"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      var finalText = "";
      rec.onresult = function (e) {
        var interim = "";
        for (var i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
        }
        if (onPartial) onPartial(finalText + interim);
      };
      rec.onerror = function (e) { activeRec = null; reject(e.error || "error"); };
      rec.onend = function () { activeRec = null; resolve(finalText.trim()); };
      try { rec.start(); } catch (e) { reject("busy"); }
    });
  }
  function stopListening() { if (activeRec) { try { activeRec.abort(); } catch (e) {} activeRec = null; } }

  function speak(text) {
    return new Promise(function (resolve) {
      if (!hasTTS || !text) { resolve(); return; }
      try {
        speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = "es-CO"; u.rate = 1.05;
        var v = speechSynthesis.getVoices().filter(function (x) { return /^es/i.test(x.lang); });
        var pick = v.filter(function (x) { return /CO|419|US|MX/.test(x.lang); })[0] || v[0];
        if (pick) u.voice = pick;
        u.onend = resolve; u.onerror = function () { resolve(); };
        speechSynthesis.speak(u);
        setTimeout(resolve, Math.min(30000, 1500 + text.length * 90)); // por si el navegador nunca avisa el final
      } catch (e) { resolve(); }
    });
  }

  function micButton(onText, label) {
    if (!SR) return null;
    var b = document.createElement("button");
    b.type = "button"; b.className = "icon"; b.setAttribute("aria-label", label); b.title = label;
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
    b.addEventListener("click", function () {
      if (activeRec) { stopListening(); return; }
      b.classList.add("live"); voiceMsg("Escuchando…");
      listenOnce().then(function (t) { if (t) onText(t); voiceMsg(""); }, function (err) { voiceMsg(micError(err)); })
        .then(function () { b.classList.remove("live"); });
    });
    return b;
  }

  function summaryForVoice(r) {
    return "Tarea " + r.levelName.toLowerCase() + ". En " + r.providerLabel + " usa " + r.rec.model + ". " + r.rec.mode.split("·")[0] + ".";
  }

  // Dictado continuo en la caja principal.
  var dictating = false;
  function toggleDictation() {
    var b = $("dictate");
    if (dictating) { dictating = false; stopListening(); return; }
    dictating = true; b.classList.add("live"); b.lastChild.textContent = "Detener"; voiceMsg("Escuchando… habla con naturalidad; quito las muletillas.");
    var base = $("prompt").value === SAMPLE ? "" : $("prompt").value;
    (function loop() {
      listenOnce(function (partial) { $("prompt").value = (base ? base + " " : "") + partial; schedule(); }).then(function (t) {
        if (t) { base = (base ? base + " " : "") + t; $("prompt").value = base; store.set("asesor.draft", base); render(); }
        if (dictating) loop(); else end("");
      }, function (err) { end(micError(err)); });
    })();
    function end(msg) { dictating = false; b.classList.remove("live"); b.lastChild.textContent = "Dictar"; voiceMsg(msg); }
  }

  // Conversación: dices tu pedido, te responde por voz y te hace las preguntas una por una.
  var talking = false;
  function stopTalk(msg) { talking = false; stopListening(); if (hasTTS) speechSynthesis.cancel(); $("talk").classList.remove("live"); $("talk").lastChild.textContent = "Conversar por voz"; voiceMsg(msg || ""); }
  function startTalk() {
    if (talking) { stopTalk(""); return; }
    talking = true; $("talk").classList.add("live"); $("talk").lastChild.textContent = "Terminar";
    if (!SR) {
      render();
      speak(summaryForVoice(state.last)).then(function () { stopTalk("Tu navegador no tiene dictado. Te leí la recomendación; escribe con el micrófono del teclado."); });
      return;
    }
    var fail = function (err) { stopTalk(err === "cancel" ? "" : micError(err)); };
    var step = function (p) { return p.then(function (v) { if (!talking) throw "cancel"; return v; }); };
    voiceMsg("Te escucho: dime qué necesitas.");
    step(speak("Dime qué necesitas."))
      .then(function () { return step(listenOnce(function (t) { $("prompt").value = t; schedule(); })); })
      .then(function (t) {
        if (!t) throw "no-speech";
        $("prompt").value = t; store.set("asesor.draft", t); resetAnswers(); render();
        var r = state.last;
        var intro = summaryForVoice(r) + (r.questions.length ? " Te hago " + r.questions.length + (r.questions.length === 1 ? " pregunta." : " preguntas.") : "");
        var chain = step(speak(intro));
        r.questions.forEach(function (q) {
          chain = chain.then(function () { voiceMsg(q.q); return step(speak(q.q)); })
            .then(function () { return step(listenOnce()); })
            .then(function (ans) { if (ans) { state.answers[q.id] = ans; var inp = $("q-" + q.id); if (inp) inp.value = ans; render(); } });
        });
        return chain;
      })
      .then(function () { return step(speak("Listo. Tu prompt mejorado está abajo para copiar.")); })
      .then(function () { stopTalk("Listo. Revisa el prompt mejorado y cópialo."); }, fail);
  }

  // ---------- Eventos ----------
  $("copy").addEventListener("click", function () {
    var t = $("improved");
    if (!t.value) { flash($("status"), "Escribe primero tu pedido."); return; }
    copyText(t.value, function (m) { flash($("status"), m || "Copiado. Pégalo en " + state.last.providerLabel + " con " + state.last.rec.model + "."); commit(); }, t);
  });
  $("useIt").addEventListener("click", function () {
    if (!$("improved").value) return;
    commit();
    $("prompt").value = $("improved").value; resetAnswers(); store.set("asesor.draft", $("prompt").value); render();
    flash($("status"), "Listo. Llena los [corchetes] en tu texto.");
  });
  $("prompt").addEventListener("input", function () { store.set("asesor.draft", $("prompt").value); schedule(); });
  $("ctx").addEventListener("change", render);
  $("apps").addEventListener("change", function () { store.set("asesor.app", provider()); renderProfileExtras(); render(); });
  $("speak").addEventListener("click", function () { if (state.last) speak(summaryForVoice(state.last) + " " + (state.last.questions[0] ? "Pregunta: " + state.last.questions[0].q : "")); });
  if (!hasTTS) $("speak").hidden = true;
  $("dictate").addEventListener("click", toggleDictation);
  $("talk").addEventListener("click", startTalk);
  if (!SR) { $("dictate").hidden = true; voiceMsg("Este navegador no tiene dictado. Usa el micrófono de tu teclado; «Conversar por voz» te lee la recomendación."); }

  FIELDS.forEach(function (f) { $("p-" + f).addEventListener(f === "nivel" ? "change" : "input", function () { clearTimeout(readProfileForm._t); readProfileForm._t = setTimeout(readProfileForm, 400); }); });
  $("p-enApp").addEventListener("change", readProfileForm);
  $("openProfile").addEventListener("click", function () { $("profileBox").open = true; $("p-nombre").focus(); $("profileBox").scrollIntoView({ block: "start" }); });
  $("copyPersonal").addEventListener("click", function () { if ($("personal").value) copyText($("personal").value, function (m) { flash($("profileStatus"), m || "Copiado. Pégalo en tu app y marca «Ya pegué mi perfil»."); }, $("personal")); });
  $("copyCode").addEventListener("click", function () { copyText($("exportCode").value, function (m) { flash($("codeStatus"), m || "Código copiado."); }, $("exportCode")); });
  $("loadCode").addEventListener("click", function () {
    try {
      var d = A.importCode($("importCode").value);
      state.profile = d.profile; state.learned = d.learned;
      store.set("asesor.profile", d.profile); store.set("asesor.learned", d.learned);
      $("importCode").value = ""; fillProfileForm(); renderTraining(); render();
      flash($("codeStatus"), "Perfil cargado.");
    } catch (e) { flash($("codeStatus"), e.message); }
  });
  var wipeArmed = false;
  $("wipe").addEventListener("click", function () {
    var b = $("wipe");
    if (!wipeArmed) { wipeArmed = true; b.textContent = "Toca otra vez para borrar todo"; setTimeout(function () { wipeArmed = false; b.textContent = "Borrar perfil y aprendizaje"; }, 4000); return; }
    wipeArmed = false; b.textContent = "Borrar perfil y aprendizaje";
    state.profile = A.cleanProfile(null); state.learned = A.cleanLearned(null);
    store.set("asesor.profile", state.profile); store.set("asesor.learned", state.learned);
    fillProfileForm(); renderTraining(); render(); flash($("codeStatus"), "Borrado.");
  });

  // Permiso de micrófono para el panel lateral: Chrome solo lo pide desde una pestaña normal.
  $("grantMic").addEventListener("click", function () {
    if (location.hash === "#microfono") {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
        s.getTracks().forEach(function (t) { t.stop(); });
        $("micBanner").hidden = true; voiceMsg("Permiso dado. Ya puedes cerrar esta pestaña y dictar desde el panel.");
      }, function () { voiceMsg("Chrome no dio el permiso. Revisa el ícono del candado o de la cámara en la barra de direcciones."); });
    } else if (IN_EXTENSION && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL("index.html#microfono") });
    }
  });
  if (IN_EXTENSION && location.hash === "#microfono") { $("micBanner").hidden = false; }

  // Si la extensión cambia el aprendizaje desde la pestaña del chat, se refleja aquí.
  if (chromeStore && chrome.storage.onChanged) chrome.storage.onChanged.addListener(function (ch) {
    if (ch["asesor.learned"]) { state.learned = A.cleanLearned(ch["asesor.learned"].newValue); renderTraining(); render(); }
  });

  // ---------- Inicio ----------
  Promise.all([store.get("asesor.app", "claude"), store.get("asesor.draft", ""), store.get("asesor.profile", null), store.get("asesor.learned", null)])
    .then(function (v) {
      var radio = document.getElementById("app-" + v[0]); if (radio) radio.checked = true;
      $("prompt").value = v[1] || SAMPLE;
      state.profile = A.cleanProfile(v[2]); state.learned = A.cleanLearned(v[3]);
      fillProfileForm(); renderTraining(); render();
      if (!A.hasProfile(state.profile) && IN_EXTENSION) $("profileBox").open = true;
    });

  if ("serviceWorker" in navigator && /^https:|^http:\/\/localhost/.test(location.href) && !/claude\.ai|claudeusercontent/.test(location.hostname)) {
    try { navigator.serviceWorker.register("sw.js").catch(function () {}); } catch (e) {}
  }
})();
