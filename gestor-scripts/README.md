# Lanzador de Scripts

Gestor portátil de scripts de soporte técnico (PowerShell 5.1 y 7, CMD, Bash, Python) para el celular y cualquier PC. Guarda, organiza, **audita**, descarga y comparte tus scripts por enlace o QR. **No ejecuta nada**: tú revisas el código y lo corres en el equipo.

**Versión para equipos (inicio de sesión, chat, pedidos y notificaciones push):** ver [`../equipos`](../equipos/README.md). Usa el mismo motor de este archivo.

Archivo único: `lanzador.html` (React 18 + Tailwind + lucide-react, cargados con respaldo desde CDN; QR con `qrcode-generator`).

## Qué hace

- **PowerShell 5.1 nativo:** lenguaje propio; el auditor marca como falla lo que solo existe en PowerShell 7.
- **Agregar desde el computador:** importa archivos .ps1, .bat, .cmd, .py y .sh (respeta UTF-16 y ANSI); los .ps1 sin sintaxis de PS7 entran como 5.1.
- **Compartir con otras apps:** menú Compartir del sistema (Bluetooth, WhatsApp, Gmail…) fuera de claude.ai; dentro, el archivo pasa por la descarga (en iPhone abre Compartir; en Android queda en Descargas). Enlaces directos a WhatsApp y Telegram.
- **Comunidad con inicio de sesión:** la sesión es la cuenta de Claude. Cada persona marca qué scripts comparte; los demás los ven, los auditan y los copian a su biblioteca. Tablero de pedidos («necesito un script para…»). Reglas: cada uno escribe solo lo suyo; la biblioteca personal es privada. Para que alguien publique, el dueño debe quitar el enlace público e invitarlo por correo como Editor.
- **Recibir de otra persona sin Claude:** con el enlace de su Gist (versión PC) o los archivos que te mande.
- **Biblioteca:** nombre, categoría (Audio, Resolución/Video, Organizador de Comunidades, Red, Mantenimiento), lenguaje, etiquetas y notas de qué problema resuelve.
- **Buscador aproximado (fuzzy):** tolera errores de dedo (ej. «resolucon» encuentra «resolución») y filtros rápidos por categoría y lenguaje.
- **3 ejemplos reales** precargados y probados (ver `ejemplos/`): reparar audio (Audiosrv), cambiar resolución o reiniciar el driver de video, y organizar una carpeta por tipo de archivo.
- **Auditor:** revisa permisos de administrador (`#Requires` + verificación `IsInRole`), manejo de errores (`try/catch`, `$ErrorActionPreference='Stop'`), rutas fijas vs. dinámicas (`$env:USERPROFILE`), secretos en texto y sintaxis exclusiva de PS7. Corrige varios puntos con un botón y da enlaces de búsqueda a GitHub, YouTube y Microsoft Learn.
- **Pasar al PC:** descarga el archivo con su extensión real (en claude.ai llega en `.zip`), muestra el **enlace crudo del Gist** y un **QR** para abrirlo en el otro equipo, o un QR con el código como texto para scripts cortos.
- **Sincronización:**
  - *GitHub Gists* (token clásico con permiso `gist`): subir (Push) y descargar (Pull), uniendo cambios por fecha. Funciona en la versión para PC (el visor de claude.ai bloquea la conexión con GitHub).
  - *Nube de Claude* (dentro de claude.ai, con sesión iniciada): sincroniza celular↔PC automáticamente, privado por cuenta.
  - Respaldo export/import en `.json`.

## Ejemplos (`ejemplos/`)

Scripts de PowerShell 7 validados con el parser de PowerShell; el organizador se probó ejecutándolo sobre una carpeta de prueba. Son los mismos que precarga la app.

## Compilar los estilos

Si cambias clases de Tailwind en `lanzador.html`, ejecuta en esta carpeta:

```bash
npm i -D tailwindcss@3.4.17
node build.mjs
```

Recompila el CSS de Tailwind y lo deja incrustado dentro del `.html` (entre los marcadores `tailwind:start/end`).

## Límites

- La app **no ejecuta** scripts: los administra. Revisa siempre el código antes de correrlo.
- Los nombres de modelos y las rutas de menús pueden cambiar; el auditor usa reglas, no una IA.
- Dentro de claude.ai, GitHub Gists no funciona (CSP bloquea la red); usa la nube de Claude o abre el `.html` en Chrome en el PC.
