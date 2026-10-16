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

  // ---------- Perfil de la persona ----------
  const EMPTY_PROFILE = {
    nombre: "", rol: "", nivel: "intermedio", sistema: "", herramientas: "",
    rutas: "", metas: "", estilo: "", noQuiero: "", enApp: false,
  };

  function cleanProfile(p) {
    const out = Object.assign({}, EMPTY_PROFILE);
    if (p && typeof p === "object") {
      for (const k of Object.keys(EMPTY_PROFILE)) {
        if (k === "enApp") out.enApp = p.enApp === true;
        else if (typeof p[k] === "string") out[k] = p[k].slice(0, 600).trim();
      }
    }
    if (!["basico", "intermedio", "avanzado"].includes(out.nivel)) out.nivel = "intermedio";
    return out;
  }

  const hasProfile = (p) => !!(p && (p.rol || p.sistema || p.herramientas || p.estilo || p.metas));
  const NIVEL_TXT = { basico: "básico", intermedio: "intermedio", avanzado: "avanzado" };

  // Texto para pegar UNA vez en la personalización de la app (así no se repite en cada mensaje).
  function personalText(profile) {
    const p = cleanProfile(profile);
    const l = [];
    if (p.nombre || p.rol) l.push("Soy " + [p.nombre, p.rol].filter(Boolean).join(", ") + ".");
    l.push("Nivel técnico: " + NIVEL_TXT[p.nivel] + ".");
    if (p.sistema) l.push("Mi equipo: " + p.sistema + ".");
    if (p.herramientas) l.push("Herramientas que uso: " + p.herramientas + ".");
    if (p.rutas) l.push("Rutas habituales: " + p.rutas + ".");
    if (p.metas) l.push("Mis metas: " + p.metas + ".");
    if (p.estilo) l.push("Cómo quiero las respuestas: " + p.estilo + ".");
    if (p.noQuiero) l.push("No hagas: " + p.noQuiero + ".");
    return l.join("\n").replace(/\.\./g, ".");
  }

  const WHERE_TO_PASTE = {
    claude: "Claude: Configuración → Perfil → preferencias o «Instrucciones para Claude» (Settings → Profile). En Proyectos (Projects) también puedes ponerlas por proyecto.",
    chatgpt: "ChatGPT: tu perfil → Configuración → Personalización → Instrucciones personalizadas (Custom instructions). Límite: 1.500 caracteres en Free/Go.",
    gemini: "Gemini: Configuración y ayuda → Inteligencia personal → Información guardada (Saved info), o crea una Gem con este texto.",
    deepseek: "DeepSeek: no encontré una opción de instrucciones fijas. Pega el texto al inicio de cada chat nuevo.",
  };

  // ---------- Preguntas según lo que escribes ----------
  // fact: dato que se recuerda para no volver a preguntarlo. covers: parte del prompt que completa.
  const TOPICS = [
    { id: "error", name: "Errores", match: [" error", " falla", " no funciona", " bug", " no sirve", " no abre", " no prende", " no enciende", " se cierra"], qs: [
      { id: "err_msg", k: "Error exacto", q: "¿Cuál es el mensaje de error exacto? (cópialo tal cual)", covers: "ejemplo", skip: /error:|exception|"[^"]{8,}"/ },
      { id: "err_tried", k: "Ya intenté", q: "¿Qué ya intentaste?", covers: "limites", skip: /ya intente|ya probe/ },
      { id: "err_when", k: "Desde cuándo pasa", q: "¿Desde cuándo pasa o qué cambiaste antes de que fallara?", covers: "contexto" },
    ] },
    { id: "powershell", name: "PowerShell / scripts", match: [" powershell", " script", " ps1", " cmd ", " bat "], qs: [
      { id: "ps_ver", k: "Versión de PowerShell y Windows", q: "¿Qué versión de PowerShell y de Windows usas?", fact: "PowerShell y Windows", covers: "contexto", skip: /powershell \d|ps ?\d|pwsh|windows 1\d/ },
      { id: "ps_admin", k: "Permisos", q: "¿Se ejecuta como administrador o como usuario normal?", covers: "limites", skip: /administrador|admin/ },
      { id: "ps_out", k: "Resultado esperado", q: "¿Qué debe producir: un archivo (ruta exacta), texto en pantalla o ambos?", covers: "exito", skip: /\.csv|\.txt|\.json|\.log|c:\\/ },
    ] },
    { id: "n8n", name: "n8n / automatización", match: [" n8n", " flujo", " workflow", " nodo", " automatiza"], qs: [
      { id: "n8n_host", k: "Mi n8n", q: "¿Tu n8n está en la nube o instalado local? ¿Qué versión?", fact: "Mi n8n", covers: "contexto" },
      { id: "n8n_trig", k: "Disparador del flujo", q: "¿Qué inicia el flujo (Telegram, webhook, horario, Gmail…)?", covers: "contexto", skip: /telegram|webhook|cron|horario|gmail|whatsapp/ },
      { id: "n8n_node", k: "Nodos", q: "¿Qué nodo falla o cuáles nodos usas?", covers: "ejemplo", skip: /nodo [a-z]/ },
    ] },
    { id: "web", name: "Páginas web", match: [" pagina", " web ", " landing", " sitio", " html"], qs: [
      { id: "web_goal", k: "Para qué es", q: "¿Para qué es la página y quién la va a ver?", covers: "objetivo" },
      { id: "web_style", k: "Estilo", q: "¿Tienes colores, logo o una página de ejemplo que te guste?", covers: "ejemplo" },
      { id: "web_host", k: "Dónde se publica", q: "¿Dónde la vas a publicar (GitHub Pages, hosting, solo local)?", fact: "Dónde publico mis páginas", covers: "contexto" },
    ] },
    { id: "app", name: "Aplicaciones", match: [" aplicacion", " app ", " movil", " extension"], qs: [
      { id: "app_plat", k: "Plataforma", q: "¿Para Android, iPhone, web o PC?", covers: "contexto", skip: /android|iphone|ios|windows|navegador|chrome/ },
      { id: "app_feat", k: "Funciones principales", q: "¿Cuáles son las 3 funciones más importantes?", covers: "exito" },
      { id: "app_code", k: "Mi nivel de programación", q: "¿Qué tanto sabes programar? (así ajusta las explicaciones)", fact: "Mi nivel de programación", covers: "contexto" },
    ] },
    { id: "hardware", name: "Soporte técnico / equipos", match: [" computador", " pc ", " portatil", " laptop", " impresora", " disco", " ram ", " bios", " pantalla azul", " mantenimiento", " router", " wifi", " celular", " telefono"], qs: [
      { id: "hw_model", k: "Equipo", q: "¿Marca, modelo y sistema operativo del equipo?", covers: "contexto" },
      { id: "hw_sym", k: "Síntoma", q: "¿Qué síntoma exacto ves (luces, pitidos, mensaje en pantalla)?", covers: "ejemplo" },
      { id: "hw_tools", k: "Herramientas disponibles", q: "¿Con qué herramientas cuentas (destornilladores, multímetro, USB booteable…)?", fact: "Mis herramientas de taller", covers: "limites" },
    ] },
    { id: "texto", name: "Textos y mensajes", match: [" correo", " carta", " publicacion", " post ", " informe", " guion", " redacta", " escribe un mensaje", " escribe un texto", " mensaje para", " texto para"], qs: [
      { id: "txt_aud", k: "Público y tono", q: "¿Para quién es y en qué tono (formal, cercano, vendedor)?", covers: "contexto", skip: /formal|informal|cercano|profesional/ },
      { id: "txt_len", k: "Largo", q: "¿Qué tan largo debe ser?", covers: "formato", skip: /\d+ (palabras|lineas|parrafos)|corto|breve/ },
    ] },
    { id: "excel", name: "Excel / hojas de cálculo", match: [" excel", " formula", " hoja de calculo", " sheets", " tabla dinamica"], qs: [
      { id: "xl_app", k: "Hoja de cálculo", q: "¿Excel o Google Sheets, y fórmulas en español o en inglés?", fact: "Mis hojas de cálculo", covers: "contexto" },
      { id: "xl_data", k: "Columnas y ejemplo", q: "¿Qué columnas tienes? Da un ejemplo de una fila.", covers: "ejemplo" },
    ] },
    { id: "ia", name: "Prompts y agentes de IA", match: [" prompt", " agente", " bot ", " chatbot", " gemini", " chatgpt", " claude"], qs: [
      { id: "ia_where", k: "Dónde se usa", q: "¿Dónde se va a usar ese prompt (n8n, una app, un chat)?", covers: "contexto" },
      { id: "ia_out", k: "Salida esperada", q: "¿Qué debe devolver la IA (texto, JSON, lista)?", covers: "formato", skip: /json|lista|tabla/ },
    ] },
  ];
  const GENERIC_QS = [
    { id: "gen_goal", k: "Para qué lo necesito", q: "¿Para qué lo necesitas al final? (así la IA no adivina)", covers: "exito" },
    { id: "gen_format", k: "Formato", q: "¿Cómo quieres la respuesta (pasos, código, tabla, corta)?", covers: "formato" },
  ];

  function topicsOf(text) {
    const t = norm(text).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");
    return TOPICS.filter((tp) => tp.match.some((k) => t.includes(k)));
  }

  // Devuelve hasta `max` preguntas nuevas y los datos que ya se saben de la persona.
  function questions(text, level, profile, learned, max) {
    const raw = norm(text);
    const facts = (learned && learned.facts) || {};
    const tps = topicsOf(text);
    const out = [];
    const remembered = [];
    if (!String(text || "").trim() || (level < 2 && !tps.length)) return { list: out, remembered };
    // Intercala los temas (1.ª pregunta de cada tema, luego la 2.ª…) para no llenar todo con uno solo.
    const pool = [];
    if (tps.length) { for (let i = 0; i < 3; i++) for (const tp of tps) if (tp.qs[i]) pool.push(tp.qs[i]); } else pool.push(...GENERIC_QS);
    for (const q of pool) {
      if (q.skip && q.skip.test(raw)) continue;
      if (q.fact && facts[q.fact]) { remembered.push({ label: q.fact, value: facts[q.fact], covers: q.covers }); continue; }
      if (q.id === "ps_ver" && profile && /powershell|windows/i.test(profile.sistema)) { remembered.push({ label: "Mi equipo", value: profile.sistema, covers: "contexto" }); continue; }
      if (q.id === "app_code" && hasProfile(profile)) continue;
      if (!out.some((x) => x.id === q.id)) out.push(q);
    }
    return { list: out.slice(0, max || (level < 2 ? 1 : 3)), remembered };
  }

  // ---------- Prompt mejorado ----------
  function improve(text, level, ctx) {
    const o = ctx || {};
    const profile = cleanProfile(o.profile);
    const c = cleanText(text);
    const a = audit(text, level);
    const covered = {};
    const detail = [];
    for (const item of o.answered || []) { detail.push("- " + item.k + ": " + item.a); covered[item.covers] = true; }
    const useProfile = hasProfile(profile) && !profile.enApp && level >= 2;
    for (const r of o.remembered || []) { if (useProfile && r.value === profile.sistema) { covered[r.covers] = true; continue; } detail.push("- " + r.label + ": " + r.value); covered[r.covers] = true; }
    const has = (id) => { const x = a.find((y) => y.id === id); return x.ok || !x.needed || covered[id]; };

    const lines = ["Tarea: " + (c.text || "[describe lo que necesitas]")];
    if (useProfile) {
      const me = [profile.rol, "nivel " + NIVEL_TXT[profile.nivel], profile.sistema].filter(Boolean).join("; ");
      lines.push("Sobre mí: " + me);
      covered.contexto = covered.contexto || !!profile.sistema;
    }
    if (detail.length) lines.push("Detalles:\n" + detail.join("\n"));
    if (!has("objetivo")) lines.push("Qué quiero: [arreglarlo, explicarlo, crearlo desde cero…]");
    if (!has("contexto") && !covered.contexto) lines.push("Contexto: [sistema, versión, herramienta, rutas reales]");
    if (!has("ejemplo")) lines.push("Datos o ejemplo: [pega el error exacto o un ejemplo de entrada/salida]");
    if (!has("limites")) lines.push("Restricciones: " + (useProfile && profile.noQuiero ? profile.noQuiero : "[qué NO debe hacer o cambiar]"));
    if (!has("exito")) lines.push("Listo cuando: [cómo sabrás que funciona]");
    if (!a.find((x) => x.id === "formato").ok && !covered.formato) {
      lines.push("Formato: " + (useProfile && profile.estilo ? profile.estilo : FORMAT_BY_LEVEL[level]));
    }
    if (level >= 3) lines.push("Si falta un dato clave, pregúntame una sola vez antes de empezar.");
    return { prompt: lines.join("\n"), removedChars: c.removed, audit: a, usedProfile: useProfile };
  }

  // ---------- Aprendizaje ----------
  const EMPTY_LEARNED = () => ({ n: 0, levels: [0, 0, 0, 0, 0], missing: {}, topics: {}, facts: {}, words: 0, recent: [] });

  function cleanLearned(l) {
    const out = EMPTY_LEARNED();
    if (!l || typeof l !== "object") return out;
    out.n = Math.max(0, Number(l.n) || 0);
    if (Array.isArray(l.levels) && l.levels.length === 5) out.levels = l.levels.map((x) => Math.max(0, Number(x) || 0));
    for (const k of ["missing", "topics"]) if (l[k] && typeof l[k] === "object") for (const [a, b] of Object.entries(l[k])) out[k][a] = Math.max(0, Number(b) || 0);
    if (l.facts && typeof l.facts === "object") for (const [a, b] of Object.entries(l.facts)) if (typeof b === "string" && b.trim()) out.facts[a.slice(0, 80)] = b.slice(0, 300);
    out.words = Math.max(0, Number(l.words) || 0);
    if (Array.isArray(l.recent)) out.recent = l.recent.filter((x) => x >= 1 && x <= 4).slice(-30);
    return out;
  }

  // Se llama cuando la persona usa (copia o pega) un prompt.
  function learn(learned, r, answered) {
    const l = cleanLearned(learned);
    l.n += 1;
    l.levels[r.level] += 1;
    l.words += r.words;
    l.recent = l.recent.concat(r.level).slice(-30);
    for (const p of r.audit) if (p.needed && !p.ok) l.missing[p.id] = (l.missing[p.id] || 0) + 1;
    for (const tp of r.topics) l.topics[tp] = (l.topics[tp] || 0) + 1;
    for (const item of answered || []) if (item.fact && item.a.trim()) l.facts[item.fact] = item.a.trim().slice(0, 300);
    return l;
  }

  const PART_LABEL = { objetivo: "el objetivo", contexto: "el contexto (sistema, versión)", formato: "el formato de respuesta", limites: "las restricciones", ejemplo: "el error exacto o un ejemplo", exito: "cómo saber que quedó bien" };

  function insights(learned, profile) {
    const l = cleanLearned(learned);
    const out = [];
    if (!l.n) return out;
    const easy = l.levels[1] + l.levels[2];
    const pct = Math.round(((l.n - l.levels[4]) / l.n) * 100);
    if (l.n >= 3) out.push(pct + "% de tus " + l.n + " pedidos no necesitaba Opus. " + (easy / l.n >= 0.6 ? "Tu modelo base debería ser Sonnet (o Haiku para lo simple)." : "Usa Sonnet con pensamiento extendido como base y Opus solo cuando falle."));
    const miss = Object.entries(l.missing).sort((a, b) => b[1] - a[1])[0];
    if (miss && l.n >= 3 && miss[1] / l.n >= 0.5) out.push("Casi siempre te falta " + PART_LABEL[miss[0]] + " (" + miss[1] + " de " + l.n + "). " + (miss[0] === "formato" && !(profile && profile.estilo) ? "Llena «Cómo quieres las respuestas» en tu perfil y lo agrego solo." : "Agrégalo desde el principio y te ahorras mensajes."));
    const top = Object.entries(l.topics).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) { const tp = TOPICS.find((t) => t.id === top[0]); if (tp) out.push("Tu tema más frecuente: " + tp.name + " (" + top[1] + " pedidos)."); }
    const avg = Math.round(l.words / l.n);
    if (l.n >= 3 && avg < 12) out.push("Tus pedidos son muy cortos (" + avg + " palabras en promedio). Con 2 o 3 datos más la IA acierta a la primera.");
    if (l.n >= 3 && avg > 250) out.push("Tus pedidos son largos (" + avg + " palabras en promedio). Quita lo que no cambia la respuesta.");
    return out;
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
    if (r.usedProfile) out.push("Tu perfil suma ~" + fmt(r.profileTokens) + " tokens a cada pedido. Pégalo una vez en la personalización de la app y marca «Ya lo puse en la app».");
    if (r.level >= 3) out.push("Divide en partes: pide primero el plan y luego cada archivo. Un error en una respuesta gigante cuesta repetirla completa.");
    if (r.missing >= 3) out.push("Faltan datos en tu pedido. Un pedido incompleto suele costar 2 o 3 mensajes extra de aclaración.");
    out.push("Pide solo el fragmento que cambia, no el archivo completo, cuando el cambio sea pequeño.");
    out.push("Junta tus preguntas en un solo mensaje; cada mensaje nuevo reenvía el historial.");
    return out.slice(0, 4);
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString("es-CO");
  }

  // ---------- Todo junto ----------
  // opts: { provider, contextTokens, profile, learned, answers: {idPregunta: respuesta} }
  function analyze(text, opts) {
    const o = opts || {};
    const provider = PROVIDERS[o.provider] ? o.provider : "claude";
    const profile = cleanProfile(o.profile);
    const learned = cleanLearned(o.learned);
    const c = classify(text);
    const b = budget(text, o.contextTokens, c.level);
    const qs = questions(text, c.level, profile, learned);
    const answers = o.answers || {};
    const answered = qs.list.filter((q) => (answers[q.id] || "").trim()).map((q) => Object.assign({}, q, { a: answers[q.id].trim() }));
    const imp = improve(text, c.level, { profile, answered, remembered: qs.remembered });
    const missing = imp.audit.filter((x) => x.needed && !x.ok).length;
    const p = PROVIDERS[provider];
    const rec = p.levels[c.level];
    const opus = PROVIDERS.claude.levels[4].price;
    const profileTokens = imp.usedProfile ? estimateTokens(imp.prompt.split("\n").filter((l) => /^(Sobre mí|Formato|Restricciones):/.test(l)).join("\n")) : 0;
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
      improvedTokens: String(text || "").trim() ? estimateTokens(imp.prompt) : 0,
      vsOpus: provider === "claude" && c.level < 4 ? Math.round(opus / rec.price) : null,
      audit: imp.audit,
      missing,
      questions: qs.list,
      remembered: qs.remembered,
      answered,
      topics: topicsOf(text).map((t) => t.id),
      improved: imp.prompt,
      usedProfile: imp.usedProfile,
      removedChars: imp.removedChars,
      tips: tips({ provider, level: c.level, context: b.context, missing, usedProfile: imp.usedProfile, profileTokens }),
    };
  }

  // Tamaño aproximado del historial según cuántos mensajes lleva el chat.
  function contextFromMessages(n) {
    const k = Math.max(0, Number(n) || 0);
    return k * 900; // ~900 tokens por mensaje (pregunta + respuesta promedio)
  }

  // Código para pasar perfil y aprendizaje entre teléfono y PC (copiar/pegar).
  function exportCode(profile, learned) {
    const json = JSON.stringify({ v: 1, profile: cleanProfile(profile), learned: cleanLearned(learned) });
    return "ASESOR1:" + btoa(unescape(encodeURIComponent(json)));
  }
  function importCode(code) {
    const m = /ASESOR1:([A-Za-z0-9+/=]+)/.exec(String(code || "").replace(/\s+/g, ""));
    if (!m) throw new Error("El código no es válido. Debe empezar por ASESOR1:");
    let data;
    try { data = JSON.parse(decodeURIComponent(escape(atob(m[1])))); } catch (e) { throw new Error("El código está incompleto. Cópialo otra vez completo."); }
    return { profile: cleanProfile(data.profile), learned: cleanLearned(data.learned) };
  }

  const api = {
    analyze, estimateTokens, classify, improve, audit, cleanText, contextFromMessages, questions,
    learn, insights, personalText, cleanProfile, cleanLearned, hasProfile, exportCode, importCode,
    PROVIDERS, LEVELS, TOPICS, WHERE_TO_PASTE, EMPTY_PROFILE, fmt,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AsesorIA = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
