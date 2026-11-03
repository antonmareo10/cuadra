// node scripts/live-check.mjs [baseUrl] [--offdomain]
//
// End-to-end check of the live API of a running server started with live runs on
// (npm run dev, or LIVE_RUNS=1 npm run start). Uploads the drinks case files as if they
// were the user's own, or with --offdomain an unrelated PDF as the "invoice", and prints
// the streamed events. Spends real credits (about 170, or about 15 with --offdomain).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const offDomain = args.includes("--offdomain");
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, "data", "cases", "drinks-vat-return");
const b64 = (f) => fs.readFileSync(f).toString("base64");

function tinyPdf(lines) {
  const content = ["BT", "/F1 12 Tf", "14 TL", "56 780 Td", ...lines.map((l, i) => (i ? `T* (${l}) Tj` : `(${l}) Tj`)), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, "latin1").toString("base64");
}

const body = offDomain
  ? {
      mode: "upload",
      supplierId: "ribera",
      documents: [
        {
          kind: "invoice",
          fileName: "recipe.pdf",
          mime: "application/pdf",
          data: tinyPdf(["Tortilla de patatas", "4 huevos, 3 patatas, media cebolla, aceite y sal.", "Freir las patatas a fuego lento y cuajar con el huevo."]),
        },
      ],
    }
  : {
      mode: "upload",
      supplierId: "ribera",
      documents: [
        { kind: "invoice", fileName: "invoice.pdf", mime: "application/pdf", data: b64(path.join(dir, "invoice.pdf")) },
        { kind: "delivery", fileName: "delivery.pdf", mime: "application/pdf", data: b64(path.join(dir, "delivery.pdf")) },
        { kind: "po", fileName: "po.pdf", mime: "application/pdf", data: b64(path.join(dir, "po.pdf")) },
      ],
    };

const t0 = Date.now();
const res = await fetch(`${base}/api/reconcile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
if (!res.ok) {
  console.error("HTTP", res.status, await res.text());
  process.exit(1);
}
const text = await res.text();
let calls = 0;
let firstCallAt = null;
for (const line of text.split("\n").filter(Boolean)) {
  const ev = JSON.parse(line);
  if (ev.type === "call") {
    calls++;
    firstCallAt ??= Date.now() - t0;
  } else if (ev.type === "step") console.log(`step ${ev.step.id.padEnd(9)} ${ev.step.status.padEnd(7)} ${ev.step.note}`);
  else if (ev.type === "error") console.log("error:", ev.message);
  else if (ev.type === "result") {
    const r = ev.result;
    console.log(`verdict ${r.verdict.kind} · pay ${r.verdict.payNow} · claim ${r.verdict.disputed} · ${r.issues.length} issues · ${calls} calls · ${r.totals.credits} credits`);
    for (const i of r.issues) console.log(`  [${i.cls}] ${i.type} ${i.amount} — ${i.title}`);
    if (r.errors.length) console.log("  errors:", r.errors.join(" | "));
  }
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
