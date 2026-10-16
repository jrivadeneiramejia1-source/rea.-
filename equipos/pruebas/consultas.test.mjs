// La app debe seguir funcionando aunque Firestore aún no tenga los índices compuestos.
// Uso: node pruebas/consultas.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = { window: {}, console, setTimeout, clearTimeout, URLSearchParams, navigator: {}, location: {} };
ctx.window.GestorEngine = {};
vm.runInNewContext(readFileSync(new URL("../public/equipos.js", import.meta.url), "utf8"), ctx);
const E = ctx.window.Equipos;

const doc = (id, at) => ({ id, at });
const snap = (docs, added = docs) => ({ docs, docChanges: () => added.map((d) => ({ type: "added", doc: d })) });
// Consulta falsa: la ordenada falla como en un proyecto sin índice; la simple entrega los datos.
function fakeBase(docs, { indexed = false } = {}) {
  const calls = [];
  const base = {
    orderBy(field, dir) { calls.push("orderBy " + field + " " + dir); return { limit(n) { calls.push("limit " + n); return { onSnapshot(ok, bad) { calls.push("ordenada"); indexed ? ok(snap(docs)) : bad({ code: "failed-precondition", message: "The query requires an index" }); return () => calls.push("cerrada ordenada"); } }; } }; },
    onSnapshot(ok) { calls.push("simple"); ok(snap(docs)); return () => calls.push("cerrada simple"); },
  };
  return { base, calls };
}

let got = null, errors = [];
const docs = [doc("a", 10), doc("b", 30), doc("c", 20), doc("d", 40)];
const f = fakeBase(docs);
const off = E.watchOrdered(f.base, "createdAt", 3, (d) => d, (all, added) => { got = { all, added }; }, (e) => errors.push(e));
assert.deepEqual(f.calls.slice(0, 4), ["orderBy createdAt desc", "limit 3", "ordenada", "simple"]);
assert.deepEqual(got.all.map((x) => x.id), ["d", "b", "c"], "ordena del más nuevo al más viejo y respeta el límite");
assert.deepEqual(got.added.map((x) => x.id).sort(), ["b", "c", "d"]);
assert.equal(errors.length, 0, "sin índice no se muestra ningún error");
off();
assert.deepEqual(f.calls.slice(4), ["cerrada ordenada", "cerrada simple"], "la consulta que falló se cierra y al salir se cierra la simple");
console.log("  ✓ sin índice: usa la consulta simple, ordena aquí y no muestra error");

const g = fakeBase(docs, { indexed: true });
E.watchOrdered(g.base, "createdAt", 3, (d) => d, (all) => { got = { all }; }, (e) => errors.push(e));
assert.ok(!g.calls.includes("simple"), "con índice usa la consulta ordenada");
console.log("  ✓ con índice: usa la consulta ordenada de Firestore");

const h = { orderBy: () => ({ limit: () => ({ onSnapshot: (ok, bad) => { bad({ code: "permission-denied" }); return () => {}; } }) }) };
E.watchOrdered(h, "createdAt", 3, (d) => d, () => {}, (e) => errors.push(e.code));
assert.deepEqual(errors, ["permission-denied"], "otros errores sí se informan");
console.log("  ✓ otros errores (permisos) sí se informan");
console.log("\n3 comprobaciones OK");
