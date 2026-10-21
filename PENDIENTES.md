# Avance de la mejora de las apps (para continuar en otro chat)

Pedido de Jeiler (16-oct-2026): mejorar las apps una por una, sin errores, con repos y skills de referencia
(sus skills: `ui-ux-pro-max-skill`, `taste-skill`, `agent-skills-jeiler`), autoverificando todo.

Rama de trabajo en los tres repositorios: `ccr-72c56d0d-kjvseq`. No hay PR abiertos: se crean solo si Jeiler lo pide.

| # | App | Repo | Estado |
|---|---|---|---|
| 1 | Equipos: la cámara no abría al escanear | `apps-consulta-previa` | Hecho (v27, commit 22e6c67). Lector dentro de la app (`lib/codigos/`), cámara al instante, sin `zoom: true` (abría un 2.º permiso en Android), errores explicados con Reintentar. `pruebas/camara.mjs`: 36 bien. |
| 2 | Entregas: a veces la hoja no se ve bien | `apps-consulta-previa` | Hecho (v27, commit 6bb8ba3). Aviso de foto borrosa u oscura con Repetir. `pruebas/escaner.mjs`: 191 bien. Suite completa: 0 fallas. |
| 3 | Mis claves: recuperar la clave maestra por correo o número | `mis-claves` | En curso. Diseño abajo. |
| 4 | Asesor IA: revisar y agregar lo pertinente | `rea.-/asesor-ia` | Pendiente. |
| 5 | Lanzador · Equipos: mejor interfaz, pedir script diciendo para qué, chat interactivo (preguntar cómo usar un script) | `rea.-/equipos` | Pendiente. |

## Diseño de la recuperación de Mis claves (sin romper el cifrado)

- Hoy: usuario + clave maestra; de la maestra salen `acceso` (contraseña de Firebase) y `kek`; `bovedas/{uid}.env` = llave de datos (dek) cifrada con `kek`.
- **Código de recuperación** (128 bits o más, en grupos de letras): se genera en el teléfono. De él salen, con HKDF, un id de documento y una llave.
  `recuperacion/{id}` = { uid, usuario, `acc`: acceso cifrado, `llave`: dek cifrada } (todo cifrado con la llave del código).
  Reglas: `get` sin sesión (el id no se puede adivinar), sin `list`; crear, cambiar y borrar solo el dueño.
- El código se guarda cifrado con la dek en `bovedas/{uid}.rec`, para que la app pueda rehacer `recuperacion/` cuando cambia la clave maestra.
- **Correo o número**: el código se manda a uno mismo con `mailto:`, WhatsApp (`wa.me/<número>`) o SMS (`sms:`), o se copia o descarga. No hace falta servidor ni SMS de Firebase (en el plan gratis Spark no hay SMS).
- Recuperar: «¿Olvidaste tu clave maestra?» → usuario + código → se abre `recuperacion/{id}` → entra con `acceso` → nueva clave maestra (`cambiarAcceso` + nuevo `env`) → se rehace `recuperacion/`.
- Riesgo que hay que explicar en la app: quien tenga ese correo o WhatsApp y sepa el usuario puede entrar. Es opcional y se puede desactivar.
- Pruebas: `npm run pruebas` (emulador de Auth) y `npm run reglas-firestore`; agregar los casos de recuperación.

## Lo que dejó la investigación (para los puntos 4 y 5)

- Chat: tarjeta de pedido con «para qué lo necesitas», estado (abierto, resuelto) y 1 a 3 botones. Responder citando un mensaje. Hilo por script («¿cómo lo uso?»). Reacciones simples. Animaciones de 150 a 250 ms que se apagan con «reducir movimiento».
- Skills: solo animar transform y opacity, táctil de 44 px como mínimo, errores con causa, arreglo y Reintentar, sin emojis como iconos, etiquetas visibles.
