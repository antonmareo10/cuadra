# Judging criteria → what Cuadra does

Official weights (Best Overall App, see [RULES.md](RULES.md)): usefulness 25 · core Clocked integration 30 · additional endpoints 15 · implementation and UX 20 · explanation and reproducibility 10. "Meaningful use" means the endpoint's output changes what the app does or shows; unnecessary calls earn nothing. Every claim below points to code or to a recorded run you can open.

## 1. Practical usefulness (25)

- **A concrete user and a concrete pain.** A small restaurant receives 20–60 supplier invoices a month. Each one should be checked against what the chef ordered (often a WhatsApp message) and what the kitchen signed for (the delivery note). In practice nobody does it line by line, so short weights, unagreed price rises, wrong VAT, returned boxes, duplicates and bank-detail fraud get paid.
- **The output is a decision, not a report:** "Pay €365.42 now, claim €42.81, ask the kitchen about €18.70", or "Hold payment". It comes with the email to send to the supplier, already checked.
- **Measured on the five sample cases** (synthetic, with planted problems documented in `data/cases/*/truth.json`): all five verdicts right, every planted issue found with the exact amount, nothing claimed that was not planted. `tests/cases.test.ts` asserts this on the recorded Clocked responses.
- **Money it protects in the samples:** €105.01 to claim back across two invoices, plus two invoices held (a bank-change fraud attempt and an invoice already paid).
- **Human in the loop:** every action can be changed and the amount to pay recomputes; hard stops can only be cleared by the owner.

## 2. Quality of the core Clocked integration (30)

The core is **Extract → Rerank → (code) → Decide/Fill**, with safety in front and verification behind. What makes it integration rather than a wrapper:

| Practice | Where |
|---|---|
| PDFs sent as `pdf` with `return_text: true`; every offset indexes the returned text layer; offsets are treated as Unicode code points (the WhatsApp order has an emoji) | `lib/engine/intake.ts`, `lib/engine/text.ts`, `tests/money-text.test.ts` |
| Extract **lists of records** with `row_anchor` (product code), column descriptions keyed to the printed headers, `format: "number"`, `normalize` money with decimal comma | `lib/engine/requests.ts` |
| **Nulls stay null.** A cell a records read leaves empty is re-read on its own line span and shifted back; if the line does not state it, it stays unknown and no check uses it | `repairLines` in `lib/engine/intake.ts` |
| Values are verbatim spans; the **arithmetic is code**, never the model (Extract "is not a calculator") | `lib/engine/checks.ts` |
| Every number in the UI links back to its span in the document text: each quote says which line it is on ("Invoice, line 13"), and clicking it opens the numbered document view at that line. Line numbers count code points, like Clocked offsets | `lib/ui/lines.ts`, `app/components/workspace/*`, `tests/proof-lines.test.ts` |
| Probabilities are used as policy: Decide confidence < 0.6 is **not applied** and goes to the owner | `lib/engine/judge.ts` |
| Idempotency-Key per logical request, retries reuse it with the identical body; bounded backoff on 429/5xx/network; `retryAsNew` stops; 4xx not retried | `lib/clocked/client.ts`, `tests/client.test.ts` |
| Cost headers read on every call (`X-Clocked-Credits`, model ms, cost basis) and shown per call; a **hard credit cap** refuses requests before sending; any billing basis other than the free trial halts all calls | `lib/clocked/budget.ts` |
| Concurrency limited to the account's allowance (trial 1, hackathon code 4) with a semaphore | `lib/clocked/client.ts` |
| Failures are explicit: a failed step is listed, the invoice is never approved on missing data ("no data read = never OK") | `lib/engine/run.ts`, `computeVerdict` |

## 3. Thoughtful use of additional endpoints (15)

All ten endpoints are used, each because it changes the outcome:

| Endpoint | What its output changes |
|---|---|
| **Pipeline** | One request per document: Guard with `stop: true`, then Extract. A flagged document is never read as-is. |
| **Guard** (`/injection`, `source: "content"`, custom AP policy) | Flags the white, 1-point text in the fraud invoice that tells "AI assistants" to verify a new IBAN and hide the note → hard stop, and the flagged lines are blanked (offsets preserved) before Extract re-reads the document. |
| **Protect** (`/pii`) | Finds the invoice's bank account → compared in code with the IBAN on file → hard stop when it differs. Also gives the share-safe text and a **redacted PDF** (`return_pdf: "redact"`) for sending the pack outside the restaurant. |
| **Inspect** (`/script`) | Only called when the PDF contains JavaScript (found in code with pdf-lib, never executed). The fraud invoice's script is judged malicious (data exfiltration) → hard stop. |
| **Extract** | Header values and every line of all three documents, plus returns written in the delivery remarks. |
| **Rerank** | Which order line each invoiced product is (orders have no supplier codes), and which invoice line a returned product belongs to. `skip` / different product → "not on the order", with the closest line linked as a possible substitution. |
| **Compare** | One request over the order, delivery note, invoice and earlier invoices: "same" against an already-paid invoice → duplicate hard stop; conflicts attach as evidence to the matching issue. |
| **Verify** (`/grounding`) | (a) The supplier's own note ("prices updated per the tariff communicated on 15/10") against the agreed tariff and order → "not stated", attached to the price issue. (b) Every claim of the generated email against the documents before the owner can copy it. |
| **Decide** | One request, documents mode: one document per discrepancy, two questions each (action, priority). Ranks the queue and sets the default action; it accepted the documented tomato substitution and sent the unordered chorizo to the kitchen. |
| **Fill** | The reconciliation record: status, credit note yes/no, bookkeeping category, a summary for the owner and the supplier email (generated fields, marked as generated). |

Group awards (one project wins at most one judged award): Decide/Extract/Fill 3/3, Protect/Guard/Inspect 3/3, Verify/Compare/Rerank 3/3.

## 4. Implementation and user experience (20)

- First screen answers the question a restaurant owner has: pay, claim or hold, and how much.
- Instant: recorded runs replay through the same engine, no network wait. A "Replay the calls" button re-animates the run honestly labelled as a replay.
- Evidence everywhere: issue → quote → highlighted span in the document's own text layer; Rerank, Decide, Guard and Compare probabilities shown as bars.
- Interactive resolution: change an action and the amount to pay recalculates (same `computeVerdict` as the server).
- States designed: hard stop, money, needs-a-look, accepted, unreadable document, failed step, live-runs-disabled, upload validation errors.
- Responsive to 390 px with no sideways scroll on any page, dark mode, reduced motion respected (Lenis and motion off), visible focus, 44 px touch targets, scrollable tables reachable by keyboard, AA contrast (axe-core reports no contrast or ARIA violations on any page).
- The landing page shows the product first: two findings from the recordings, each on its exact source line, built from `public/runs/` at build time (`lib/ui/proof.ts`).
- Live mode streams the run call by call (NDJSON) with guardrails for a public deployment.

## 5. Clear explanation and reproducibility (10)

- `npm install && npm run demo` runs the full demo with no key (recorded runs).
- `npm test` replays the real recordings through the engine and checks the planted truth.
- `npm run smoke` makes one minimal real call to every endpoint; `npm run record` re-records the cases live (credit cap on).
- Synthetic data is generated deterministically by `npm run documents`; planted discrepancies are documented per case.
- README explains how uncertain results, missing information and failed requests are handled, as the rules ask.
