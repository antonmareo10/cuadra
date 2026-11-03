# Estado · Cuadra (Clocked Build Challenge)

Actualizado: 3-nov-2026. Cierre: martes 10-nov 23:59 ET = miércoles 11-nov 05:59 en Madrid. Objetivo interno: listo el lunes 9-nov.

## Qué funciona (verificado)

- Cliente de Clocked propio (`lib/clocked/`): Idempotency-Key por petición, reintentos acotados de 429/5xx/red con la misma clave, `retryAsNew`, 4xx sin reintento, concurrencia limitada, cabeceras de coste por llamada y **tope duro de créditos** (`CLOCKED_CREDIT_CAP`, por defecto 6.000) que corta antes de enviar. Si una respuesta llega facturada como algo distinto de la prueba gratuita (`reference`), se paran todas las llamadas.
- `npm run smoke`: una llamada mínima real a los 10 endpoints. Pasó el 3-nov: 11 llamadas, 44 créditos.
- Motor completo con los 10 endpoints (Protect, Inspect, Pipeline Guard→Extract, Rerank, comprobaciones en código, Compare, Verify ×2, Decide, Fill).
- 5 casos sintéticos con problemas plantados (`data/cases/*/truth.json`), grabados en real el 3-nov: los 5 veredictos correctos y todos los importes plantados al céntimo.
- `npm test`: 23 tests (cliente, offsets Unicode, scripts en PDF y los 5 casos reproducidos desde las grabaciones reales). Pasan.
- Web Next.js: portada, vista de caso (veredicto, incidencias con evidencias enlazadas al texto del documento, tabla de líneas, documentos con marcas, seguridad, registro y correo verificados, tabla de llamadas) y `/check` para ejecuciones en vivo y subida de documentos propios.
- Gasto total hasta ahora en la cuenta de Antón: ver `npm run credits` (unos 2.000 créditos el 3-nov; la prueba gratuita no cobra nada).

## Qué falta

(se completa al final de la sesión)

## Lo que tiene que hacer Antón

(se completa al final de la sesión)
