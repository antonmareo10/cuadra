# Entry form drafts

Drafts for the fields of the entry form at clocked.rezolve.ai/challenge. First person, Antón's voice. Edit freely before pasting. Links marked TODO are filled once the repository is public and the demo is deployed.

## Project name

Cuadra

## Overview (what it does, who it is for, what problem it solves)

Cuadra checks a restaurant's supplier invoices against what was ordered and what actually arrived, and tells the owner what to pay, what to claim back and which invoices not to pay at all.

It is for small restaurants. They receive dozens of supplier invoices a month and almost never check them line by line against the delivery note the kitchen signed, because it takes longer than the money seems worth. I have spent the last year building software that reads restaurant delivery notes, so I have seen the leaks up close: meat billed by the order instead of by the scale, a price rise nobody agreed to, water billed at the alcohol VAT rate, a box sent back at the door and still invoiced, the same delivery invoiced twice. And now invoices that ask you to pay a new bank account.

You give Cuadra the order (often a WhatsApp message from the chef), the delivery note and the invoice. About ten seconds later you get one answer, for example "Pay €365.42 now, claim €42.81, ask the kitchen about €18.70", with every number linked to the line it came from, and the email to the supplier already written and fact-checked. Uncertain calls are left to you, and invoices that look like fraud or a duplicate are held until you clear them yourself.

The demo has five synthetic cases with planted problems. All five verdicts are right and every planted amount is found to the cent. They are real Clocked recordings replayed instantly, so the demo never waits.

## Demo

TODO: demo URL (or the video link)

## Source repository

TODO: https://github.com/<handle>/cuadra

## Clocked endpoints used and how they work together

I use all ten endpoints. Each one changes what the app does:

- Pipeline runs Guard and then Extract on every document in one request. Guard has stop: true, so a document that addresses AI assistants is never read as it is.
- Guard (/injection) caught white, 1-point text in a fake invoice telling "automated assistants" to mark a new bank account as verified and to keep quiet about it. That is a hard stop, and the flagged lines are blanked out (offsets kept) before Extract reads the document again.
- Protect (/pii) finds the bank account on the invoice, which I compare with the IBAN on file: a different one holds the payment. It also gives me a redacted PDF and a share-safe copy to send outside the restaurant.
- Inspect (/script) only runs when a PDF contains JavaScript, which I find with pdf-lib without running it. The fake invoice's script came back as malicious data exfiltration.
- Extract reads the header values and every line of the three documents as lists of records, plus the goods the delivery note says were returned. Empty cells are re-read inside their own line; missing values stay missing.
- Rerank matches each invoiced product to the chef's order, which has no supplier codes, and says when a near match is a different product (tomate rama is not tomate pera).
- The arithmetic is plain code: billed against delivered and returned, price against the agreed tariff, VAT against the tariff, lines against totals.
- Compare reads every pair of the documents plus earlier invoices in one request. An invoice that is the "same" as one already paid is held as a duplicate.
- Verify (/grounding) checks what the supplier wrote on the invoice ("prices updated per the new tariff communicated on 15/10") against my tariff and order: not stated. It also checks every claim of the email Fill writes before I can copy it.
- Decide triages all discrepancies in one request, one document per discrepancy with an action and a priority question each. If it is less than 60% sure, Cuadra does not apply the action and asks me.
- Fill writes the reconciliation record: status, credit note yes or no, bookkeeping category, a short summary and the email to the supplier.

On failures: every request carries an Idempotency-Key and retries reuse it, 4xx errors are never retried, a hard credit cap is checked before each call, and any step that fails is shown on the page and never counted as a pass.

## What I learned (optional)

Treating the model output as evidence and keeping the decision in code made everything easier to trust. Extract gives me spans, Rerank and Decide give me probabilities, and the money is computed by code I can test. The most useful single feature was the character offsets: every euro on screen points to where it was printed. I also learned to describe Extract columns with the header names exactly as printed on the document ("Cantidad", "Precio", "Importe"); on the meat case that one change took the empty cells from three to one, and the last one is now re-read inside its own line.

## Team

Antonio González Fernández · TODO email · TODO GitHub handle

## Award categories

Best Overall App, Best Use of Decide/Extract/Fill, Best Use of Protect/Guard/Inspect, Best Use of Verify/Compare/Rerank, and People's Choice (with the LinkedIn post URL).

## LinkedIn post for People's Choice (draft)

Restaurants pay supplier invoices without checking them against what actually arrived. I built Cuadra to do that check in ten seconds: it reads the chef's WhatsApp order, the signed delivery note and the invoice, and says what to pay, what to claim back and what not to pay at all.

In the demo it catches meat billed by the order instead of by the scale, a price rise nobody agreed to, a box of wine returned at the door but still invoiced, an invoice that was already paid, and a fake invoice with hidden instructions for AI assistants and a new bank account.

Built with all ten @Clocked endpoints for the Clocked Build Challenge. Try it: TODO demo link

#ClockedChallenge

(On LinkedIn, type @ and pick the official Clocked page from the suggestions; a pasted URL does not count. Attach a short video or screenshots.)
