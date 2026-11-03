# Estado · Cuadra (Clocked Build Challenge)

Actualizado: 3-nov-2026 (noche). Cierre: martes 10-nov 23:59 ET = **miércoles 11-nov 05:59 en Madrid**. Objetivo interno: listo el lunes 9-nov.

## Qué funciona (verificado hoy)

- **Cliente de Clocked** (`lib/clocked/`): Idempotency-Key por petición; reintentos acotados de 429/5xx/red con la misma clave y el mismo cuerpo; `retryAsNew` corta; 4xx sin reintento; semáforo de concurrencia; cabeceras de coste por llamada; **tope duro de créditos** (`CLOCKED_CREDIT_CAP`, por defecto 6.000) comprobado antes de enviar; si una respuesta llega facturada como algo distinto de la prueba gratuita (`reference`), se paran todas las llamadas. La clave solo se lee de `process.env.CLOCKED_API_KEY` y no se imprime nunca.
- **`npm run smoke`**: una llamada mínima real a los 10 endpoints. Pasó el 3-nov (11 llamadas, 44 créditos).
- **Motor** con los 10 endpoints, cada uno cambiando el resultado (detalle en `docs/CRITERIA.md`).
- **5 casos sintéticos** con problemas plantados (`data/cases/*/truth.json`), grabados en real el 3-nov: los 5 veredictos correctos y todos los importes plantados al céntimo; nada reclamado de más.
- **`npm test`**: 28 tests (cliente, offsets Unicode, scripts en PDF, veredicto, evidencias y los 5 casos reproducidos desde las grabaciones reales). Pasan.
- **Web** (Next.js 16, build de producción OK): portada, vista de caso (veredicto, incidencias con evidencias enlazadas al texto del documento, tabla de líneas, documentos con marcas y copia sin datos personales, seguridad, registro y correo verificados, tabla de llamadas), `/check` para ejecuciones en vivo y subida de documentos propios (NDJSON en streaming). Responsive, modo oscuro, movimiento reducido.
- **Gasto**: `npm run credits` → 2.826 créditos en total el 3-nov, todos con base `reference` (la prueba no cobra nada).

## Qué falta (lo hago yo en la próxima sesión, salvo lo marcado)

1. Revisión visual final con capturas a 1440 y 390 px (`node scripts/screenshots.mjs`) y vídeo de demo (`node scripts/record-video.mjs`, sale `docs/video/cuadra-demo.mp4`). Los scripts están; falta ejecutarlos con el servidor arrancado y revisar el resultado.
2. Probar una ejecución en vivo por la API (`node scripts/live-check.mjs` y `--offdomain` con un PDF que no es una factura).
3. Despliegue público (lo decide Antón): la demo funciona como sitio estático + rutas Node; en Vercel bastaría con importar el repo. Sin `LIVE_RUNS=1` las ejecuciones en vivo quedan apagadas, así que no gasta créditos.
4. Rellenar los TODO de `docs/SUBMISSION.md` (URL de demo, repo, email, usuario de GitHub).

## Lo que tiene que hacer Antón (en orden)

1. **Canjear el código** `CLOCKEDHACKATHON` en clocked.rezolve.ai/account si no lo ha hecho (pasa de 4.000 a 20.000 créditos y de 1 a 4 peticiones simultáneas). Llevamos 2.826 créditos gastados: si no está canjeado, quedan unos 1.170. Después puede poner `CLOCKED_CONCURRENCY=4` en `.env.local`.
2. **Revisar el texto en primera persona** de `docs/SUBMISSION.md` (sobre todo la frase de su experiencia con albaranes) y decir si lo cambio.
3. **Crear el repo público** en GitHub (nombre sugerido `cuadra`) y darme la orden de subirlo. Comprobado: `.env.local` está en `.gitignore` desde el primer commit y no hay claves en el historial.
4. **Decidir el despliegue** de la demo (Vercel u otro). Yo dejo el comando listo; él pulsa o pega.
5. **Vídeo**: subir `docs/video/cuadra-demo.mp4` a YouTube (oculto o público) cuando esté; el formulario acepta enlace a la app o vídeo, y People's Choice necesita vídeo o demo en el post.
6. **Formulario** en clocked.rezolve.ai/challenge desde su cuenta de Clocked: pegar los textos de `docs/SUBMISSION.md`, marcar Best Overall + los tres premios de grupo + People's Choice, añadir el enlace del post de LinkedIn, y **Submit** antes del lunes 9-nov.
7. **People's Choice** (opcional): publicar el post de LinkedIn del borrador, mencionando @Clocked eligiéndolo de las sugerencias y con `#ClockedChallenge`; pegar la URL del post en el formulario antes del cierre.
