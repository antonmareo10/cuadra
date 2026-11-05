/**
 * npm run documents
 *
 * Generates the synthetic sample documents from data/world.ts:
 *   data/cases/<id>/po.pdf | po.txt   purchase order (order sheet PDF or WhatsApp export)
 *   data/cases/<id>/delivery.pdf      delivery note (albarán), or delivery.jpg when it arrives as a photo
 *   data/paper/<id>-printed.pdf       for photo cases, the paper note as printed (before the handwriting)
 *   data/cases/<id>/invoice.pdf       supplier invoice (factura)
 *   data/cases/<id>/history/*.txt     earlier invoices already in the books
 *   data/cases/<id>/case.json         manifest the app loads
 *   data/cases/<id>/truth.json        planted discrepancies (never read by the engine)
 *   data/suppliers/<id>.json + tariff.txt  supplier master data and agreed price list
 *
 * Deterministic: the same world.ts always produces byte-identical PDFs.
 */
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import {
  CASES,
  HISTORY_LINES,
  RESTAURANT,
  SUPPLIERS,
  type CaseDefinition,
  type InvoiceLine,
  type Product,
  type Supplier,
} from "../data/world";
import { fmtEs, fmtQtyEs, round2 } from "../lib/money";

const ROOT = path.join(process.cwd(), "data");
/** Paper versions of documents (the printed note behind a photo, and the photo itself). */
const PAPER = path.join(ROOT, "paper");
const FIXED_DATE = new Date("2026-11-03T09:00:00Z");

const INK = rgb(0.11, 0.11, 0.1);
const MUTED = rgb(0.42, 0.42, 0.4);
const RULE = rgb(0.82, 0.8, 0.76);
const WHITE = rgb(1, 1, 1);

const BRAND: Record<string, RGB> = {
  huerta: rgb(0.24, 0.45, 0.22),
  gredos: rgb(0.55, 0.16, 0.14),
  ribera: rgb(0.36, 0.14, 0.3),
  bahia: rgb(0.1, 0.3, 0.5),
};

const SYNTHETIC_FOOTER =
  "Documento sintético de demostración para Cuadra (Clocked Build Challenge). Empresa, personas y cuentas ficticias.";

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  y: number;
}

function product(s: Supplier, code: string): Product {
  const p = s.products.find((x) => x.code === code);
  if (!p) throw new Error(`Unknown product ${code} for ${s.id}`);
  return p;
}

function text(ctx: Ctx, str: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: RGB } = {}) {
  ctx.page.drawText(str, { x, y, size: o.size ?? 9, font: o.bold ? ctx.bold : ctx.regular, color: o.color ?? INK });
}

function textRight(ctx: Ctx, str: string, right: number, y: number, o: { size?: number; bold?: boolean; color?: RGB } = {}) {
  const font = o.bold ? ctx.bold : ctx.regular;
  const w = font.widthOfTextAtSize(str, o.size ?? 9);
  text(ctx, str, right - w, y, o);
}

function rule(ctx: Ctx, y: number, x1 = 48, x2 = 547) {
  ctx.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: RULE });
}

function wrap(font: PDFFont, str: string, size: number, width: number): string[] {
  const words = str.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

async function newDoc(title: string, author: string): Promise<Ctx> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor(author);
  doc.setProducer("Cuadra sample generator");
  doc.setCreator("Cuadra sample generator");
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  const page = doc.addPage([595, 842]);
  return {
    doc,
    page,
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    y: 790,
  };
}

function footer(ctx: Ctx) {
  rule(ctx, 52);
  text(ctx, SYNTHETIC_FOOTER, 48, 40, { size: 6.5, color: MUTED });
}

function supplierHeader(ctx: Ctx, s: Supplier, docTitle: string, rightLines: string[]) {
  ctx.page.drawRectangle({ x: 0, y: 812, width: 595, height: 30, color: BRAND[s.id] });
  text(ctx, s.name.toUpperCase(), 48, 822, { size: 13, bold: true, color: WHITE });
  textRight(ctx, docTitle, 547, 822, { size: 12, bold: true, color: WHITE });
  let y = 794;
  for (const l of [`CIF ${s.taxId}`, s.address, `Tel. ${s.phone} · ${s.email}`]) {
    text(ctx, l, 48, y, { size: 8.5, color: MUTED });
    y -= 12;
  }
  let ry = 794;
  for (const l of rightLines) {
    textRight(ctx, l, 547, ry, { size: 9, bold: ry === 794 });
    ry -= 12;
  }
  ctx.y = Math.min(y, ry) - 10;
}

function customerBlock(ctx: Ctx, label: string, extra: string[]) {
  rule(ctx, ctx.y);
  ctx.y -= 16;
  text(ctx, label, 48, ctx.y, { size: 8, bold: true, color: MUTED });
  ctx.y -= 13;
  text(ctx, `${RESTAURANT.legalName} (${RESTAURANT.name}) · CIF ${RESTAURANT.taxId}`, 48, ctx.y, { size: 9.5 });
  ctx.y -= 12;
  text(ctx, RESTAURANT.address, 48, ctx.y, { size: 9 });
  for (const e of extra) {
    ctx.y -= 12;
    text(ctx, e, 48, ctx.y, { size: 9 });
  }
  ctx.y -= 18;
}

interface Col {
  title: string;
  x: number;
  align: "left" | "right";
  width?: number;
}

function table(ctx: Ctx, cols: Col[], rows: string[][]) {
  rule(ctx, ctx.y + 4);
  ctx.y -= 8;
  for (const c of cols) {
    if (c.align === "left") text(ctx, c.title, c.x, ctx.y, { size: 8, bold: true, color: MUTED });
    else textRight(ctx, c.title, c.x, ctx.y, { size: 8, bold: true, color: MUTED });
  }
  ctx.y -= 6;
  rule(ctx, ctx.y);
  ctx.y -= 14;
  for (const r of rows) {
    let extraLines = 0;
    r.forEach((cell, i) => {
      const c = cols[i];
      if (c.align === "left") {
        const lines = c.width ? wrap(ctx.regular, cell, 9, c.width) : [cell];
        lines.forEach((l, j) => text(ctx, l, c.x, ctx.y - j * 11, { size: 9 }));
        extraLines = Math.max(extraLines, lines.length - 1);
      } else textRight(ctx, cell, c.x, ctx.y, { size: 9 });
    });
    ctx.y -= 16 + extraLines * 11;
  }
  rule(ctx, ctx.y + 8);
  ctx.y -= 10;
}

function paragraph(ctx: Ctx, title: string | null, lines: string[], o: { size?: number; bold?: boolean } = {}) {
  if (title) {
    text(ctx, title, 48, ctx.y, { size: 8, bold: true, color: MUTED });
    ctx.y -= 13;
  }
  for (const l of lines) {
    for (const w of wrap(o.bold ? ctx.bold : ctx.regular, l, o.size ?? 9, 499)) {
      text(ctx, w, 48, ctx.y, { size: o.size ?? 9, bold: o.bold });
      ctx.y -= 12;
    }
  }
  ctx.y -= 8;
}

// ---------------------------------------------------------------- documents

async function purchaseOrderPdf(c: CaseDefinition, s: Supplier): Promise<Uint8Array> {
  const ctx = await newDoc(`Pedido ${c.po.number}`, RESTAURANT.legalName);
  ctx.page.drawRectangle({ x: 0, y: 812, width: 595, height: 30, color: rgb(0.16, 0.16, 0.14) });
  text(ctx, RESTAURANT.name.toUpperCase(), 48, 822, { size: 13, bold: true, color: WHITE });
  textRight(ctx, "PEDIDO A PROVEEDOR", 547, 822, { size: 12, bold: true, color: WHITE });
  let y = 794;
  for (const l of [`${RESTAURANT.legalName} · CIF ${RESTAURANT.taxId}`, RESTAURANT.address, RESTAURANT.email]) {
    text(ctx, l, 48, y, { size: 8.5, color: MUTED });
    y -= 12;
  }
  textRight(ctx, `Pedido nº ${c.po.number}`, 547, 794, { size: 9, bold: true });
  textRight(ctx, `Fecha: ${c.po.date}`, 547, 782, { size: 9 });
  textRight(ctx, `Entrega solicitada: ${c.po.deliveryDate}`, 547, 770, { size: 9 });
  ctx.y = y - 10;
  rule(ctx, ctx.y);
  ctx.y -= 16;
  text(ctx, "PROVEEDOR", 48, ctx.y, { size: 8, bold: true, color: MUTED });
  ctx.y -= 13;
  text(ctx, `${s.name} · CIF ${s.taxId}`, 48, ctx.y, { size: 9.5 });
  ctx.y -= 12;
  text(ctx, `Pedido por: ${RESTAURANT.chef} (cocina) · ${RESTAURANT.chefPhone}`, 48, ctx.y, { size: 9 });
  ctx.y -= 22;

  const rows = c.po.lines.map((l) => [
    l.text,
    fmtQtyEs(l.qty, l.unit),
    l.unit,
    l.price !== undefined ? `${fmtEs(l.price)} €` : "",
    l.price !== undefined ? `${fmtEs(round2(l.qty * l.price))} €` : "",
  ]);
  table(
    ctx,
    [
      { title: "Producto", x: 48, align: "left", width: 230 },
      { title: "Cantidad", x: 340, align: "right" },
      { title: "Unidad", x: 350, align: "left" },
      { title: "Precio acordado", x: 470, align: "right" },
      { title: "Importe estimado", x: 547, align: "right" },
    ],
    rows,
  );
  const est = round2(c.po.lines.reduce((a, l) => a + l.qty * (l.price ?? 0), 0));
  textRight(ctx, `Total estimado (sin IVA): ${fmtEs(est)} €`, 547, ctx.y, { size: 10, bold: true });
  ctx.y -= 28;
  paragraph(ctx, "OBSERVACIONES", [
    "Entregar en cocina antes de las 9:00. Precios según la tarifa acordada para el trimestre en curso.",
  ]);
  footer(ctx);
  return ctx.doc.save({ useObjectStreams: false });
}

async function deliveryNotePdf(c: CaseDefinition, s: Supplier): Promise<Uint8Array> {
  const ctx = await newDoc(`Albarán ${c.delivery.number}`, s.name);
  supplierHeader(ctx, s, "ALBARÁN DE ENTREGA", [
    `Albarán nº ${c.delivery.number}`,
    `Fecha de entrega: ${c.delivery.date}`,
    `Su pedido: ${c.po.number}`,
  ]);
  customerBlock(ctx, "CLIENTE Y DIRECCIÓN DE ENTREGA", []);
  // A paper note is printed before the goods are weighed: it shows printedQty, and the
  // corrections are written over it by hand (drawn by scripts/assets, not here).
  const rows = c.delivery.lines.map((l) => {
    const p = product(s, l.product);
    const qty = l.printedQty ?? l.qty;
    return [p.code, l.note ? `${p.name} (${l.note})` : p.name, fmtQtyEs(qty, p.unit), p.unit];
  });
  table(
    ctx,
    [
      { title: "Código", x: 48, align: "left" },
      { title: "Descripción", x: 110, align: "left", width: 300 },
      { title: "Cantidad", x: 480, align: "right" },
      { title: "Unidad", x: 495, align: "left" },
    ],
    rows,
  );
  paragraph(ctx, "OBSERVACIONES EN LA ENTREGA", c.delivery.remarks);
  paragraph(ctx, null, [
    `Transportista: ${c.delivery.driver} · ${c.delivery.driverPhone}`,
    `Recibido por: ${RESTAURANT.receiver} (firma en cocina)`,
  ]);
  text(ctx, "Documento sin valor fiscal. La factura se emitirá por separado.", 48, ctx.y, { size: 8, color: MUTED });
  footer(ctx);
  return ctx.doc.save({ useObjectStreams: false });
}

interface Totals {
  lines: { code: string; name: string; unit: string; qty: number; price: number; vat: number; amount: number; note?: string }[];
  byRate: { rate: number; base: number; vat: number }[];
  subtotal: number;
  vatTotal: number;
  total: number;
}

function invoiceTotals(s: Supplier, lines: InvoiceLine[]): Totals {
  const ls = lines.map((l) => {
    const p = product(s, l.product);
    const price = l.price ?? p.price;
    const vat = l.vat ?? p.vat;
    return { code: p.code, name: p.name, unit: p.unit, qty: l.qty, price, vat, amount: round2(l.qty * price), note: l.note };
  });
  const rates = [...new Set(ls.map((l) => l.vat))].sort((a, b) => a - b);
  const byRate = rates.map((rate) => {
    const base = round2(ls.filter((l) => l.vat === rate).reduce((a, l) => a + l.amount, 0));
    return { rate, base, vat: round2((base * rate) / 100) };
  });
  const subtotal = round2(byRate.reduce((a, r) => a + r.base, 0));
  const vatTotal = round2(byRate.reduce((a, r) => a + r.vat, 0));
  return { lines: ls, byRate, subtotal, vatTotal, total: round2(subtotal + vatTotal) };
}

function addDays(ddmmyyyy: string, days: number): string {
  const [d, m, y] = ddmmyyyy.split("/").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${String(dt.getUTCDate()).padStart(2, "0")}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${dt.getUTCFullYear()}`;
}

function termDays(s: Supplier): number {
  const m = s.paymentTerms.match(/(\d+) días/);
  return m ? Number(m[1]) : 30;
}

async function invoicePdf(c: CaseDefinition, s: Supplier): Promise<{ bytes: Uint8Array; totals: Totals; printedTotal: number }> {
  const inv = c.invoice;
  const ctx = await newDoc(`Factura ${inv.number}`, s.name);
  supplierHeader(ctx, s, "FACTURA", [`Factura nº ${inv.number}`, `Fecha: ${inv.date}`, `Albarán: ${c.delivery.number}`, `Su pedido: ${c.po.number}`]);
  customerBlock(ctx, "FACTURAR A", []);
  const t = invoiceTotals(s, inv.lines);
  table(
    ctx,
    [
      { title: "Código", x: 48, align: "left" },
      { title: "Descripción", x: 106, align: "left", width: 210 },
      { title: "Cantidad", x: 365, align: "right" },
      { title: "Ud.", x: 372, align: "left" },
      { title: "Precio", x: 448, align: "right" },
      { title: "IVA", x: 482, align: "right" },
      { title: "Importe", x: 547, align: "right" },
    ],
    t.lines.map((l) => [
      l.code,
      l.note ? `${l.name} (${l.note})` : l.name,
      fmtQtyEs(l.qty, l.unit),
      l.unit,
      fmtEs(l.price),
      `${l.vat}%`,
      fmtEs(l.amount),
    ]),
  );

  const subtotal = inv.printedSubtotalOverride ?? t.subtotal;
  const printedTotal = inv.printedTotalOverride ?? t.total;
  let y = ctx.y;
  for (const r of t.byRate) {
    textRight(ctx, `Base imponible ${r.rate}%:`, 470, y, { size: 9 });
    textRight(ctx, `${fmtEs(r.base)} €`, 547, y, { size: 9 });
    y -= 12;
    textRight(ctx, `IVA ${r.rate}%:`, 470, y, { size: 9 });
    textRight(ctx, `${fmtEs(r.vat)} €`, 547, y, { size: 9 });
    y -= 12;
  }
  textRight(ctx, "Total base imponible:", 470, y, { size: 9 });
  textRight(ctx, `${fmtEs(subtotal)} €`, 547, y, { size: 9 });
  y -= 12;
  textRight(ctx, "Total IVA:", 470, y, { size: 9 });
  textRight(ctx, `${fmtEs(t.vatTotal)} €`, 547, y, { size: 9 });
  y -= 18;
  textRight(ctx, "TOTAL FACTURA:", 470, y, { size: 11, bold: true });
  textRight(ctx, `${fmtEs(printedTotal)} €`, 547, y, { size: 11, bold: true });
  ctx.y = y - 28;

  const iban = inv.iban ?? s.ibanOnFile;
  paragraph(ctx, "FORMA DE PAGO", [
    `${s.paymentTerms}. Vencimiento: ${addDays(inv.date, termDays(s))}.`,
    `IBAN: ${iban}`,
  ]);
  if (inv.bankChangeNotice) paragraph(ctx, null, [inv.bankChangeNotice], { bold: true });
  if (inv.note) paragraph(ctx, "NOTAS", [inv.note]);
  text(ctx, `Inscrita en el Registro Mercantil (ficticio), hoja M-000${s.taxId.slice(-3)}.`, 48, ctx.y, { size: 7.5, color: MUTED });
  ctx.y -= 14;
  if (inv.hiddenText) {
    // White 1-point text: invisible on paper, present in the text layer.
    ctx.page.drawText(inv.hiddenText, { x: 48, y: 64, size: 1, font: ctx.regular, color: WHITE });
  }
  if (inv.embeddedScript) ctx.doc.addJavaScript("verificacion", inv.embeddedScript);
  footer(ctx);
  const bytes = await ctx.doc.save({ useObjectStreams: false });
  return { bytes, totals: t, printedTotal };
}

function historyText(s: Supplier, number: string, date: string, dn: string, po: string, lines: InvoiceLine[], status: string): string {
  const t = invoiceTotals(s, lines);
  return [
    `FACTURA ${number} · ${s.name} · CIF ${s.taxId}`,
    `Fecha: ${date} · Albarán: ${dn} · Su pedido: ${po}`,
    `Cliente: ${RESTAURANT.legalName} · CIF ${RESTAURANT.taxId}`,
    ...t.lines.map((l) => `${l.code} ${l.name} ${fmtQtyEs(l.qty, l.unit)} ${l.unit} ${fmtEs(l.price)} ${l.vat}% ${fmtEs(l.amount)}`),
    ...t.byRate.map((r) => `Base imponible ${r.rate}%: ${fmtEs(r.base)} € · IVA ${r.rate}%: ${fmtEs(r.vat)} €`),
    `TOTAL FACTURA: ${fmtEs(t.total)} €`,
    `Estado en contabilidad: ${status}`,
  ].join("\n");
}

function tariffText(s: Supplier): string {
  return [
    s.tariffName,
    `${s.name} · CIF ${s.taxId} — cliente ${RESTAURANT.legalName}`,
    s.tariffValidity + ". Cualquier cambio de precio requiere aceptación por escrito del cliente antes de aplicarse.",
    "Código · Producto · Unidad · Precio (sin IVA) · IVA",
    ...s.products.map((p) => `${p.code} · ${p.name} · ${p.unit} · ${fmtEs(p.price)} € · ${p.vat}%`),
    `Condiciones de pago: ${s.paymentTerms}.`,
  ].join("\n");
}

async function main() {
  fs.mkdirSync(path.join(ROOT, "suppliers"), { recursive: true });
  for (const s of Object.values(SUPPLIERS)) {
    const master = {
      id: s.id,
      name: s.name,
      taxId: s.taxId,
      phoneOnFile: s.phone,
      ibanOnFile: s.ibanOnFile,
      paymentTerms: s.paymentTerms,
      tariff: {
        name: s.tariffName,
        validity: s.tariffValidity,
        products: s.products.map((p) => ({ code: p.code, name: p.name, unit: p.unit, price: p.price, vat: p.vat })),
      },
    };
    fs.writeFileSync(path.join(ROOT, "suppliers", `${s.id}.json`), JSON.stringify(master, null, 2) + "\n");
    fs.writeFileSync(path.join(ROOT, "suppliers", `${s.id}.tariff.txt`), tariffText(s) + "\n");
  }

  for (const c of CASES) {
    const s = SUPPLIERS[c.supplier];
    const dir = path.join(ROOT, "cases", c.id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, "history"), { recursive: true });

    const documents: { kind: string; file: string; mime: string; label: string }[] = [];
    if (c.po.format === "whatsapp") {
      fs.writeFileSync(path.join(dir, "po.txt"), (c.po.whatsapp ?? "") + "\n");
      documents.push({ kind: "po", file: "po.txt", mime: "text/plain", label: "Order (WhatsApp)" });
    } else {
      fs.writeFileSync(path.join(dir, "po.pdf"), await purchaseOrderPdf(c, s));
      documents.push({ kind: "po", file: "po.pdf", mime: "application/pdf", label: "Purchase order" });
    }
    if (c.delivery.format === "photo") {
      // The engine reads the photo (data/paper/<id>.jpg, made by `npm run assets` from this printed copy).
      fs.mkdirSync(PAPER, { recursive: true });
      fs.writeFileSync(path.join(PAPER, `${c.id}-printed.pdf`), await deliveryNotePdf(c, s));
      const photo = path.join(PAPER, `${c.id}.jpg`);
      if (fs.existsSync(photo)) fs.copyFileSync(photo, path.join(dir, "delivery.jpg"));
      else console.warn(`${c.id}: no photo yet, run npm run assets -- --photo`);
      documents.push({ kind: "delivery", file: "delivery.jpg", mime: "image/jpeg", label: "Delivery note (photo)" });
    } else {
      fs.writeFileSync(path.join(dir, "delivery.pdf"), await deliveryNotePdf(c, s));
      documents.push({ kind: "delivery", file: "delivery.pdf", mime: "application/pdf", label: "Delivery note" });
    }
    const inv = await invoicePdf(c, s);
    fs.writeFileSync(path.join(dir, "invoice.pdf"), inv.bytes);
    documents.push({ kind: "invoice", file: "invoice.pdf", mime: "application/pdf", label: "Invoice" });

    const history = c.history.map((h) => {
      const lines = h.sameAsCurrent ? c.invoice.lines : (h.lines ?? HISTORY_LINES[h.number] ?? []);
      const dn = h.sameAsCurrent ? c.delivery.number : `${c.delivery.number.slice(0, -2)}${String(10 + (h.number.length % 80)).padStart(2, "0")}`;
      const po = h.sameAsCurrent ? c.po.number : "—";
      const file = `history/${h.number}.txt`;
      fs.writeFileSync(path.join(dir, file), historyText(s, h.number, h.date, dn, po, lines, h.status) + "\n");
      return { number: h.number, date: h.date, status: h.status, file };
    });

    const manifest = {
      id: c.id,
      title: c.title,
      story: c.story,
      supplier: c.supplier,
      restaurant: RESTAURANT.name,
      documents,
      history,
    };
    fs.writeFileSync(path.join(dir, "case.json"), JSON.stringify(manifest, null, 2) + "\n");
    fs.writeFileSync(
      path.join(dir, "truth.json"),
      JSON.stringify(
        {
          id: c.id,
          verdict: c.expected.verdict,
          invoiceComputedTotal: inv.totals.total,
          invoicePrintedTotal: inv.printedTotal,
          planted: c.expected.planted,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`${c.id.padEnd(22)} total ${fmtEs(inv.printedTotal)} € · ${documents.length} documents · ${history.length} history`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
