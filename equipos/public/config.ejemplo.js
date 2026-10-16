// ======================= CONFIGURACIÓN DE LANZADOR · EQUIPOS =======================
// Ábrelo con el Bloc de notas. Pega donde dice y guarda con Ctrl + G.

// 1) Firebase → engranaje → Configuración del proyecto → Tus apps → Configuración del SDK → marca «Configuración».
//    Copia el bloque que empieza con  const firebaseConfig = {  y termina en  };  y pégalo en la línea vacía de abajo:


// 2) Firebase → Configuración del proyecto → Cloud Messaging → Certificados push web → copia el «Par de claves».
//    Pégalo entre las comillas, en lugar de PEGA-AQUÍ:
const vapidKey = "PEGA-AQUÍ";

// 3) Cloudflare → tu Worker → la dirección que termina en .workers.dev (con https://), entre las comillas:
const notifyUrl = "PEGA-AQUÍ";

// No cambies nada de aquí para abajo.
self.LANZADOR_CONFIG = {
  firebase: typeof firebaseConfig !== "undefined" ? firebaseConfig : { apiKey: "PEGA-AQUÍ" },
  vapidKey: vapidKey,
  notifyUrl: notifyUrl
};
