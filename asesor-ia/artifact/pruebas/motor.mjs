// Pruebas del motor del Asesor IA (sin navegador). Uso, desde asesor-ia/artifact: node pruebas/motor.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const html = readFileSync(new URL("../asesor-ia.html", import.meta.url), "utf8");
const src = /<script id="engine">([\s\S]*?)<\/script>/.exec(html)[1];
const g = {}; new Function("globalThis", src.replace('(typeof globalThis !== "undefined" ? globalThis : this)', "(globalThis)"))(g);
const E = g.AsesorEngine;
let ok = 0;
const t = (nombre, fn) => { try { fn(); ok++; console.log("  ✓", nombre); } catch (e) { console.log("  ✗", nombre, "→", e.message); process.exitCode = 1; } };
const mem = () => E.sanitizeMemory(null);
const run = (text, extra) => E.run(Object.assign({ text, memory: mem() }, extra || {}));

console.log("Pedidos de soporte técnico");
for (const [texto, tipo] of [["la impresora no imprime", "hardware"], ["Mi PC hace 3 pitidos al encender", "hardware"], ["el equipo se reinicia solo", "hardware"],
  ["configurar una IP estática", "hardware"], ["mi computador no prende", "hardware"], ["el wifi se desconecta", "hardware"], ["outlook no abre en el equipo de un cliente", "hardware"]]) {
  t(`«${texto}» → soporte técnico, nivel 2 o más y con preguntas`, () => {
    const r = run(texto);
    assert.equal(r.type.id, tipo); assert.ok(r.level >= 2, "nivel " + r.level); assert.ok(r.interview.questions.length >= 1);
    assert.ok(!r.interview.questions.some((q) => q.id === "err_msg"), "no pide «mensaje de error exacto» a una falla de equipo");
  });
}
t("«bot de discord» no es soporte técnico (disco ≠ discord)", () => assert.notEqual(run("hacer un bot de discord").type.id, "hardware"));
t("soporte técnico entrega tabla de pruebas, de lo más seguro a lo más complejo", () => assert.match(run("mi computador no prende").prompt, /Prueba \| Resultado esperado/));
t("script de PowerShell trae reglas de seguridad (-WhatIf, Test-Path)", () => assert.match(run("hazme un script de powershell que limpie temporales").prompt, /-WhatIf[\s\S]*Test-Path/));
t("«explícame qué es DNS» es aprender, sin preguntar síntomas", () => { const r = run("explícame qué es DNS"); assert.equal(r.type.id, "learn"); assert.ok(!r.interview.questions.some((q) => q.id.startsWith("hw_"))); });
t("verbos en infinitivo cuentan como acción («cómo crear…»)", () => assert.ok(E.detect("como crear un usuario local en windows").has.action));

console.log("Puntaje honesto");
for (const texto of ["asdf qwer zxcv", "hola que tal"]) t(`«${texto}» no llega a 100`, () => { const r = run(texto); assert.ok(r.improved.score < 80, "puntaje " + r.improved.score); });
t("el idioma («Responde en español») no cuenta como tono", () => assert.ok(run("hola que tal").improved.missing.some((c) => c.id === "tone")));
t("un pedido completo puntúa bien y no pregunta cosas de redacción", () => {
  const r = run("Hazme un script en PowerShell 7 para Windows 11 que liste los programas instalados y los guarde en C:\\Reportes\\programas.csv, como administrador, para un informe a mi jefe");
  assert.ok(r.improved.score >= 60, "puntaje " + r.improved.score);
  assert.ok(!r.interview.questions.some((q) => q.id.startsWith("txt_")), "un script no pregunta tono ni para quién es el texto");
});

console.log("Plantillas sin llenar");
t("detecta las partes [entre corchetes] y no las da por completas", () => {
  const tp = E.TEMPLATES.find((x) => x.id === "t_err");
  const r = run(tp.text);
  assert.ok(r.placeholders.length >= 3); assert.ok(r.improved.missing.some((c) => c.id === "specific")); assert.match(r.tips[0], /corchetes/);
  assert.ok(!r.interview.questions.some((q) => q.id.startsWith("n8n")), "«[programa o flujo]» no lo vuelve n8n");
});
t("«Diagnóstico de un equipo» es soporte técnico", () => assert.equal(run(E.TEMPLATES.find((x) => x.id === "t_hw").text).type.id, "hardware"));

console.log("Errores y registros pegados");
const ERR_PS = "Al ejecutar mi script falla:\nRemove-Item : No se encuentra la ruta de acceso 'C:\\Temp\\x' porque no existe.\nAt C:\\Scripts\\limpiar.ps1:3 char:1\n+ Remove-Item C:\\Temp\\x -Recurse\n+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n    + CategoryInfo          : ObjectNotFound: (C:\\Temp\\x:String) [Remove-Item], ItemNotFoundException\n    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.RemoveItemCommand\n¿funciona o no?";
t("el error de PowerShell va completo como dato, sin «limpiar»", () => {
  const d = E.detect(ERR_PS);
  assert.equal(d.input.length, 1); assert.match(d.input[0], /At C:\\Scripts\\limpiar\.ps1:3 char:1[\s\S]*FullyQualifiedErrorId/);
  assert.match(d.input[0], /Remove-Item : No se encuentra/, "conserva el espacio antes de los dos puntos");
});
t("con el error pegado no pregunta «¿Cuál es el mensaje de error exacto?»", () => assert.ok(!run(ERR_PS).interview.questions.some((q) => q.id === "err_msg")));
t("«¿funciona o no?» no se recorta", () => assert.match(E.detect(ERR_PS).clean, /funciona o no\?/));
t("registro con horas va como dato", () => assert.equal(E.detect("revisa este log\n2026-10-21 10:15:02 ERROR conexión rechazada\n2026-10-21 10:15:07 WARN reintento").input.length, 1));
t("flujo de n8n pegado (JSON) va como dato", () => {
  const d = E.detect('Revisa mi flujo de n8n: {"nodes":[{"name":"Gmail"}],"connections":{}} y dime por qué no envía');
  assert.equal(d.input.length, 1); assert.match(d.input[0], /"connections"/); assert.doesNotMatch(d.clean, /nodes/);
});

console.log("Entrevista");
t("n8n local con versión: no vuelve a preguntar dónde está", () => assert.ok(!run("crear un flujo de n8n local version 1.80 que lea gmail y mande a telegram").interview.questions.some((q) => q.id === "n8n_host")));
t("si el perfil dice PowerShell, no pregunta la versión", () => {
  const m = mem(); m.profile.sistema = "Windows 11, PowerShell 7";
  const r = E.run({ text: "hazme un script de powershell que limpie temporales", memory: m });
  assert.ok(!r.interview.questions.some((q) => q.id === "ps_ver"));
});
t("el perfil no se repite como «Audiencia: Yo…»", () => {
  const m = mem(); m.profile.rol = "aprendiz de soporte"; m.profile.sistema = "Windows 11";
  const r = E.run({ text: "hazme un script de powershell que liste los programas instalados", memory: m });
  assert.match(r.prompt, /Sobre mí/); assert.doesNotMatch(r.prompt, /Audiencia: Yo/);
});
t("la respuesta de audiencia conserva su etiqueta", () => {
  const r0 = run("explícame qué es DNS para mi trabajo");
  const q = r0.interview.questions.find((x) => x.slot === "audience");
  assert.ok(q, "pregunta de audiencia");
  const r = run("explícame qué es DNS para mi trabajo", { answers: { [q.id]: "poco" } });
  assert.match(r.prompt, new RegExp(q.k + ": poco"));
});

console.log("Datos sensibles");
const CFG = "Mi flujo falla. Config: password=Sup3rSecreta token: abcd1234efgh Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.abcdefgh llave sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV servidor 192.168.1.20 correo ana@empresa.co";
t("oculta contraseñas, tokens y llaves por defecto", () => {
  const r = run(CFG); assert.doesNotMatch(r.prompt, /Sup3rSecreta|abcd1234efgh|eyJhbGci|sk-ant-api03/); assert.ok(r.maskedCount >= 4);
  assert.match(r.prompt, /192\.168\.1\.20/, "la IP queda (sirve para soporte)");
});
t("con la opción, también oculta correos e IP", () => {
  const m = mem(); m.prefs.maskPersonal = true; const r = E.run({ text: CFG, memory: m });
  assert.doesNotMatch(r.prompt, /192\.168\.1\.20|ana@empresa\.co/);
});
t("se puede apagar", () => { const m = mem(); m.prefs.mask = false; assert.match(E.run({ text: CFG, memory: m }).prompt, /Sup3rSecreta/); });
t("no oculta variables ni partes sin llenar (password=$clave, token: [tu token])", () => assert.equal(E.maskSecrets("password=$clave token: [tu token]").count, 0));

console.log("Memoria, estadísticas e importar");
t("copiar, exportar y favorito del mismo prompt cuentan una sola vez", () => {
  const r = run("hazme un script de powershell que limpie temporales"); let m = mem();
  m = E.recordUse(m, r, r.prompt, {}); m = E.recordUse(m, r, r.prompt, {}); m = E.addFavorite(E.recordUse(m, r, r.prompt, {}), r, r.prompt, {}, "", "");
  assert.equal(m.stats.n, 1); assert.equal(m.history.length, 1);
});
t("un favorito no es ejemplo de sí mismo", () => {
  const texto = "hazme un script de powershell que limpie temporales"; const r = run(texto);
  const m = E.addFavorite(mem(), r, r.prompt, {}, "Aquí está el script…", "");
  assert.equal(E.run({ text: texto, memory: m }).examples.length, 0);
});
t("consejos según la app: en ChatGPT no habla de Opus", () => {
  let m = mem(); m.prefs.provider = "chatgpt";
  for (const x of ["uno", "dos", "tres"]) { const r = E.run({ text: "traduce al inglés la palabra " + x, memory: m }); m = E.recordUse(m, r, r.prompt, {}); }
  assert.ok(E.insights(m).length); assert.ok(!E.insights(m).some((s) => /Opus|Sonnet/.test(s)));
});
t("importar {\"profile\":\"hola\"} no borra el perfil y avisa", () => {
  const m = mem(); m.profile.nombre = "Jeiler";
  assert.throws(() => E.importData(m, '{"profile":"hola"}'), /no trae datos/);
});
t("importar un prompt exportado explica que no es un respaldo", () => assert.throws(() => E.importData(mem(), JSON.stringify({ app: "Asesor IA", version: 3, prompt: "x", idea: "y" })), /prompt exportado/));
t("importar un respaldo dice qué cargó", () => {
  const m = mem(); m.profile.nombre = "Jeiler"; m.templates = [{ id: "a", name: "Mía", text: "x", ts: 1 }];
  const rep = []; const out = E.importData(mem(), JSON.stringify(m), rep);
  assert.equal(out.profile.nombre, "Jeiler"); assert.ok(rep.includes("perfil") && rep.includes("plantillas"));
});

console.log(`\n${ok} comprobaciones OK`);
