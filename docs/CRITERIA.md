# Judging criteria → what Cuadra does

Official weights (Best Overall App, see [RULES.md](RULES.md)): usefulness 25 · core Clocked integration 30 · additional endpoints 15 · implementation and UX 20 · explanation and reproducibility 10. "Meaningful use" means the endpoint's output changes what the app does or shows; unnecessary calls earn nothing. Every claim below points to code or to a recorded run you can open.

## 1. Practical usefulness (25)

- A concrete user and a concrete pain. A small restaurant receives 20 to 60 supplier invoices a month. Each one should be checked against what the chef ordered (often a WhatsApp message) and what the kitchen signed for (the delivery note, usually on paper). In practice nobody does it line by line, so short weights, unagreed price rises, wrong VAT, returned boxes, duplicates and bank-detail fraud get paid.
- The output is a decision, not a report: "Pay €365.42 now, claim €42.81, ask the kitchen about €18.70", or "Hold payment". It comes with the email to send to the supplier, already checked.
- Paper is fine (v2). A delivery note can be a phone photo or a scanned PDF: Guard and Extract read it in image mode, the handwritten weights included. In the recorded photo case Extract read the corrected 5,2 kg and 2 chickens, so the claims come out to the cent. A photo has no character positions, so nothing that depends on it is paid until the owner has looked at it (`computeVerdict`, `tests/photo.test.ts`). Invoices are still accepted only with a text layer.
- Measured on the six sample cases (synthetic, with planted problems in `data/cases/*/truth.json`): all six verdicts right, every planted issue found with the exact amount, nothing claimed that was not planted. `tests/cases.test.ts` asserts this on the recorded Clocked responses.
- Human in the loop: every action can be changed and the amount to pay recomputes; hard stops and the photo check can only be cleared by the owner.
- From an AI assistant (v2): the MCP server gives Claude Desktop or any MCP client the same decision, findings and holds (`mcp/`, `/assistants`).

## 2. Quality of the core Clocked integration (30)

The core is Extract → Rerank → (code) → Decide/Fill, with safety in front and verification behind.

| Practice | Where |
|---|---|
| PDFs sent as `pdf` with `return_text: true`; every offset indexes the returned text layer; offsets are treated as Unicode code points (the WhatsApp order has an emoji) | `lib/engine/intake.ts`, `lib/engine/text.ts`, `tests/money-text.test.ts` |
| Extract lists of records with `row_anchor` (product code), column descriptions keyed to the printed headers, `format: "number"`, `normalize` money with decimal comma | `lib/engine/requests.ts` |
| Image mode for photos and scans (v2): `images` as data URLs, or `pdf` with `pdf_mode: "image"` and at most 4 pages. Image requests take no nested records, so each table row comes back as one string with its columns split by " \| " and parsed in code; a row that does not split is reported, not guessed | `imageSource`, `photoExtractRequest` in `lib/engine/requests.ts`, `applyPhotoExtraction` in `lib/engine/intake.ts` |
| Nulls stay null. A cell a records read leaves empty is re-read on its own line span and shifted back; if the line does not state it, it stays unknown and no check uses it | `repairLines` in `lib/engine/intake.ts` |
| Values are verbatim spans; the arithmetic is code, never the model | `lib/engine/checks.ts` |
| Every finding points to its line, now on the document itself (v2): the span's offsets give the line of the text layer, and `scripts/assets/pdf_pages.py` maps each line of Clocked's text to its box on the page picture, so a click outlines and zooms to that line on the page. Line numbers count code points, like Clocked offsets | `lib/ui/lines.ts`, `lib/ui/paper.ts`, `app/components/paper/PagePicture.tsx`, `tests/paper.test.ts`, `tests/proof-lines.test.ts` |
| Probabilities are used as policy: Decide confidence < 0.6 is not applied and goes to the owner | `lib/engine/judge.ts` |
| Idempotency-Key per logical request, retries reuse it with the identical body; bounded backoff on 429/5xx/network; `retryAsNew` stops; 4xx not retried | `lib/clocked/client.ts`, `tests/client.test.ts` |
| Cost headers read on every call and shown per call; a hard credit cap refuses requests before sending; any billing basis other than the free trial halts all calls. The MCP server uses the same cap | `lib/clocked/budget.ts`, `mcp/runtime.ts` |
| Failures are explicit: a failed step is listed, the invoice is never approved on missing data | `lib/engine/run.ts`, `computeVerdict` |

## 3. Thoughtful use of additional endpoints (15)

All ten endpoints are used, each because it changes the outcome:

| Endpoint | What its output changes |
|---|---|
| Pipeline | One request per text document: Guard with `stop: true`, then Extract. A flagged document is never read as is. |
| Guard (`/injection`) | Flags the white, 1-point text in the fraud invoice that tells "AI assistants" to verify a new IBAN and hide the note → hard stop, and the flagged lines are blanked (offsets kept) before Extract re-reads it. On a photo, Guard reads the pixels first; if it fires the photo is not read at all. |
| Protect (`/pii`) | Finds the invoice's bank account → compared in code with the IBAN on file → hard stop when it differs. Also the share-safe text and a redacted PDF. Not called on photos: it can find personal data in an image but cannot blank it out. |
| Inspect (`/script`) | Only called when the PDF contains JavaScript (found with pdf-lib, never run). The fraud invoice's script is judged malicious → hard stop. |
| Extract | Header values and every line of the documents, plus returns written in the remarks; in image mode, also the quantities corrected by hand ("code \| printed \| handwritten"), shown to the owner next to the photo. |
| Rerank | Which order line each invoiced product is (orders have no supplier codes), and which invoice line a returned product belongs to. A different product → "not on the order", with the closest line linked. |
| Compare | One request over the order, delivery note, invoice and earlier invoices: "same" against an already-paid invoice → duplicate hard stop; conflicts attach as evidence. Text only, so a photo is left out of it. |
| Verify (`/grounding`) | (a) The supplier's own note ("prices updated per the tariff communicated on 15/10") against the agreed tariff and order → "not stated", attached to the price issue. (b) Every claim of the generated email before the owner can copy it. |
| Decide | One request: one document per discrepancy, two questions each (action, priority). Ranks the queue and sets the default action. The photo check is never sent: whether the owner looked is not a model's call. |
| Fill | The reconciliation record: status, credit note yes/no, bookkeeping category, a summary for the owner and the supplier email. |

Group awards (one project wins at most one judged award): Decide/Extract/Fill 3/3, Protect/Guard/Inspect 3/3, Verify/Compare/Rerank 3/3.

## 4. Implementation and user experience (20)

- The landing page tells the Monday-morning story with the demo's own documents (v2): the chef's chat, the signed delivery note and the invoice in a pile, the two lines that disagree marked on the paper, then one decision. All drawn from the synthetic data and the recordings at build time.
- Documents as they arrived (v2): each case shows the document picture next to the text Clocked read; clicking a quote outlines and zooms to the line on the page. The fish invoice shows where the invisible white text sits.
- Instant: recorded runs replay through the same engine, no network wait, labelled as recorded on every page.
- Interactive resolution: change an action, or tap "I checked the photo", and the amount to pay recalculates (same `computeVerdict` as the server).
- States designed: hard stop, money, needs a look, photo waiting for a look, accepted, unreadable document, failed step, live runs disabled, upload errors.
- Responsive to 390 px with no sideways scroll, dark mode, reduced motion respected, visible focus, AA contrast; axe-core results for every page at 1440 and 390 px, light and dark, in `docs/screenshots/v2/axe.json` (`scripts/axe-audit.mjs`).
- One logo source (`lib/ui/brand.ts`) for the header, favicon, app icons and social image.

## 5. Clear explanation and reproducibility (10)

- `npm install && npm run demo` runs the full demo with no key (recorded runs).
- `npm test` replays the real recordings through the engine and checks the planted truth (and the MCP server over stdio).
- `npm run mcp:demo` runs a real MCP client session against the server in replay mode.
- `npm run smoke` makes one minimal real call to every endpoint; `npm run record` re-records the cases live (credit cap on).
- Synthetic data is generated deterministically by `npm run documents`; the document pictures by `npm run assets`; planted discrepancies are documented per case.
- The README explains how uncertain results, missing information and failed requests are handled, as the rules ask.
