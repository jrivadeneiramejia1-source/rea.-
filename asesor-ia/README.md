# Asesor IA

Te dice, antes de enviar un pedido a Claude, ChatGPT, Gemini o DeepSeek:

- tokens aproximados (tu mensaje + historial que se reenvía + respuesta),
- qué modelo y qué nivel de pensamiento usar (Simple → Normal → Compleja → Experta),
- qué le falta a tu prompt, te hace preguntas según lo que escribes y te da una versión mejorada lista para copiar,
- tu perfil (rol, equipo, metas, gustos) para que cada prompt lleve tu contexto,
- aprende de ti: recuerda datos (ej. tu versión de n8n) para no volver a preguntarlos y te da consejos según cómo pides las cosas,
- voz: dictado y modo conversación (te lee la recomendación y te hace las preguntas).

Todo corre en tu dispositivo. No usa API ni gasta tokens.

**Con tu equipo:** publicado junto a [Lanzador · Equipos](../equipos/README.md) queda en `/asesor/` con el botón «Enviar a un compañero» (le llega una notificación) y abre los prompts que te envían por el chat. Dentro de claude.ai ese botón no aparece.

## Versión 3 (artifact)

`artifact/asesor-ia.html` es la versión actual publicada en claude.ai. Es un solo archivo: Tailwind 3.4.17 va compilado adentro y React 18, htm y lucide-react se cargan con respaldo (cdnjs → jsdelivr → unpkg; los íconos son opcionales). Si cambias clases de Tailwind, corre `node build.mjs` en `artifact/` (requiere `npm i -D tailwindcss@3.4.17`).

- Motor local (`<script id="engine">`): detecta el tipo de tarea, hace de 1 a 3 preguntas (modo entrevista), arma el prompt en XML de Anthropic, CO-STAR o compacto, decide si agregar razonamiento paso a paso y lo evalúa de 0 a 100 (claridad, contexto, restricciones).
- Memoria en `localStorage` (`asesor.v3`): historial, favoritos, plantillas, preferencias y perfil. Los favoritos con la respuesta que te gustó se usan como ejemplos (few-shot) en pedidos parecidos.
- Voz: dictado continuo con texto parcial en vivo, modo conversación y lectura en voz alta. Dentro de claude.ai el micrófono está bloqueado para los artifacts; la lectura en voz alta sí funciona.
- Exportar `.md` y `.json` (en claude.ai usa la capacidad `downloads`).

La app web (`index.html`) y la extensión (`extension/`) siguen en la versión 2.

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
