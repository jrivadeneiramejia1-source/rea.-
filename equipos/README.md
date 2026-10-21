# Lanzador · Equipos

El Lanzador de Scripts convertido en app de equipo, al estilo Microsoft Teams: cada persona inicia sesión con su cuenta, ve quién está conectado, chatea, pide scripts y los recibe con **notificación al celular o al PC**, aunque la app esté cerrada. El **Asesor IA** es una app aparte: [`../asesor-ia`](../asesor-ia/README.md).

## Qué hace

- **Inicio de sesión explícito:** Google o correo y contraseña (con «¿Olvidaste tu contraseña?»). Arriba siempre se ve quién está conectado y con qué cuenta. Cerrar sesión quita los avisos de ese dispositivo.
- **Equipos:** creas un equipo y obtienes un código (`XXXX-XXXX-XXXX`) o un enlace/QR de invitación. Solo las personas del mismo equipo se ven y se escriben (las reglas de Firestore lo exigen en el servidor, no solo en la pantalla).
- **Presencia:** Disponible, Ocupado, Ausente o «Desconectado · hace 2 h». Cada app abierta avisa cada 2 minutos que sigue ahí.
- **Chat 1 a 1:** texto, scripts (Ver, Guardar en mis scripts, Compartir), pedidos (y los prompts que llegaron antes de separar el Asesor, que se pueden copiar). Marca «Enviado» / «Visto». Separado por días, como WhatsApp.
- **Chat interactivo:** toca un mensaje (o ⋮) para **Responder citándolo**, Copiar o Borrar; tocar la cita lleva al mensaje original. En un script recibido: **¿Cómo lo uso?** abre una guía que se arma sola con el código (qué hace, si necesita administrador o PowerShell 7, si hace preguntas, y los pasos con los comandos para copiar) y desde ahí **le preguntas a quien te lo mandó** en el mismo chat, citando el script. **Me sirvió / No me funcionó**: quien lo envió lo ve en su mensaje; si no funcionó, se abre la respuesta para contar el error.
- **Pedidos:** «Pedir script» a una persona o a todo el equipo diciendo **qué necesitas y para qué** (obligatorio), en qué sistema (Windows 11, 10, Server, Linux) y el tema. Quien lo tenga toca «Tengo uno: enviar» y tú lo adaptas a tu equipo (la ruta la pones tú).
- **Notificaciones:**
  - Push (Firebase Cloud Messaging) cuando te escriben, te envían o te piden un script, y cuando alguien pide al equipo. Al tocar el aviso se abre el chat o el pedido.
  - Con la app abierta: aviso flotante, sonido, vibración, contador en el ícono de la app y en el título.
  - Si a quien le envías no tiene avisos activos, la app te lo dice («lo verá al abrir la app»).
- **Scripts:** biblioteca privada en la nube (celular ↔ PC), buscador que tolera errores, auditor con correcciones de un toque, importar `.ps1 .bat .cmd .py .sh`, publicar al equipo.
- **Compartir:** enviar a alguien del equipo (con aviso), menú Compartir del sistema con el archivo (Bluetooth, WhatsApp, Gmail, Drive…), WhatsApp como texto, correo, descarga con extensión real, copiar y QR.
- **Recibir desde otras apps:** instalada en Android, aparece en el menú Compartir: comparte un `.ps1` desde Archivos, WhatsApp o Bluetooth y entra a tu biblioteca.
- **Sin internet:** abre y muestra lo último; lo que envíes sale al reconectar.

## Por qué Bluetooth no salía antes

El menú Compartir del sistema solo muestra Bluetooth cuando se comparte **un archivo**, y dentro de claude.ai los artifacts no pueden usar ese menú. Además, Chrome en Android solo deja compartir ciertos tipos de archivo (`.txt` sí, `.ps1` no). Por eso esta versión es una app propia (PWA) y, si el sistema no acepta `.ps1`, comparte el mismo archivo como `nombre.ps1.txt`: quien lo recibe le quita el `.txt` (o lo importa en la app, que lo hace sola).

## Cómo funciona

```
Celular / PC (app instalable)  ──Firebase Auth──▶  quién eres
        │                      ──Firestore─────▶  equipo, chat, pedidos, scripts (tiempo real, reglas de seguridad)
        │ POST /notify (con tu sesión)
        ▼
Cloudflare Worker ──verifica la sesión, lee el mensaje──▶ FCM ──▶ notificación en los dispositivos del destinatario
```

| Pieza | Plan gratis | Para qué |
|---|---|---|
| Firebase Hosting | 10 GB/mes | Publica la app (`https://TU-PROYECTO.web.app`) |
| Firebase Auth | Ilimitado (Google y correo) | Cuentas |
| Firestore | 50 000 lecturas y 20 000 escrituras al día | Datos en tiempo real |
| Cloud Messaging | Gratis | Notificaciones push |
| Cloudflare Workers | 100 000 peticiones al día | Envía los avisos (FCM exige un servidor con clave privada) |

Para un grupo de ~10 personas usando la app varias horas al día queda dentro del plan gratis.

## Publicar desde el navegador (sin instalar nada)

Usa el archivo `lanzador-equipos.zip` (se arma con `npm run build && node empaquetar.mjs`). Trae:
`1-sitio/` (la app), `1-sitio/config.js` (lo llenas con el Bloc de notas), `2-worker.js` y `3-reglas-firestore.txt`.

**A. Firebase** (https://console.firebase.google.com)
1. **Crear un proyecto** → nombre `lanzador-jeiler` → sin Google Analytics.
2. En la página del proyecto, ícono **`</>` (Web)** → apodo `Lanzador` → **Registrar app** (sin marcar Hosting). Copia el bloque `const firebaseConfig = { … };`.
3. **Authentication → Comenzar → Método de acceso (Sign-in method):** activa **Google** (elige tu correo de asistencia) y **Correo electrónico/contraseña**.
4. **Firestore Database → Crear base de datos** → edición Standard → ubicación `nam5 (United States)` → **modo de producción** → Crear. Luego pestaña **Reglas (Rules)** → borra todo → pega `3-reglas-firestore.txt` → **Publicar**.
5. **Engranaje → Configuración del proyecto → Cloud Messaging → Certificados push web → Generar par de claves.** Copia la clave.
6. **Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.** Se descarga un `.json`: es una llave privada, no la compartas.

**B. Cloudflare Worker** (https://dash.cloudflare.com)
7. **Workers & Pages → Create (Crear) → Create Worker** → nombre `lanzador-notificaciones` → **Deploy**. Luego **Edit code (Editar código)** → borra todo → pega `2-worker.js` → **Deploy**. Copia la dirección `https://lanzador-notificaciones.….workers.dev`.

**C. La app**
8. Abre `1-sitio/config.js` con el Bloc de notas: pega el bloque de Firebase (paso 2), la clave push (paso 5) y la dirección del Worker (paso 7). Guarda.
9. **Workers & Pages → Create → Pages → Upload assets (Subir archivos)** → nombre `lanzador-jeiler` → arrastra la carpeta `1-sitio` → **Deploy site**. Tu app queda en `https://lanzador-jeiler.pages.dev`.

**D. Conectar todo**
10. Worker → **Settings (Configuración) → Variables and Secrets → Add (Agregar)**:

    | Tipo | Nombre | Valor |
    |---|---|---|
    | Text | `FIREBASE_PROJECT_ID` | `lanzador-jeiler` (el ID del proyecto) |
    | Text | `APP_URL` | `https://lanzador-jeiler.pages.dev` |
    | Text | `ALLOWED_ORIGINS` | `https://lanzador-jeiler.pages.dev` |
    | Secret | `GOOGLE_SERVICE_ACCOUNT` | todo el contenido del `.json` del paso 6 |

    → **Deploy**.
11. Firebase → **Authentication → Configuración (Settings) → Dominios autorizados → Agregar dominio** → `lanzador-jeiler.pages.dev`.
12. Abre la app, crea tu cuenta y tu equipo. Los índices de Firestore los crea el Worker solo la primera vez (tardan unos minutos en estar listos); mientras tanto la app funciona igual, sin avisos. Si en Firestore → Índices no aparecen después de 10 minutos, créalos a mano (Compuesto):

    | Colección | Campo 1 | Campo 2 |
    |---|---|---|
    | `messages` | `to` Ascendente | `createdAt` Descendente |
    | `messages` | `from` Ascendente | `createdAt` Descendente |
    | `requests` | `team` Ascendente | `createdAt` Descendente |
    | `community` | `team` Ascendente | `publishedAt` Descendente |

Para actualizar la app después: Pages → tu proyecto → **Create deployment (Nueva implementación)** → arrastra otra vez `1-sitio` (con tu `config.js`).

## Publicar con un agente (Claude) o con un comando

`node publicar.mjs` arma y publica en Cloudflare, sin tocar variables ni secretos: el sitio del Lanzador (sin Asesor), el código del Worker de avisos y el Asesor IA. `node publicar.mjs --simular` revisa todo sin publicar nada; también se puede pedir solo una parte: `lanzador`, `worker` o `asesor`.

Necesita estas variables en el entorno (el token es secreto: nunca en el chat ni en un archivo):

| Variable | Qué es |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token con permiso de edición de *Cloudflare Pages* y *Workers Scripts*, solo de tu cuenta |
| `CLOUDFLARE_ACCOUNT_ID` | ID de tu cuenta de Cloudflare |
| `PAGES_LANZADOR` | Proyecto de Pages del Lanzador (debe existir; por defecto `lanzador-jeiler`) |
| `PAGES_ASESOR` | Proyecto de Pages del Asesor (se crea si no existe; por defecto `asesor-ia`) |
| `WORKER_NOMBRE` | Worker de avisos (por defecto `lanzado-notificaciones`) |
| `LANZADOR_CONFIG_B64` | Tu `config.js` en base64 (o el archivo `public/config.js`). Se revisa que no esté en blanco |

En PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("RUTA\config.js")) | Set-Clipboard`.

Detalles que cuidan lo que ya tienes: el Worker se sube con `--keep-vars` y sin `[vars]`, así que `FIREBASE_PROJECT_ID`, `APP_URL`, `ALLOWED_ORIGINS` y la llave secreta quedan como están; el sitio del Lanzador solo se publica en un proyecto de Pages que ya exista. Las reglas de Firestore no las toca (se pegan a mano en Firebase).

Probado en simulación (armado, revisión del `config.js`, mensajes de error). **No se probó una publicación real** contra Cloudflare.

## Instalar (Windows, PowerShell 7)

Necesitas Node.js 20 o más nuevo (`winget install OpenJS.NodeJS.LTS`), una cuenta de Google y una de Cloudflare.

```powershell
git clone --branch ccr-72c56d0d-kjvseq https://github.com/jrivadeneiramejia1-source/rea.-.git "$HOME\rea"
Set-Location "$HOME\rea\equipos"
pwsh -File .\instalar.ps1 -Simular            # ver qué hará, sin tocar nada
pwsh -File .\instalar.ps1 -ProyectoId lanzador-jeiler
```

El instalador pide confirmación antes de crear el proyecto, publicar el Worker y publicar la app. Te abre las 3 páginas de la consola de Firebase que no tienen comando:

1. **Authentication → Sign-in method (Método de acceso):** activar Google y Correo/contraseña (Email/Password).
2. **Cloud Messaging → Certificados Web Push (Web Push certificates):** «Generar par de claves» (Generate key pair) y pegar la clave.
3. **Cuentas de servicio (Service accounts) → Generar nueva clave privada (Generate new private key):** guardar el `.json` **fuera** de la carpeta del proyecto. Se guarda cifrado en Cloudflare; después puedes borrarlo.

Solo la app, sin notificaciones push: `pwsh -File .\instalar.ps1 -ProyectoId lanzador-jeiler -SinAvisos`.

### Actualizar después de cambios

**Versión sin el Asesor IA adentro:** al publicar, `/asesor/` deja de existir en este sitio (el `build` borra la copia vieja). El Asesor se publica aparte (ver `../asesor-ia/README.md`). Las reglas no cambian.

**Versión con avisos al día y limpieza automática:** las reglas no cambian. Hay que publicar la app y el Worker (los 3 comandos de abajo); el Worker ahora también quita los tokens de otro proyecto.

**Versión con «para qué», citas y «Me sirvió»:** hay que volver a pegar las reglas (`3-reglas-firestore.txt` del zip) en Firestore → Reglas → Publicar. Mientras no se peguen, la app sigue funcionando: el «para qué» y el sistema viajan dentro del texto, la cita no se guarda y «Me sirvió» avisa que faltan las reglas. El Worker no cambia.

```powershell
Set-Location "$HOME\rea\equipos"
npm run build
npx firebase deploy --only "hosting,firestore"
Set-Location worker; npx wrangler deploy; Set-Location ..
```

## Usarla

1. Abre `https://TU-PROYECTO.web.app` en Chrome → menú ⋮ → **Instalar app** (Install app). En iPhone: Compartir (Share) → **Agregar a inicio** (Add to Home Screen).
2. Inicia sesión → nombre y cargo → **Crear equipo** → **Invitar** (manda el enlace por WhatsApp).
3. **Perfil → Activar en este dispositivo** en cada celular o PC donde quieras avisos → **Enviar prueba**.

En iPhone las notificaciones solo funcionan con la app agregada a inicio (iOS 16.4 o más nuevo).

**Avisos que no llegan**: cada celular o PC se activa por separado. Al entrar en un dispositivo donde nunca se decidió, la app ofrece activarlos una vez. Donde ya hay permiso, al abrir la app el token de avisos se pone al día solo (Firebase lo cambia con el tiempo y antes quedaba el viejo). El Worker quita los tokens que ya no sirven.

**Limpieza automática** (para no llenar el plan gratis de Firebase): cada persona borra al abrir la app, máximo dos veces al día, sus mensajes leídos de más de 7 días, todos los de más de 30 y sus pedidos resueltos de más de 7 días. El chat lo avisa abajo; los scripts que sirvan se guardan en **Mis scripts**. Si un día se acaba el cupo gratis, la app lo dice en palabras sencillas y sigue con lo que ya tiene.

## Archivos

| Archivo | Qué es |
|---|---|
| `public/lanzador.js` | Interfaz (React 18 + htm, sin compilación) |
| `public/equipos.js` | Capa de datos: sesión, equipo, presencia, chat, pedidos, biblioteca, avisos |
| `public/sw.js` | Service worker: push, recibir archivos compartidos, modo sin internet |
| `firestore.rules` | Reglas de seguridad (quién puede leer y escribir qué) |
| `worker/src/index.js` | Worker de Cloudflare que envía los avisos |
| `build.mjs` | Copia librerías a `public/vendor`, toma el motor de `../gestor-scripts/lanzador.html` y compila Tailwind |
| `instalar.ps1` | Instalador guiado (PowerShell) |
| `empaquetar.mjs` | Arma `lanzador-equipos.zip` para publicar desde el navegador |

`public/motor.js`, `public/vendor/`, `public/lanzador.css` y `public/config.js` los genera `npm run build` o el instalador (no se suben a GitHub). La plantilla es `public/config.ejemplo.js`.

## Pruebas

```bash
npm run test:worker      # Worker: firmas RSA reales, tokens falsos/vencidos/de otro proyecto, CORS, avisos, índices
node pruebas/consultas.test.mjs   # la app funciona aunque falten los índices
npm run test:reglas      # 73 casos de reglas contra el emulador de Firestore (requiere Java 21)
PLAYWRIGHT_MODULE=… npx firebase emulators:exec --only auth,firestore,hosting --project demo-equipos "node pruebas/e2e.mjs"
```

La prueba de extremo a extremo usa dos navegadores (Jeiler y Amigo): cuentas, equipo por invitación, presencia, pedido al equipo con «para qué» y aviso push, respuesta con script, guardar, guía «¿Cómo lo uso?», pregunta citando el script, «Me sirvió», responder citando, «Visto», chat sin duplicados y sin salirse de la pantalla, reglas anteriores sin perder datos, menú Compartir, limpieza automática, token de avisos al día, ofrecer avisos en un teléfono nuevo y que el Lanzador ya no trae el Asesor (32 comprobaciones). El servidor FCM es simulado en esa prueba.

## Límites

- No probado todavía con un proyecto real de Firebase ni con avisos reales en un celular: la entrega real de FCM y el menú Compartir con Bluetooth dependen del dispositivo. El código sigue la documentación oficial y las pruebas cubren todo lo demás con los emuladores.
- Una persona está en un solo equipo a la vez (puede cambiarse con otro código).
- El código del equipo es la llave de entrada: compártelo solo con tu grupo. Si se filtra, crea otro equipo.
- La app **no ejecuta** scripts. Revisa siempre el código antes de correrlo.
