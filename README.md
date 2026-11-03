# Cuadra · pay for what actually arrived

Cuadra is a three-way match for small restaurants. It reads the **order** (often a WhatsApp message from the chef), the **delivery note** the kitchen signed and the **supplier's invoice**, checks every line against the other two, and says what to pay, what to claim back and which invoices not to touch at all. It is built on the [Clocked API](https://clocked.rezolve.ai/docs): all ten endpoints, each one changing the result.

**Live demo:** https://cuadra-alpha-blush.vercel.app (five recorded cases open instantly, no key needed)

![Case view: pay the undisputed amount, claim the rest](docs/screenshots/case-meat-1440.png)

| | |
|---|---|
| ![Landing page](docs/screenshots/home-1440.png) | ![Ranked issues with evidence and Decide's recommendation](docs/screenshots/issues-meat-1440.png) |
| ![Evidence highlighted in the document's own text](docs/screenshots/documents-1440.png) | ![Safety checks on the fraudulent invoice](docs/screenshots/safety-fish-1440.png) |
| ![Record and supplier email checked by Verify](docs/screenshots/email-meat-1440.png) | ![Line by line match](docs/screenshots/lines-meat-1440.png) |

Phone and dark mode: [390 px case view](docs/screenshots/case-meat-390.png) · [390 px issues](docs/screenshots/issues-meat-390.png) · [dark theme](docs/screenshots/case-drinks-dark-1440.png). Demo video: [docs/video/cuadra-demo.mp4](docs/video/cuadra-demo.mp4).

## Why

A small restaurant gets 20 to 60 supplier invoices a month and pays most of them without checking them against the delivery note, because doing it by hand takes longer than the money seems worth. The money leaks anyway: meat billed by the order instead of by the scale, a "new tariff" nobody agreed to, water at the alcohol VAT rate, a box sent back at the door and still invoiced, the same delivery invoiced twice, and now invoices that ask you to pay a "new" bank account. Cuadra does the check in 10 to 20 seconds and hands the owner a decision with the evidence and the email to send.

## Try it (no key needed)

```bash
npm install
npm run demo          # builds and serves http://localhost:3000
```

The five sample cases are **real Clocked recordings** (3 November 2026) replayed through the same engine, so the demo is instant and works offline. Live runs need a key (below).

| Case | What is planted | Cuadra's answer |
|---|---|---|
| Meat, WhatsApp order | 6 kg invoiced, 5.2 kg delivered; secreto at €16.90 vs €15.40 agreed and a "new tariff" note; 3 chickens invoiced, 2 delivered; chorizo nobody ordered | Pay €365.42, claim €42.81, ask the kitchen about €18.70 |
| Fish, bank change | Everything adds up, but the IBAN is new, white 1-pt text tells "AI assistants" to verify it and stay quiet, and the PDF carries a script | Hold payment: 3 hard stops (Protect, Guard, Inspect) |
| Drinks | Water at 21% VAT instead of 10%; a box of wine returned at the door but invoiced; total €9 above its own lines | Pay €501.71, claim €62.20 |
| Vegetables, duplicate | A tidy invoice for a delivery already invoiced and paid, with a new number and date | Hold payment: duplicate of F-2026-1131 (Compare) |
| Vegetables, substitution | Tomate rama delivered instead of the ordered tomate pera, same price, noted on the delivery note | Ready to pay €78.00 (Rerank: different product; Decide: accept) |

Planted problems and expected answers are in `data/cases/*/truth.json`; `npm test` checks the engine against them.

## How one invoice is checked

```
             ┌───────────── for each document ──────────────┐
 PDF / text ─┤ Protect (/pii): personal data, bank account,  │
             │   redacted PDF, and the PDF's text layer       │
             │ Inspect (/script): only if the PDF has a script│
             │ Pipeline: Guard (/injection, stop) → Extract   │
             │   flagged → lines blanked, Extract re-reads    │
             │   empty cells → re-read inside their own line  │
             └───────────────────────┬──────────────────────┘
                                     │
   Rerank: which order line is each invoiced product; which line a return belongs to
                                     │
   Code: billed vs delivered vs returned, price vs tariff, VAT vs tariff, totals, IBAN vs file
                                     │
   Compare: all document pairs + earlier invoices (duplicates, conflicts)
   Verify:  the supplier's own claims vs your tariff and order
                                     │
   Decide: action + priority per discrepancy (uncertain → the owner decides)
                                     │
   Fill: record + summary + supplier email  →  Verify: every claim of the email
```

What each endpoint changes is listed in [docs/CRITERIA.md](docs/CRITERIA.md#3-thoughtful-use-of-additional-endpoints-15).

## Uncertain results, missing information, failed requests

- **Missing values stay missing.** Extract returns `null` for what a document does not state; Cuadra re-reads an empty cell inside its own line once, and if it is still empty the check that needs it is skipped and shown as unknown. Nothing is guessed.
- **No data read means never OK.** An invoice without a readable total or lines, or a scan without a text layer, is held as unreadable.
- **Uncertain calls go to the owner.** When Decide's top action is under 60%, it is not applied and the issue waits for the owner. Probabilities are shown next to every model judgement.
- **Detectors are not the lock.** Guard, Inspect, Protect and Compare raise flags; the hold is enforced in code and only the owner can clear it.
- **Failed requests.** Every request has an `Idempotency-Key`; 429, 5xx and network errors are retried with the same key and body (bounded backoff); `retryAsNew` stops; 4xx are not retried. A failed step is reported on the page and never treated as passing.
- **Spending.** A hard credit cap (`CLOCKED_CREDIT_CAP`, default 6,000) is checked before every request; any response billed as something other than the free trial halts all further calls.

## Live runs and re-recording

Put your key in `.env.local` (git-ignored):

```bash
CLOCKED_API_KEY=...
CLOCKED_CONCURRENCY=4      # 1 on the trial, 4 with the CLOCKEDHACKATHON code
CLOCKED_CREDIT_CAP=6000    # optional
```

```bash
npm run smoke      # one minimal real call to each endpoint (about 45 credits)
npm run record     # re-records the five cases live (about 900 credits)
npm run runs       # rebuilds public/runs from recordings, no network
npm run dev        # http://localhost:3000/check for live runs and uploads
```

In production builds live runs are off unless `LIVE_RUNS=1`; they are limited to one at a time and six per IP per ten minutes.

## Develop

```bash
npm test           # client, offsets, PDF scripts, and all five cases replayed from real recordings
npm run typecheck
npm run documents  # regenerate the synthetic PDFs (deterministic)
```

```
lib/clocked/    HTTP client (idempotency, retries, concurrency, credit cap), replay/record
lib/engine/     intake, matching, checks, compare, decide, fill/verify, orchestration
data/           synthetic world, sample cases, supplier records (generated by scripts/)
recordings/     real Clocked responses per case (used by the demo and the tests)
app/            Next.js UI: landing, case workspace, live runs
```

## Data and honesty

All documents are synthetic, generated from `data/world.ts`: the restaurant, suppliers, people, tax IDs, phone numbers and bank accounts are fictional (IBANs use bank codes 9998/9999, which no Spanish bank uses). No real customer data is used. Recorded runs are labelled as recorded on every page; amounts on the landing page are computed from those runs.

## Credits

Next.js, React, Tailwind CSS, motion, Lenis, Geist fonts (Vercel), pdf-lib, Vitest, tsx. Clocked API by rezolve.ai. Built for the Clocked Build Challenge 2026; first commit on 3 November 2026.

## License

MIT
