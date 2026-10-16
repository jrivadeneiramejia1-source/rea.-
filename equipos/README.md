# Lanzador · Equipos

El Lanzador de Scripts convertido en app de equipo, al estilo Microsoft Teams: cada persona inicia sesión con su cuenta, ve quién está conectado, chatea, pide scripts y los recibe con **notificación al celular o al PC**, aunque la app esté cerrada. Incluye el **Asesor IA** en `/asesor/`, conectado al mismo equipo.

## Qué hace

- **Inicio de sesión explícito:** Google o correo y contraseña (con «¿Olvidaste tu contraseña?»). Arriba siempre se ve quién está conectado y con qué cuenta. Cerrar sesión quita los avisos de ese dispositivo.
- **Equipos:** creas un equipo y obtienes un código (`XXXX-XXXX-XXXX`) o un enlace/QR de invitación. Solo las personas del mismo equipo se ven y se escriben (las reglas de Firestore lo exigen en el servidor, no solo en la pantalla).
- **Presencia:** Disponible, Ocupado, Ausente o «Desconectado · hace 2 h». Cada app abierta avisa cada 2 minutos que sigue ahí.
- **Chat 1 a 1:** texto, scripts (Ver, Guardar en mis scripts, Compartir), pedidos y prompts del Asesor. Marca «Enviado» / «Visto».
- **Pedidos:** «Pedir script» a una persona o a todo el equipo. Solo dices qué necesitas; quien lo tenga toca «Tengo uno: enviar» y tú lo adaptas a tu equipo (la ruta la pones tú).
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

## Archivos

| Archivo | Qué es |
|---|---|
| `public/lanzador.js` | Interfaz (React 18 + htm, sin compilación) |
| `public/equipos.js` | Capa de datos: sesión, equipo, presencia, chat, pedidos, biblioteca, avisos |
| `public/sw.js` | Service worker: push, recibir archivos compartidos, modo sin internet |
| `public/asesor-puente.js` | Conecta el Asesor IA con el equipo (enviar prompts, ver mensajes nuevos) |
| `firestore.rules` | Reglas de seguridad (quién puede leer y escribir qué) |
| `worker/src/index.js` | Worker de Cloudflare que envía los avisos |
| `build.mjs` | Copia librerías a `public/vendor`, toma el motor de `../gestor-scripts/lanzador.html`, prepara `/asesor/` y compila Tailwind |
| `instalar.ps1` | Instalador guiado |

`public/motor.js`, `public/vendor/`, `public/asesor/`, `public/lanzador.css` y `public/config.json` los genera `npm run build` o el instalador (no se suben a GitHub).

## Pruebas

```bash
npm run test:worker      # Worker: firmas RSA reales, tokens falsos/vencidos/de otro proyecto, CORS, avisos
npm run test:reglas      # 58 casos de reglas contra el emulador de Firestore (requiere Java 21)
PLAYWRIGHT_MODULE=… npx firebase emulators:exec --only auth,firestore,hosting --project demo-equipos "node pruebas/e2e.mjs"
```

La prueba de extremo a extremo usa dos navegadores (Jeiler y Amigo): cuentas, equipo por invitación, presencia, pedido al equipo con aviso push, respuesta con script, guardar, «Visto», chat sin duplicados, menú Compartir y envío de un prompt desde el Asesor IA. El servidor FCM es simulado en esa prueba.

## Límites

- No probado todavía con un proyecto real de Firebase ni con avisos reales en un celular: la entrega real de FCM y el menú Compartir con Bluetooth dependen del dispositivo. El código sigue la documentación oficial y las pruebas cubren todo lo demás con los emuladores.
- Una persona está en un solo equipo a la vez (puede cambiarse con otro código).
- El código del equipo es la llave de entrada: compártelo solo con tu grupo. Si se filtra, crea otro equipo.
- La app **no ejecuta** scripts. Revisa siempre el código antes de correrlo.
