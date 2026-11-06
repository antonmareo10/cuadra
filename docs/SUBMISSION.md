# Entry form texts for Cuadra v2 (6 Nov 2026)

Ready to paste into the fields of clocked.rezolve.ai/challenge. First person, Antón's voice, plain English. Earlier versions: [SUBMISSION-v1.md](SUBMISSION-v1.md) (pasted on 4 Nov) and [SUBMISSION-v2.md](SUBMISSION-v2.md) (5 Nov). Every figure below comes from the recorded runs in `public/runs/` or from `npm test`.

## Project name

Cuadra

## Overview (what it does, who it is for, what problem it solves)

Cuadra checks a small restaurant's supplier invoices before anyone pays them. You give it the chef's order (often a WhatsApp message), the delivery note the kitchen signed (a phone photo of the paper is fine) and the supplier's invoice. It reads all three with Clocked, checks every line against the other two and gives one decision: what to pay now, what to claim back and what not to pay at all.

It is for the owner of a small restaurant. They get dozens of supplier invoices a month and pay most of them without a line-by-line check, because the check takes longer than the money seems worth. I build software that reads restaurant delivery notes, so I have seen the leaks up close: meat billed by the order instead of by the scale, a price rise nobody agreed to, water billed at the alcohol VAT rate, a box sent back at the door and still invoiced, the same delivery invoiced twice. And now invoices that add up perfectly but ask to be paid into a new bank account, with text hidden for whatever AI reads them.

What makes it different. Every finding points to the exact line it came from, on the document itself: "Invoice, line 13: 6,000 kg" against "Delivery note, line 12: 5,200 kg", outlined on the page so the owner can check it in seconds. The decisions about money and fraud are made in code from Clocked's evidence, never by a model on its own: uncertain calls go to the owner, and only the owner can clear a hold. A delivery note can be a phone photo, handwritten weights included; since a photo has no character positions, nothing that depends on it is paid until the owner has looked at it. And it works from an AI assistant: an MCP server gives Claude Desktop or any MCP client the same answer, the same lines and the same holds.

The demo has six synthetic cases with planted problems, one of them with the delivery note as a phone photo. All six verdicts are right, every planted amount is found to the cent, and nothing else is claimed. They are real Clocked recordings from 3 and 5 November, replayed through the same engine and labelled as recorded, so the demo never waits.

## Demo

https://cuadra-alpha-blush.vercel.app

## Demo video

(the new YouTube link, once uploaded; the old one is https://youtu.be/5Lf3TDWYG40)

## Source repository

https://github.com/antonmareo10/cuadra

## Clocked endpoints used and how they work together

I use all ten. Each one changes what the app does or shows, and the order matters: safety first, then reading, then matching, then checks, then the decision and the email.

- Pipeline runs Guard and then Extract on every text document in one request. Guard has stop: true, so a document that addresses AI assistants is never read as it is.
- Guard (/injection) caught white, 1-point text in the fake fish invoice telling "automated accounts payable assistants" to mark a new bank account as verified and keep quiet about it. That is a hard stop. The flagged lines are blanked out, with offsets kept, before Extract reads the document again. On a photo, Guard reads the image first; if it fires, the photo is not read at all.
- Protect (/pii) finds the bank account printed on the invoice, and code compares it with the IBAN on file. A different one holds the payment. Protect also returns a redacted PDF and a share-safe copy for sending the pack outside the restaurant.
- Inspect (/script) only runs when a PDF contains JavaScript, which I find with pdf-lib without running it. The fake invoice's script came back as malicious, data exfiltration.
- Extract reads the header and every line of the three documents as lists of records, plus the goods the delivery note says were returned. Every value comes back as a span of the document's text, and the app keeps those offsets all the way to the screen and onto the picture of the page: that is how each finding shows its line. An empty cell is re-read inside its own line; if it is still empty, it stays missing. For a photo or a scan, Extract runs in image mode: each row comes back as one string that my code splits into columns, plus the quantities corrected by hand, and the case is marked as read without positions.
- Rerank matches each invoiced product to the chef's order, which has no supplier codes, and says when a near match is a different product (tomate rama is not tomate pera).
- Then plain code does the arithmetic: billed against delivered and returned, price against the agreed tariff, VAT against the tariff, lines against totals. Every euro withheld has a formula and an independent recomputation that must agree.
- Compare reads every pair of documents plus the supplier's earlier invoices in one request. "Same" against an invoice already paid holds the new one as a duplicate.
- Verify (/grounding) checks what the supplier wrote on the invoice ("prices updated per the new tariff communicated on 15/10") against my tariff and order: not stated. It also checks every claim of the email Fill writes before the owner can copy it.
- Decide triages all the discrepancies in one request, one document per discrepancy with two questions each, action and priority. If it is less than 60% sure, Cuadra does not apply the action and asks the owner. Whether the owner has looked at a photo is never sent to it.
- Fill writes the reconciliation record: status, credit note yes or no, bookkeeping category, a short summary for the owner and the email to the supplier.

A run takes 15 to 19 calls, 133 to 220 credits and 11 to 24 seconds per invoice in the recordings. Every call is listed on the case page with its credits and model time, read from the X-Clocked-Credits and X-Clocked-Model-Ms headers. The MCP server's tools call the same engine and the same client, under the same credit cap.

## What I learned (optional)

Treating the model output as evidence and keeping the decision in code made everything easier to trust. Extract gives me spans, Rerank, Compare and Decide give me probabilities, and the money is computed by code I can test. The most useful single feature was the character offsets: every euro on screen can point to the line it was printed on, and now to the place on the page. Reading photos taught me the other side. Image mode has no offsets and no nested records, so I ask for each row as one string and split it in code. In my photo case Extract read the handwritten 5,2 kg right and read a crossed-out 3 as a 9. The quantities it used were right, but that is exactly why a photo read is never paid without the owner looking at it.

## Team

Antonio González Fernández · antonmareo@gmail.com · github.com/antonmareo10

## Award categories

Best Overall App, Best Use of Decide/Extract/Fill, Best Use of Protect/Guard/Inspect, Best Use of Verify/Compare/Rerank, and People's Choice (with the LinkedIn post URL).

## Public write-up (optional field; the README says the same in more detail)

How Cuadra handles uncertain results, missing information and failed requests:

- Uncertain results. Probabilities are shown next to every model judgement. When Decide's top action is under 60%, it is not applied: the issue waits for the owner, marked "unsure, your call". Guard, Inspect, Protect and Compare raise flags, but the hold itself is enforced in code and only the owner can clear it, after calling the supplier on the number already on file.
- Missing information. Extract returns null for what a document does not state. An empty cell is re-read once inside its own line; if it is still empty, the check that needs it is skipped and shown as unknown. Nothing is guessed. An invoice without a readable total or lines, or an invoice that is only a photo or a scan, is held as unreadable and never approved.
- Values without positions. A delivery note read from a photo or a scan is checked like any other, but everything that would be paid now waits until the owner has looked at the photo. One tap releases it. A row the image read could not split into columns is reported and left out.
- Failed requests. Every request carries an Idempotency-Key, and retries of 429, 5xx and network errors reuse it with the identical body, with bounded backoff. retryAsNew stops the retries, and 4xx errors are never retried. A step that fails is listed on the page and never counted as a pass.
- Spending. A hard credit cap (CLOCKED_CREDIT_CAP, 6,000 by default) is checked before every request, in the app and in the MCP server, and any response billed as something other than the free trial stops all further calls. The public demo runs on recordings and has no key, so it cannot spend anything.

Reproducing it: `npm install && npm run demo` runs the full demo with no key. `npm test` (65 tests) replays the real recordings through the engine, checks every planted problem in `data/cases/*/truth.json`, and runs the MCP server over stdio. `npm run mcp:demo` runs a real MCP client session in replay mode. `npm run smoke` makes one small real call to each endpoint, and `npm run record` re-records the six cases.

## Criteria map (my own checklist; the full version is docs/CRITERIA.md)

| Criterion | Evidence a judge can open |
|---|---|
| Practical usefulness (25) | A decision, not a report: "Pay €365.42 now, claim €42.81, ask the kitchen about €18.70" on the meat case. Delivery notes as phone photos, handwritten weights read, payment held until the owner looks. Two invoices held (new bank account, already paid). The supplier email comes written and checked. Usable from an AI assistant through MCP. |
| Core Clocked integration (30) | Extract offsets carried to the screen and onto the page picture: each quote says "Invoice, line 13" and outlines that line on the document. Image mode for photos with rows split in code. Nulls stay null with one in-line re-read. Arithmetic in code. Idempotency-Key, bounded retries, concurrency limit, hard credit cap, cost headers per call. |
| Additional endpoints (15) | All ten, each changing the result (list above). Group coverage 3 of 3 in each award group. |
| Implementation and UX (20) | The documents as they arrived next to what Clocked read; one decision first, evidence one click away, actions change the amount to pay live. 390 px with no sideways scroll, dark mode, reduced motion, keyboard focus; axe-core 0 violations on every page (1440 and 390 px, light and dark). |
| Explanation and reproducibility (10) | README with setup, failure handling, the six cases and the MCP setup; demo needs no key; 65 tests replay the real recordings; synthetic data and document pictures generated by scripts. |

## LinkedIn post for People's Choice (draft)

Restaurants pay supplier invoices without checking them against what actually arrived. I built Cuadra to do that check: you give it the chef's WhatsApp order, a photo of the signed delivery note and the invoice, and it says what to pay, what to claim back and what to hold.

Every finding points to the line it came from, outlined on the document itself. In the demo it reads the weights written by hand on a paper delivery note, catches meat billed by the order instead of by the scale, a price rise nobody agreed to, an invoice that was already paid, and a fish invoice that adds up to the cent but asks to be paid into a new bank account, with white text hidden for "automated assistants" telling them to approve it. It also works from an AI assistant, through an MCP server.

Built with all ten @Clocked endpoints for the Clocked Build Challenge. Try it, no sign-up: https://cuadra-alpha-blush.vercel.app

#ClockedChallenge

(On LinkedIn, type @ and pick the official Clocked page from the suggestions; a pasted URL does not count. Attach the video, or two pictures: `docs/screenshots/v2/home-1440-fold.png` and `public/paper/meat-photo-delivery/delivery.jpg`.)
