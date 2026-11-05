# Entry form texts, version 2 (5 Nov 2026)

Ready to paste into the fields of clocked.rezolve.ai/challenge. First person, Antón's voice, plain English. The version pasted on 4 Nov is kept in [SUBMISSION-v1.md](SUBMISSION-v1.md). Every figure below comes from the recorded runs in `public/runs/` or from `npm test`.

## Project name

Cuadra

## Overview (what it does, who it is for, what problem it solves)

Cuadra checks a small restaurant's supplier invoices before anyone pays them. You give it the chef's order (often a WhatsApp message), the delivery note the kitchen signed and the supplier's invoice. It reads all three with Clocked, checks every line against the other two and gives one answer: what to pay now, what to claim back and which invoices to hold.

It is for the owner of a small restaurant. They get dozens of supplier invoices a month and pay most of them without a line-by-line check, because the check takes longer than the money seems worth. I have spent the last year building software that reads restaurant delivery notes, so I have seen the leaks up close: meat billed by the order instead of by the scale, a price rise nobody agreed to, water billed at the alcohol VAT rate, a box sent back at the door and still invoiced, the same delivery invoiced twice. And now invoices that add up perfectly but ask to be paid into a new bank account, sometimes with text hidden for whatever AI reads them.

Two things make it different. Every finding points to the exact line it came from, for example "Invoice, line 13: 6,000 kg" against "Delivery note, line 12: 5,200 kg", so the owner can check it in seconds. And the decisions about money and fraud are made in code from Clocked's evidence, never by a model on its own: uncertain calls go to the owner, and only the owner can clear a hold.

The demo has five synthetic cases with planted problems. All five verdicts are right, every planted amount is found to the cent, and nothing else is claimed. They are real Clocked recordings from 3 November, replayed through the same engine and labelled as recorded, so the demo never waits.

## Demo

https://cuadra-alpha-blush.vercel.app

## Demo video (under a minute)

https://youtu.be/5Lf3TDWYG40

## Source repository

https://github.com/antonmareo10/cuadra

## Clocked endpoints used and how they work together

I use all ten. Each one changes what the app does or shows, and the order matters: safety first, then reading, then matching, then checks, then the decision and the email.

- Pipeline runs Guard and then Extract on every document in one request. Guard has stop: true, so a document that addresses AI assistants is never read as it is.
- Guard (/injection) caught white, 1-point text in the fake fish invoice telling "automated accounts payable assistants" to mark a new bank account as verified and keep quiet about it. That is a hard stop. The flagged lines are blanked out, with offsets kept, before Extract reads the document again.
- Protect (/pii) finds the bank account printed on the invoice, and code compares it with the IBAN on file. A different one holds the payment. Protect also returns a redacted PDF and a share-safe copy for sending the pack outside the restaurant.
- Inspect (/script) only runs when a PDF contains JavaScript, which I find with pdf-lib without running it. The fake invoice's script came back as malicious, data exfiltration.
- Extract reads the header and every line of the three documents as lists of records, plus the goods the delivery note says were returned. Every value comes back as a span of the document's text, and the app keeps those offsets all the way to the screen: that is how each finding shows its line. An empty cell is re-read inside its own line; if it is still empty, it stays missing.
- Rerank matches each invoiced product to the chef's order, which has no supplier codes, and says when a near match is a different product (tomate rama is not tomate pera).
- Then plain code does the arithmetic: billed against delivered and returned, price against the agreed tariff, VAT against the tariff, lines against totals. Every euro withheld has a formula and an independent recomputation that must agree.
- Compare reads every pair of documents plus the supplier's earlier invoices in one request. "Same" against an invoice already paid holds the new one as a duplicate.
- Verify (/grounding) checks what the supplier wrote on the invoice ("prices updated per the new tariff communicated on 15/10") against my tariff and order: not stated. It also checks every claim of the email Fill writes before the owner can copy it.
- Decide triages all the discrepancies in one request, one document per discrepancy with two questions each, action and priority. If it is less than 60% sure, Cuadra does not apply the action and asks the owner.
- Fill writes the reconciliation record: status, credit note yes or no, bookkeeping category, a short summary for the owner and the email to the supplier.

A run takes 15 to 19 calls, about 163 credits and 11 to 24 seconds per invoice in the recordings. Every call is listed on the case page with its credits and model time, read from the X-Clocked-Credits and X-Clocked-Model-Ms headers.

## What I learned (optional)

Treating the model output as evidence and keeping the decision in code made everything easier to trust. Extract gives me spans, Rerank, Compare and Decide give me probabilities, and the money is computed by code I can test. The most useful single feature was the character offsets: every euro on screen can point to the line it was printed on. I also learned to describe Extract columns with the header names exactly as printed on the document ("Cantidad", "Precio", "Importe"). On the meat case that one change took the empty cells from three to one, and the last one is now re-read inside its own line.

## Team

Antonio González Fernández · antonmareo@gmail.com · github.com/antonmareo10

## Award categories

Best Overall App, Best Use of Decide/Extract/Fill, Best Use of Protect/Guard/Inspect, Best Use of Verify/Compare/Rerank, and People's Choice (with the LinkedIn post URL).

## Public write-up (optional field; the README says the same in more detail)

How Cuadra handles uncertain results, missing information and failed requests:

- Uncertain results. Probabilities are shown next to every model judgement. When Decide's top action is under 60%, it is not applied: the issue waits for the owner, marked "unsure, your call". Guard, Inspect, Protect and Compare raise flags, but the hold itself is enforced in code and only the owner can clear it, after calling the supplier on the number already on file.
- Missing information. Extract returns null for what a document does not state. An empty cell is re-read once inside its own line; if it is still empty, the check that needs it is skipped and shown as unknown. Nothing is guessed. An invoice without a readable total or lines, or a scan without a text layer, is held as unreadable and never approved. In a live test, a recipe uploaded as an invoice came back unreadable and held.
- Failed requests. Every request carries an Idempotency-Key, and retries of 429, 5xx and network errors reuse it with the identical body, with bounded backoff. retryAsNew stops the retries, and 4xx errors are never retried. A step that fails is listed on the page and never counted as a pass.
- Spending. A hard credit cap (CLOCKED_CREDIT_CAP, 6,000 by default) is checked before every request, and any response billed as something other than the free trial stops all further calls. The public demo runs on recordings and has no key, so it cannot spend anything.

Reproducing it: `npm install && npm run demo` runs the full demo with no key. `npm test` (34 tests) replays the real recordings through the engine and checks every planted problem in `data/cases/*/truth.json`. `npm run smoke` makes one small real call to each endpoint, and `npm run record` re-records the five cases.

## Criteria map (my own checklist; parts of it can go in the write-up)

| Criterion | Evidence a judge can open |
|---|---|
| Practical usefulness (25) | A decision, not a report: "Pay €365.42 now, claim €42.81, ask the kitchen about €18.70" on the meat case. €105.01 to claim across the five samples and two invoices held (new bank account, already paid). The supplier email comes written and checked. |
| Core Clocked integration (30) | Extract offsets carried to the screen: each quote says "Invoice, line 13" and opens the document at that line. Nulls stay null with one in-line re-read. Arithmetic in code. Idempotency-Key, bounded retries, concurrency limit, hard credit cap, cost headers per call (`lib/clocked/`, `tests/client.test.ts`). |
| Additional endpoints (15) | All ten, each changing the result (list above). Group coverage 3 of 3 in each award group. |
| Implementation and UX (20) | Verdict first, evidence one click away, actions change the amount to pay live. Works at 390 px with no sideways scroll, dark mode, reduced motion, keyboard focus, AA contrast (checked with axe), no console errors, every page prerendered as static HTML. |
| Explanation and reproducibility (10) | README with setup, failure handling and the five cases; demo needs no key; 34 tests replay the real recordings; synthetic data generated by a script. |

## LinkedIn post for People's Choice (draft)

Restaurants pay supplier invoices without checking them against what actually arrived. I built Cuadra to do that check: it reads the chef's WhatsApp order, the signed delivery note and the invoice, and says what to pay, what to claim back and what to hold.

Every finding points to the line it came from. In the demo it catches meat billed by the order instead of by the scale, a price rise nobody agreed to, a box of wine returned at the door but still invoiced, an invoice that was already paid, and a fish invoice that adds up to the cent but asks to be paid into a new bank account, with white text hidden for "automated assistants" telling them to approve it.

Built with all ten @Clocked endpoints for the Clocked Build Challenge. Try it, no sign-up: https://cuadra-alpha-blush.vercel.app

#ClockedChallenge

(On LinkedIn, type @ and pick the official Clocked page from the suggestions; a pasted URL does not count. Attach the video or two screenshots: `docs/screenshots/home-1440.png` and `docs/screenshots/documents-1440.png`.)
