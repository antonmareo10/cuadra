import fs from "node:fs";
import path from "node:path";
import type { CaseInput, DocKind, InputDocument, SupplierMaster } from "./engine/types";

export const DATA_DIR = path.join(process.cwd(), "data");

export interface CaseManifest {
  id: string;
  title: string;
  story: string;
  supplier: string;
  restaurant: string;
  documents: { kind: DocKind; file: string; mime: InputDocument["mime"]; label: string }[];
  history: { number: string; date: string; status: string; file: string }[];
}

export function listCaseIds(): string[] {
  const dir = path.join(DATA_DIR, "cases");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, "case.json")))
    .sort();
}

export function loadManifest(id: string): CaseManifest {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Invalid case id");
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "cases", id, "case.json"), "utf8")) as CaseManifest;
}

export function loadSupplier(id: string): SupplierMaster {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Invalid supplier id");
  const master = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "suppliers", `${id}.json`), "utf8"));
  const tariffText = fs.readFileSync(path.join(DATA_DIR, "suppliers", `${id}.tariff.txt`), "utf8").trimEnd();
  return { ...master, tariffText } as SupplierMaster;
}

export function loadCase(id: string): CaseInput {
  const m = loadManifest(id);
  const dir = path.join(DATA_DIR, "cases", id);
  const documents: InputDocument[] = m.documents.map((d) => {
    const raw = fs.readFileSync(path.join(dir, d.file));
    return {
      kind: d.kind,
      label: d.label,
      fileName: d.file,
      mime: d.mime,
      data: d.mime === "text/plain" ? raw.toString("utf8").trimEnd() : raw.toString("base64"),
    };
  });
  const history = m.history.map((h) => ({
    number: h.number,
    date: h.date,
    status: h.status,
    text: fs.readFileSync(path.join(dir, h.file), "utf8").trimEnd(),
  }));
  return {
    id: m.id,
    title: m.title,
    story: m.story,
    restaurant: m.restaurant,
    supplier: loadSupplier(m.supplier),
    documents,
    history,
  };
}

export function loadTruth(id: string): {
  verdict: string;
  invoiceComputedTotal: number;
  invoicePrintedTotal: number;
  planted: { type: string; product?: string; amount: number; note: string }[];
} {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "cases", id, "truth.json"), "utf8"));
}
