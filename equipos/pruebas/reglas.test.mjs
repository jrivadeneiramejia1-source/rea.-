// Pruebas de las reglas de Firestore contra el emulador.
// Uso: npx firebase emulators:exec --only firestore --project demo-equipos "node pruebas/reglas.test.mjs"
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp, Timestamp } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-equipos",
  firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});
let passed = 0;
const ok = async (label, p) => { await assertSucceeds(p); passed++; console.log("  ✓", label); };
const no = async (label, p) => { await assertFails(p); passed++; console.log("  ✓ (rechazado)", label); };

const TEAM = "equipoSoporte01", OTHER = "equipoAjeno0001";
const db = (uid) => env.authenticatedContext(uid).firestore();
const anon = env.unauthenticatedContext().firestore();
const script = { id: "s1", name: "Reparar audio", category: "Audio", lang: "ps5", tags: ["audio"], notes: "", code: "Get-Service Audiosrv\n", createdAt: 1, updatedAt: 1 };
const profile = (name, team) => ({ name, photoURL: "", cargo: "Soporte", status: "disponible", team, lastSeen: serverTimestamp(), createdAt: 1 });

console.log("Equipos y perfiles");
await ok("Jeiler crea su equipo", setDoc(doc(db("jeiler"), "teams", TEAM), { name: "Soporte SENA", owner: "jeiler", createdAt: serverTimestamp() }));
await ok("Extraño crea otro equipo", setDoc(doc(db("extrano"), "teams", OTHER), { name: "Otro", owner: "extrano", createdAt: serverTimestamp() }));
await no("no se puede crear un equipo a nombre de otro", setDoc(doc(db("jeiler"), "teams", "equipoFalso0001"), { name: "X", owner: "amigo", createdAt: serverTimestamp() }));
await no("código de equipo demasiado corto", setDoc(doc(db("jeiler"), "teams", "corto"), { name: "X", owner: "jeiler", createdAt: serverTimestamp() }));
await ok("Jeiler entra a su equipo", setDoc(doc(db("jeiler"), "users", "jeiler"), profile("Jeiler", TEAM)));
await ok("Amigo se une con el código", setDoc(doc(db("amigo"), "users", "amigo"), profile("Amigo", TEAM)));
await ok("Extraño está en otro equipo", setDoc(doc(db("extrano"), "users", "extrano"), profile("Extraño", OTHER)));
await no("unirse a un equipo que no existe", setDoc(doc(db("pirata"), "users", "pirata"), profile("Pirata", "noExisteEsteCod")));
await no("escribir el perfil de otra persona", setDoc(doc(db("amigo"), "users", "jeiler"), profile("Hackeado", TEAM)));
await no("falsificar la hora de conexión", updateDoc(doc(db("amigo"), "users", "amigo"), { lastSeen: Timestamp.fromMillis(0) }));
await ok("cambiar el estado a Ocupado", updateDoc(doc(db("amigo"), "users", "amigo"), { status: "ocupado" }));
await no("estado inválido", updateDoc(doc(db("amigo"), "users", "amigo"), { status: "invisible" }));
await ok("ver a un compañero del equipo", getDoc(doc(db("amigo"), "users", "jeiler")));
await no("ver a alguien de otro equipo", getDoc(doc(db("extrano"), "users", "jeiler")));
await ok("listar miembros de mi equipo", getDocs(query(collection(db("amigo"), "users"), where("team", "==", TEAM))));
await no("listar miembros de otro equipo", getDocs(query(collection(db("extrano"), "users"), where("team", "==", TEAM))));
await ok("latido de presencia (lastSeen del servidor)", updateDoc(doc(db("amigo"), "users", "amigo"), { lastSeen: serverTimestamp() }));
await ok("solitario sin equipo", setDoc(doc(db("solo"), "users", "solo"), profile("Solo", "")));
await ok("otro sin equipo", setDoc(doc(db("solo2"), "users", "solo2"), profile("Solo2", "")));
await no("sin equipo no se listan entre sí", getDocs(query(collection(db("solo"), "users"), where("team", "==", ""))));
await no("sin equipo no se pueden mandar mensajes", setDoc(doc(db("solo"), "messages", "mx"), { from: "solo", to: "solo2", team: "", kind: "texto", text: "hola", script: null, requestId: null, createdAt: serverTimestamp(), read: false }));
await no("sin sesión no se ve nada", getDoc(doc(anon, "users", "jeiler")));

console.log("Biblioteca privada y dispositivos");
await ok("guardar un script propio", setDoc(doc(db("jeiler"), "users/jeiler/scripts", "s1"), script));
await no("leer la biblioteca de otro", getDoc(doc(db("amigo"), "users/jeiler/scripts", "s1")));
await no("script con lenguaje inválido", setDoc(doc(db("jeiler"), "users/jeiler/scripts", "s2"), { ...script, id: "s2", lang: "exe" }));
await no("id del documento distinto al del script", setDoc(doc(db("jeiler"), "users/jeiler/scripts", "s9"), script));
await ok("registrar mi dispositivo", setDoc(doc(db("jeiler"), "devices", "jeiler"), { tokens: [{ token: "t1", label: "Android", addedAt: 1 }] }));
await no("leer los dispositivos de otro", getDoc(doc(db("amigo"), "devices", "jeiler")));

console.log("Mensajes");
const msg = (from, to, extra) => ({ from, to, team: TEAM, kind: "script", text: "Te mando el arreglo", script, requestId: null, createdAt: serverTimestamp(), read: false, ...extra });
await ok("Jeiler le envía un script al amigo", setDoc(doc(db("jeiler"), "messages", "m1"), msg("jeiler", "amigo")));
await ok("Amigo le pide un script a Jeiler", setDoc(doc(db("amigo"), "messages", "m2"), msg("amigo", "jeiler", { kind: "pedido", text: "¿Tienes uno para la red?", script: null })));
await no("enviar a alguien de otro equipo", setDoc(doc(db("jeiler"), "messages", "m3"), msg("jeiler", "extrano")));
await no("el extraño no puede escribirle a Jeiler", setDoc(doc(db("extrano"), "messages", "m4"), msg("extrano", "jeiler", { team: OTHER })));
await no("hacerse pasar por otro remitente", setDoc(doc(db("amigo"), "messages", "m5"), msg("jeiler", "amigo")));
await no("mensaje tipo script sin script", setDoc(doc(db("jeiler"), "messages", "m6"), msg("jeiler", "amigo", { script: null })));
await no("enviarse a sí mismo", setDoc(doc(db("jeiler"), "messages", "m7"), msg("jeiler", "jeiler")));
await no("crear un mensaje ya leído", setDoc(doc(db("jeiler"), "messages", "m8"), msg("jeiler", "amigo", { read: true })));
await ok("enviar un prompt desde el Asesor IA", setDoc(doc(db("jeiler"), "messages", "mp"), msg("jeiler", "amigo", { kind: "prompt", text: "", script: null, prompt: { title: "Diagnóstico de red", text: "Actúa como técnico…", model: "Claude" } })));
await no("prompt vacío", setDoc(doc(db("jeiler"), "messages", "mq"), msg("jeiler", "amigo", { kind: "prompt", text: "", script: null, prompt: { title: "x", text: "" } })));
await no("tipo prompt sin prompt", setDoc(doc(db("jeiler"), "messages", "mr"), msg("jeiler", "amigo", { kind: "prompt", script: null })));
await ok("el destinatario lo lee", getDoc(doc(db("amigo"), "messages", "m1")));
await no("un tercero no puede leerlo", getDoc(doc(db("extrano"), "messages", "m1")));
await ok("bandeja: mis mensajes recibidos", getDocs(query(collection(db("amigo"), "messages"), where("to", "==", "amigo"))));
await no("leer la bandeja de otro", getDocs(query(collection(db("amigo"), "messages"), where("to", "==", "jeiler"))));
await ok("el destinatario lo marca como leído", updateDoc(doc(db("amigo"), "messages", "m1"), { read: true }));
await no("el destinatario no puede cambiar el contenido", updateDoc(doc(db("amigo"), "messages", "m1"), { text: "cambiado" }));
await no("el remitente no puede marcarlo como leído", updateDoc(doc(db("amigo"), "messages", "m2"), { read: true }));
await ok("borrar un mensaje propio", deleteDoc(doc(db("jeiler"), "messages", "m1")));

console.log("Pedidos al equipo y scripts publicados");
const req = { from: "amigo", team: TEAM, text: "Necesito un script para resetear Winsock", lang: "", category: "Red", createdAt: serverTimestamp(), status: "abierto" };
await ok("pedido al equipo", setDoc(doc(db("amigo"), "requests", "r1"), req));
await no("pedido a otro equipo", setDoc(doc(db("amigo"), "requests", "r2"), { ...req, team: OTHER }));
await ok("un compañero ve el pedido", getDoc(doc(db("jeiler"), "requests", "r1")));
await no("alguien de otro equipo no lo ve", getDoc(doc(db("extrano"), "requests", "r1")));
await ok("quien pidió lo marca resuelto", updateDoc(doc(db("amigo"), "requests", "r1"), { status: "resuelto" }));
await no("otro no puede cerrar el pedido", updateDoc(doc(db("jeiler"), "requests", "r1"), { status: "abierto" }));
await ok("publicar un script en el equipo", setDoc(doc(db("jeiler"), "community", "jeiler_s1"), { owner: "jeiler", team: TEAM, script, publishedAt: serverTimestamp() }));
await no("publicar a nombre de otro", setDoc(doc(db("amigo"), "community", "jeiler_s2"), { owner: "amigo", team: TEAM, script, publishedAt: serverTimestamp() }));
await ok("un compañero ve lo publicado", getDocs(query(collection(db("amigo"), "community"), where("team", "==", TEAM))));
await no("otro equipo no lo ve", getDocs(query(collection(db("extrano"), "community"), where("team", "==", TEAM))));
await no("borrar lo publicado por otro", deleteDoc(doc(db("amigo"), "community", "jeiler_s1")));

await env.cleanup();
console.log(`\n${passed} comprobaciones OK`);
