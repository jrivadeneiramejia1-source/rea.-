/*
 * Asesor IA — lógica compartida (app web + extensión).
 * Todo corre local: no envía tu texto a ningún servidor ni gasta tokens.
 * Las cifras de tokens son ESTIMACIONES (±30%); ninguna app de chat publica
 * su conteo real ni el tamaño exacto de tus límites de uso.
 */
(function (global) {
  "use strict";

  const norm = (s) =>
    " " +
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ") +
    " ";

  const hits = (t, list) => list.filter((k) => t.includes(k));

  // ---------- Tokens ----------
  // Español ≈ 1 token cada 3,3 caracteres; código ≈ 1 cada 2,8.
  function estimateTokens(text) {
    const s = String(text || "");
    if (!s.trim()) return 0;
    const codeChars = (s.match(/[{}()\[\];=<>$|\\/`]/g) || []).length;
    const ratio = codeChars / s.length > 0.04 ? 2.8 : 3.3;
    return Math.max(1, Math.round(s.length / ratio));
  }

  // ---------- Dificultad ----------
  const KW = {
    simple: [
      " traduce", " traducir", " resume", " resumen", " ortografia", " que es ", " que significa",
      " define ", " sinonimo", " ideas para", " lista de ideas", " correo corto", " mensaje corto",
      " formatea", " pasa a tabla", " reescribe", " redaccion", " saludo", " chiste", " receta",
      " titulo para", " corrige este texto", " en una frase", " cuanto es ", " convierte ",
    ],
    medio: [
      " script", " codigo", " funcion", " powershell", " python", " javascript", " html", " css",
      " pagina", " web ", " formula", " excel", " n8n", " flujo", " workflow", " automatiza",
      " explica", " analiza", " compara", " depura", " error", " bug", " no funciona", " sql",
      " consulta", " configura", " instala", " router", " driver", " informe", " presentacion",
      " plan ", " prompt", " bot", " telegram", " whatsapp", " api ", " regex", " actualiza",
      " mantenimiento", " diagnostico", " formatear", " bios", " red ",
    ],
    dificil: [
      " aplicacion completa", " app completa", " aplicacion movil", " sistema completo", " arquitectura",
      " desde cero", " varios archivos", " multiples archivos", " todo el proyecto", " refactoriza",
      " migra", " backend", " frontend", " base de datos", " seguridad", " auditoria", " audita",
      " optimiza", " investiga a fondo", " investigacion", " demostracion", " demuestra", " estrategia",
      " multiagente", " agente", " integracion", " autenticacion", " produccion", " escalable",
      " rendimiento", " extension", " algoritmo", " machine learning", " modelo de datos",
    ],
    reintento: [
      " ya intente", " sigue sin funcionar", " sigue fallando", " otra vez", " no sirvio",
      " todavia no", " de nuevo el error", " ya probe",
    ],
  };

  const LEVELS = [
    null,
    { id: 1, name: "Simple", short: "Tarea rápida y sin razonamiento profundo." },
    { id: 2, name: "Normal", short: "Código o análisis de tamaño medio." },
    { id: 3, name: "Compleja", short: "Varios pasos o requisitos; conviene pensar más." },
    { id: 4, name: "Experta", short: "Diseño grande o problema que ya falló antes." },
  ];

  function classify(text) {
    const t = norm(text).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");
    const words = t.trim() ? t.trim().split(" ").length : 0;
    const why = [];
    let score = 0;

    const d = hits(t, KW.dificil);
    const m = hits(t, KW.medio);
    const s = hits(t, KW.simple);
    const r = hits(t, KW.reintento);

    if (d.length) { score += 3 + (d.length - 1) * 1.5; why.push("Señales de tarea grande: " + d.map((x) => x.trim()).slice(0, 4).join(", ")); }
    if (m.length) { score += Math.min(3, 1.5 + (m.length - 1) * 0.5); why.push("Señales técnicas: " + m.map((x) => x.trim()).slice(0, 4).join(", ")); }
    if (s.length && !d.length && !m.length) { score -= 1; why.push("Tarea de texto corta: " + s.map((x) => x.trim()).slice(0, 3).join(", ")); }
    if (r.length) { score += 1.5; why.push("Ya hubo intentos fallidos: sube un nivel."); }

    const reqs = String(text || "").split(/\n/).filter((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l)).length;
    if (reqs >= 5) { score += 1; why.push(reqs + " requisitos en lista."); }
    if (words > 400) { score += 2; why.push("Pedido muy largo (" + words + " palabras)."); }
    else if (words > 150) { score += 1; why.push("Pedido largo (" + words + " palabras)."); }
    if (/```|\bfunction\b|\bdef \b|\$\w+\s*=|<\/?\w+>/.test(String(text || ""))) { score += 0.5; why.push("Incluye código."); }

    let level = 1;
    if (score >= 7.5) level = 4;
    else if (score >= 4.5) level = 3;
    else if (score >= 1.5) level = 2;
    if (!why.length) why.push("Sin señales técnicas: se trata como tarea simple.");
    return { level, score: Math.round(score * 10) / 10, words, why, info: LEVELS[level] };
  }

  // ---------- Recomendación por app ----------
  // Nombres de octubre de 2026. Los menús cambian seguido: revisa el selector de tu app.
  const PROVIDERS = {
    claude: {
      label: "Claude",
      levels: [
        null,
        { model: "Haiku 5.5", mode: "Pensamiento extendido (Extended thinking) apagado", price: 0.5 },
        { model: "Sonnet 5.5", mode: "Pensamiento extendido apagado", price: 10 },
        { model: "Sonnet 5.5", mode: "Pensamiento extendido encendido · en Claude Code: esfuerzo (effort) alto", price: 10 },
        { model: "Opus 5.5", mode: "Pensamiento extendido encendido · solo si Sonnet ya no pudo", price: 20 },
      ],
      note: "Por precio de API, Opus 5.5 cuesta 2 veces Sonnet 5.5 y 40 veces Haiku 5.5 por token. Anthropic no publica cuánto descuenta cada modelo de tu plan; tómalo como guía.",
    },
    chatgpt: {
      label: "ChatGPT",
      levels: [
        null,
        { model: "GPT-6 Instant", mode: "Sin pensamiento" },
        { model: "GPT-6 Instant", mode: "Si la respuesta queda floja, pasa a Medio" },
        { model: "GPT-6 Thinking", mode: "Nivel Alto (High)" },
        { model: "GPT-6 Thinking", mode: "Extra alto (Extra High) · solo si Alto falló" },
      ],
      note: "Los niveles de pensamiento más altos tienen cupos menores en Free/Go/Plus.",
    },
    gemini: {
      label: "Gemini",
      levels: [
        null,
        { model: "Flash-Lite o Flash", mode: "Pensamiento Bajo (Low)" },
        { model: "Flash", mode: "Pensamiento Medio (Medium)" },
        { model: "Pro", mode: "Pensamiento Medio (Medium)" },
        { model: "Pro", mode: "Pensamiento Alto (High) · Deep Think solo para investigación o matemática" },
      ],
      note: "Pro y Deep Think tienen cupos diarios más bajos que Flash.",
    },
    deepseek: {
      label: "DeepSeek",
      levels: [
        null,
        { model: "Modo rápido (Instant)", mode: "Sin razonamiento" },
        { model: "Modo rápido (Instant)", mode: "Activa razonamiento solo si falla" },
        { model: "Modo experto (Expert / DeepThink)", mode: "Razonamiento activado" },
        { model: "Modo experto (Expert / DeepThink)", mode: "Divide la tarea en partes" },
      ],
      note: "DeepSeek no muestra límites fijos; el modo experto es más lento.",
    },
  };

  // Tokens típicos de respuesta y de pensamiento por nivel (aprox.).
  const OUT = [0, 400, 1500, 4000, 8000];
  const THINK = [0, 0, 0, 3000, 8000];

  function budget(text, contextTokens, level) {
    const input = estimateTokens(text);
    const ctx = Math.max(0, Math.round(contextTokens || 0));
    const out = OUT[level];
    const think = THINK[level];
    return { input, context: ctx, output: out, thinking: think, total: input + ctx + out + think };
  }

  // ---------- Calidad del prompt ----------
  const PARTS = [
    { id: "objetivo", label: "Objetivo claro", test: /\b(haz|hazme|crea|creame|escribe|genera|quiero|necesito|ayudame|dame|explica|explicame|arregla|corrige|actualiza|disena|construye|revisa|traduce|resume|redacta|busca|compara|analiza|convierte|mejora|optimiza|configura|instala|lista|que es|que significa|como)\b/ },
    { id: "contexto", label: "Contexto (sistema, versión, herramienta)", test: /\b(windows|linux|android|iphone|mac|powershell|python|n8n|excel|version|v\d|uso|tengo|mi (pc|computador|telefono|proyecto)|ruta|carpeta|c:\\)/ },
    { id: "formato", label: "Formato de respuesta", test: /\b(tabla|lista|pasos|json|markdown|codigo completo|solo el (codigo|fragmento|cambio)|breve|resumido|en \d+ (lineas|puntos|palabras)|archivo completo)\b/ },
    { id: "limites", label: "Restricciones (qué no hacer)", test: /\b(sin |no uses|no agregues|maximo|minimo|solo|unicamente|limite|evita)\b/ },
    { id: "ejemplo", label: "Ejemplo, datos o error exacto", test: /(por ejemplo|ejemplo|```|error:|exception|"[^"]{8,}"|:\s*\n)/ },
    { id: "exito", label: "Cómo saber que quedó bien", test: /\b(debe|que funcione|para que|criterio|resultado esperado|al final|listo cuando)\b/ },
  ];

  const FILLERS = [
    /[¿]?\bverdad\?/gi, /,?\s*\bo sea\b,?/gi, /,?\s*\byo que s[eé](?![a-z]),?/gi, /[¿]?\bno\?(?=\s|$)/gi,
    /\bbueno,\s*/gi, /\bpues,\s*/gi, /\bmira,\s*/gi, /\bpor favor,?\s*/gi,
    /\bme podrias ayudar a\s*/gi, /\bquisiera saber si\s*/gi,
  ];

  function cleanText(text) {
    let s = String(text || "");
    const before = s.length;
    for (const re of FILLERS) s = s.replace(re, " ");
    s = s.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:?!])/g, "$1").replace(/^\s*,\s*/gm, "").trim();
    return { text: s, removed: Math.max(0, before - s.length) };
  }

  // Qué partes vale la pena pedir según el nivel: a una pregunta simple no le
  // sumes relleno, eso también gasta tokens.
  const NEEDED = [[], ["objetivo", "formato"], ["objetivo", "contexto", "formato", "ejemplo"],
    ["objetivo", "contexto", "formato", "limites", "ejemplo", "exito"],
    ["objetivo", "contexto", "formato", "limites", "ejemplo", "exito"]];

  function audit(text, level) {
    const t = norm(text);
    const need = NEEDED[level || 4];
    return PARTS.map((p) => ({ id: p.id, label: p.label, ok: p.test.test(t), needed: need.includes(p.id) }));
  }

  const FORMAT_BY_LEVEL = [
    "",
    "Respuesta corta y directa, sin introducción.",
    "Solo el código o los pasos, con una explicación de 1 a 3 frases.",
    "Primero un plan corto en viñetas; luego la solución completa.",
    "Primero el plan y las decisiones clave; espera mi visto bueno antes de escribir todo el código.",
  ];

  function improve(text, level) {
    const c = cleanText(text);
    const a = audit(text, level);
    const has = (id) => { const x = a.find((y) => y.id === id); return x.ok || !x.needed; };
    const lines = ["Tarea: " + (c.text || "[describe lo que necesitas]")];
    if (!has("objetivo")) lines.push("Qué quiero: [arreglarlo, explicarlo, crearlo desde cero…]");
    if (!has("contexto")) lines.push("Contexto: [sistema, versión, herramienta, rutas reales]");
    if (!has("ejemplo")) lines.push("Datos o ejemplo: [pega el error exacto o un ejemplo de entrada/salida]");
    if (!has("limites")) lines.push("Restricciones: [qué NO debe hacer o cambiar]");
    if (!has("exito")) lines.push("Listo cuando: [cómo sabrás que funciona]");
    if (!audit(text, level).find((x) => x.id === "formato").ok) lines.push("Formato: " + FORMAT_BY_LEVEL[level]);
    if (level >= 3) lines.push("Si falta un dato clave, pregúntame una sola vez antes de empezar.");
    return { prompt: lines.join("\n"), removedChars: c.removed, audit: a };
  }

  // ---------- Consejos de ahorro ----------
  function tips(r) {
    const out = [];
    if (r.context >= 40000) out.push("Este chat ya es muy largo: cada mensaje reenvía todo el historial (~" + fmt(r.context) + " tokens). Pide un resumen y abre un chat nuevo con él.");
    else if (r.context >= 15000) out.push("El historial ya pesa ~" + fmt(r.context) + " tokens por mensaje. Si cambias de tema, abre un chat nuevo.");
    const top = r.provider === "claude" ? "Opus" : "el modelo más potente";
    if (r.level <= 2) out.push("No uses " + top + " ni modos de pensamiento alto para esto: gastarías varias veces más límite por la misma respuesta.");
    if (r.level === 4) out.push(r.provider === "claude"
      ? "Antes de usar Opus, prueba la tarea en Sonnet con pensamiento extendido. Usa Opus solo si falla."
      : "Antes del nivel más alto, prueba con el nivel anterior. Sube solo si la respuesta falla.");
    if (r.level >= 3) out.push("Divide en partes: pide primero el plan y luego cada archivo. Un error en una respuesta gigante cuesta repetirla completa.");
    if (r.missing >= 3) out.push("Faltan datos en tu pedido. Un pedido incompleto suele costar 2 o 3 mensajes extra de aclaración.");
    out.push("Pide solo el fragmento que cambia, no el archivo completo, cuando el cambio sea pequeño.");
    out.push("Junta tus preguntas en un solo mensaje; cada mensaje nuevo reenvía el historial.");
    out.push("Archivos o capturas grandes gastan mucho: pega solo la parte que importa.");
    return out.slice(0, 4);
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString("es-CO");
  }

  // ---------- Todo junto ----------
  function analyze(text, opts) {
    const o = opts || {};
    const provider = PROVIDERS[o.provider] ? o.provider : "claude";
    const c = classify(text);
    const b = budget(text, o.contextTokens, c.level);
    const imp = improve(text, c.level);
    const missing = imp.audit.filter((x) => x.needed && !x.ok).length;
    const p = PROVIDERS[provider];
    const rec = p.levels[c.level];
    const opus = PROVIDERS.claude.levels[4].price;
    return {
      provider,
      providerLabel: p.label,
      level: c.level,
      levelName: c.info.name,
      levelShort: c.info.short,
      score: c.score,
      why: c.why,
      words: c.words,
      rec,
      providerNote: p.note,
      tokens: b,
      vsOpus: provider === "claude" && c.level < 4 ? Math.round(opus / rec.price) : null,
      audit: imp.audit,
      missing,
      improved: imp.prompt,
      removedChars: imp.removedChars,
      tips: tips({ provider, level: c.level, context: b.context, missing }),
    };
  }

  // Tamaño aproximado del historial según cuántos mensajes lleva el chat.
  function contextFromMessages(n) {
    const k = Math.max(0, Number(n) || 0);
    return k * 900; // ~900 tokens por mensaje (pregunta + respuesta promedio)
  }

  const api = { analyze, estimateTokens, classify, improve, audit, cleanText, contextFromMessages, PROVIDERS, LEVELS, fmt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AsesorIA = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
