# Asesor IA

Te dice, antes de enviar un pedido a Claude, ChatGPT, Gemini o DeepSeek:

- tokens aproximados (tu mensaje + historial que se reenvía + respuesta),
- qué modelo y qué nivel de pensamiento usar (Simple → Normal → Compleja → Experta),
- qué le falta a tu prompt, te hace preguntas según lo que escribes y te da una versión mejorada lista para copiar,
- tu perfil (rol, equipo, metas, gustos) para que cada prompt lleve tu contexto,
- aprende de ti: recuerda datos (ej. tu versión de n8n) para no volver a preguntarlos y te da consejos según cómo pides las cosas,
- voz: dictado y modo conversación (te lee la recomendación y te hace las preguntas).

Todo corre en tu dispositivo. No usa API ni gasta tokens.

Es una app aparte del Lanzador · Equipos: no comparte sesión, datos ni dirección con él.

## Publicarla como app propia (Cloudflare Pages, gratis)

`web/build.mjs` arma la app desde `artifact/asesor-ia.html` (la misma versión de claude.ai) en `web/dist`: página, manifiesto para instalarla y service worker para que abra sin internet después de la primera vez.

```powershell
Set-Location "$HOME\rea\asesor-ia\web"
node build.mjs
npx wrangler pages deploy dist --project-name asesor-ia
```

- La primera vez Wrangler pide entrar a Cloudflare (la misma cuenta del Worker de avisos) y crea el proyecto. Te da la dirección, por ejemplo `https://asesor-ia.pages.dev`. Si el nombre ya está tomado, usa otro en `--project-name`.
- Para actualizar: los mismos dos últimos comandos.
- En el celular: abre la dirección en Chrome → menú ⋮ → **Instalar app** (Install app). En iPhone: Compartir (Share) → **Agregar a inicio** (Add to Home Screen).
- Ahí el dictado por voz sí funciona (en claude.ai el micrófono está bloqueado).
- Prueba: `node web/prueba.mjs` (carga, instalable, sin internet y sin nada del Lanzador).

## Versión 3.2 (octubre de 2026)

- **Separada del Lanzador:** se quitó el botón «Enviar a un compañero» y la entrada de prompts desde el chat del Lanzador. Ahora se publica sola (arriba).

## Versión 3.1 (octubre de 2026)

- **Soporte técnico bien entendido:** «la impresora no imprime», «3 pitidos al encender», «se reinicia solo», «IP estática», «Outlook no abre» ya son *Soporte técnico* (antes salían como tarea simple o general). Pregunta síntoma, equipo y qué cambió, y pide la respuesta como tabla *Prueba → Resultado esperado → Siguiente paso*, de lo más seguro a lo más complejo. «Bot de Discord» ya no se confunde con un disco.
- **Errores y registros pegados:** un error de PowerShell completo (`At C:\…:3 char:1`, `+ CategoryInfo…`), líneas con hora y un flujo de n8n en JSON van como datos, sin «limpiarlos», y ya no te pregunta «¿cuál es el error exacto?».
- **Oculta datos sensibles** del prompt (contraseñas, tokens, llaves de API, JWT, token de bot de Telegram). Opcional: correos e IP. Se apaga en Perfil o con «No ocultar».
- **Scripts más seguros:** el prompt pide `-WhatIf` y `Test-Path` antes de borrar o cambiar algo.
- **Puntaje honesto:** «asdf qwer zxcv» ya no saca 100; el idioma no cuenta como tono; las plantillas con `[partes sin llenar]` avisan y no se dan por completas.
- **No se pierde tu trabajo:** al cambiar a otra idea se borran las respuestas viejas; si editaste el prompt a mano y luego respondes, te pregunta cuál dejar. Botón «Nueva idea».
- **Memoria:** importar valida el archivo y dice qué cargó; copiar, exportar y favorito cuentan una sola vez; un favorito no se usa como ejemplo de sí mismo; los consejos hablan del modelo de la app elegida.
- **Accesibilidad y celular:** contraste del texto tenue corregido, botones de 40 a 44 px, nada se sale a 390 px, `lang="es"`, avisos leídos por lectores de pantalla y sin animaciones con «reducir movimiento».
- **Pruebas:** `node pruebas/motor.mjs` (37 casos del motor) y `pruebas/interfaz.mjs` (15 en navegador, con axe).

## Versión 3 (artifact)

`artifact/asesor-ia.html` es la versión actual publicada en claude.ai. Es un solo archivo: Tailwind 3.4.17 va compilado adentro y React 18, htm y lucide-react se cargan con respaldo (cdnjs → jsdelivr → unpkg; los íconos son opcionales). Si cambias clases de Tailwind, corre `node build.mjs` en `artifact/` (requiere `npm i -D tailwindcss@3.4.17`).

- Motor local (`<script id="engine">`): detecta el tipo de tarea, hace de 1 a 3 preguntas (modo entrevista), arma el prompt en XML de Anthropic, CO-STAR o compacto, decide si agregar razonamiento paso a paso y lo evalúa de 0 a 100 (claridad, contexto, restricciones).
- Memoria en `localStorage` (`asesor.v3`): historial, favoritos, plantillas, preferencias y perfil. Los favoritos con la respuesta que te gustó se usan como ejemplos (few-shot) en pedidos parecidos.
- Voz: dictado continuo con texto parcial en vivo, modo conversación y lectura en voz alta. Dentro de claude.ai el micrófono está bloqueado para los artifacts; la lectura en voz alta sí funciona.
- Exportar `.md` y `.json` (en claude.ai usa la capacidad `downloads`).

La app web vieja (`index.html` en esta carpeta) y la extensión (`extension/`) siguen en la versión 2; la app web que se publica es la de `web/`.

## Partes

| Carpeta | Dónde corre |
|---|---|
| `index.html` + `app.js` + `advisor.js` | Teléfono y PC (app web instalable) |
| `extension/` | Google Chrome en PC: panel lateral + pestaña dentro del chat |

`advisor.js` es la lógica; `app.js` la interfaz. Después de cambiarlos corre `node build.mjs` para copiarlos a la extensión y rehacer el `.zip`.

## Instalar la extensión (PC)

1. Google Chrome → `chrome://extensions`.
2. Activa «Modo de desarrollador» (Developer mode).
3. «Cargar descomprimida» (Load unpacked) → elige la carpeta `asesor-ia/extension`.
4. Fija el ícono (rompecabezas → chincheta). Al tocarlo se abre la app en el panel lateral (Side panel): ahí llenas tu perfil y usas la voz.
5. En claude.ai, chatgpt.com, gemini.google.com o chat.deepseek.com aparece la pestaña «Asesor IA» a la derecha: lee lo que escribes, te pregunta lo que falta y pega el prompt mejorado.
6. Para dictar en el panel lateral, la primera vez toca «Permitir micrófono».

## Instalar en el teléfono

Abre la app web en Chrome → menú ⋮ → «Agregar a la pantalla principal» (Add to Home screen).
Para tenerla al lado de la app de IA usa pantalla dividida (Split screen) o ventana emergente (Pop-up view).

## Voz

- Usa el dictado de Chrome (Web Speech API): tu voz se envía a Google para pasarla a texto. Necesita internet.
- Si el botón Dictar no funciona (por ejemplo en la versión publicada en claude.ai), usa el micrófono del teclado (Gboard).

## Límites

- Los tokens son estimaciones (±30 %). Ninguna app de chat publica el conteo real ni el tamaño de tus límites.
- La comparación con Opus usa el precio de API (Opus 5.5 = 2× Sonnet 5.5 = 40× Haiku 5.5 por token).
- Nombres de modelos según los menús de octubre de 2026. Están en `PROVIDERS` dentro de `advisor.js`.
- La extensión busca la caja de texto de cada sitio; si el sitio cambia su diseño, haz clic en la caja y la detecta igual.
