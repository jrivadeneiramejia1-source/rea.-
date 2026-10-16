# Asesor IA

Te dice, antes de enviar un pedido a Claude, ChatGPT, Gemini o DeepSeek:

- tokens aproximados (tu mensaje + historial que se reenvía + respuesta),
- qué modelo y qué nivel de pensamiento usar (Simple → Normal → Compleja → Experta),
- qué le falta a tu prompt, y te da una versión mejorada lista para copiar.

Todo corre en tu dispositivo. No usa API ni gasta tokens.

## Partes

| Carpeta | Dónde corre |
|---|---|
| `index.html` + `advisor.js` | Teléfono y PC (app web instalable) |
| `extension/` | Chrome, Edge o Firefox en PC: panel al lado del chat |

`advisor.js` es la lógica compartida. Si la cambias, cópiala también a `extension/advisor.js`.

## Instalar la extensión (PC)

1. Chrome o Edge → `chrome://extensions` (Edge: `edge://extensions`).
2. Activa «Modo de desarrollador» (Developer mode).
3. «Cargar descomprimida» (Load unpacked) → elige la carpeta `asesor-ia/extension`.
4. Abre claude.ai, chatgpt.com, gemini.google.com o chat.deepseek.com: aparece la pestaña «Asesor IA» a la derecha.

## Instalar en el teléfono

Abre la app web en Chrome → menú ⋮ → «Agregar a la pantalla principal» (Add to Home screen).
Para tenerla al lado de la app de IA usa pantalla dividida (Split screen) o ventana emergente (Pop-up view).

## Límites

- Los tokens son estimaciones (±30 %). Ninguna app de chat publica el conteo real ni el tamaño de tus límites.
- La comparación con Opus usa el precio de API (Opus 5.5 = 2× Sonnet 5.5 = 40× Haiku 5.5 por token).
- Nombres de modelos según los menús de octubre de 2026. Están en `PROVIDERS` dentro de `advisor.js`.
- La extensión busca la caja de texto de cada sitio; si el sitio cambia su diseño, haz clic en la caja y la detecta igual.
