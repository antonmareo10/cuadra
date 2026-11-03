# Estado · Cuadra (Clocked Build Challenge)

Actualizado: 3-nov-2026, 22:15. Cierre: martes 10-nov 23:59 ET = **miércoles 11-nov 05:59 en Madrid**. Objetivo interno: listo el lunes 9-nov.

## Qué funciona (verificado hoy)

- **Cliente de Clocked** (`lib/clocked/`): Idempotency-Key por petición; reintentos acotados de 429/5xx/red con la misma clave y el mismo cuerpo; `retryAsNew` corta; 4xx sin reintento; semáforo de concurrencia; cabeceras de coste por llamada; **tope duro de créditos** (`CLOCKED_CREDIT_CAP`, por defecto 6.000) comprobado antes de enviar; si una respuesta llega facturada como algo distinto de la prueba gratuita (`reference`), se paran todas las llamadas. La clave solo se lee de `process.env.CLOCKED_API_KEY` y no se imprime nunca.
- **`npm run smoke`**: una llamada mínima real a los 10 endpoints. Pasó el 3-nov (11 llamadas, 44 créditos).
- **Motor** con los 10 endpoints, cada uno cambiando el resultado (detalle en `docs/CRITERIA.md`).
- **5 casos sintéticos** con problemas plantados (`data/cases/*/truth.json`), grabados en real el 3-nov: los 5 veredictos correctos, todos los importes plantados al céntimo y nada reclamado de más.
- **`npm test`**: 28 tests (cliente, offsets Unicode, scripts en PDF, veredicto, evidencias y los 5 casos reproducidos desde las grabaciones reales). Pasan.
- **Web** (Next.js 16, `next build` OK): portada, vista de caso, `/check` para ejecuciones en vivo y subida de documentos. Sin desbordes a 390 px (medido: 0 px), modo oscuro, movimiento reducido.
- **API en vivo probada de punta a punta**: subir los PDF del caso de bebidas da el mismo veredicto (18 llamadas, 175 créditos, 24 s con concurrencia 1); un PDF que no es una factura (una receta) sale como «no legible» y retenido, nunca aprobado (2 llamadas, 6 créditos).
- **Capturas** en `docs/screenshots/` (1440 y 390 px, claro y oscuro) y **vídeo de 55 s** con subtítulos en `docs/video/cuadra-demo.mp4`. Se regeneran con `node scripts/screenshots.mjs` y `node scripts/record-video.mjs` con el servidor arrancado.
- **Gasto**: `npm run credits` → 3.008 créditos en total, todos con base `reference` (la prueba no cobra nada).

## Qué falta

1. Subir el repo a GitHub y desplegar la demo (decisión de Antón; abajo).
2. Rellenar los TODO de `docs/SUBMISSION.md` (URL de demo, repo, email, usuario de GitHub).
3. Opcional si queda tiempo: leer albaranes escaneados (Clocked lee imágenes, pero sin posiciones de caracteres); hoy se marcan como no legibles.

## Lo que tiene que hacer Antón (en orden)

1. **Canjear el código** `CLOCKEDHACKATHON` en clocked.rezolve.ai/account si no lo ha hecho (de 4.000 a 20.000 créditos y de 1 a 4 peticiones a la vez). Llevamos 3.008 gastados: sin canjear quedarían unos 990. Después, `CLOCKED_CONCURRENCY=4` en `.env.local`.
2. **Revisar los textos** de `docs/SUBMISSION.md` (primera persona). Sobre todo la frase de su experiencia: «I have spent the last year building software that reads restaurant delivery notes». Si no es exacta, la cambio.
3. **Crear el repo público** en GitHub (nombre sugerido `cuadra`) y decirme «súbelo». Yo hago `git remote add` y `git push`. Comprobado: `.env.local` está ignorado desde el primer commit y nunca entró en el historial.
4. **Desplegar** (recomendado Vercel, gratis): importar el repo en vercel.com, sin variables de entorno. Así la demo funciona con las grabaciones y las ejecuciones en vivo quedan apagadas (no gasta créditos). Si quiere en vivo en público: `CLOCKED_API_KEY`, `LIVE_RUNS=1` y un tope bajo, por ejemplo `CLOCKED_CREDIT_CAP=1500`.
5. **Vídeo**: subir `docs/video/cuadra-demo.mp4` a YouTube (oculto vale) y pegar el enlace en el formulario y en el post.
6. **Formulario** en clocked.rezolve.ai/challenge desde su cuenta de Clocked: pegar los textos de `docs/SUBMISSION.md`, marcar Best Overall, los tres premios de grupo y People's Choice, y pulsar **Submit** antes del lunes 9-nov.
7. **People's Choice** (opcional): publicar el post de LinkedIn del borrador mencionando @Clocked (elegido de las sugerencias, no pegando la URL) y con `#ClockedChallenge`; pegar la URL del post en el formulario antes del cierre.
