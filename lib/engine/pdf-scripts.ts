import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFString,
  decodePDFRawStream,
  type PDFObject,
} from "pdf-lib";
import type { ScriptFinding } from "./types";

/**
 * Finds JavaScript embedded in a PDF without running it: document-level scripts
 * (Names → JavaScript), open actions, annotation and form actions. Every
 * dictionary with /S /JavaScript or a /JS entry counts. Launch actions are
 * reported too, since an invoice has no reason to start programs.
 *
 * Only what this returns is sent to Clocked Inspect; a PDF without scripts
 * needs no Inspect call at all.
 */
export async function findPdfScripts(pdfBase64: string): Promise<ScriptFinding[]> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(Buffer.from(pdfBase64, "base64"), {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
  } catch {
    return [];
  }
  const ctx = doc.context;
  const found: ScriptFinding[] = [];
  const seen = new Set<PDFObject>();

  const S = PDFName.of("S");
  const JS = PDFName.of("JS");
  const JAVASCRIPT = PDFName.of("JavaScript");
  const LAUNCH = PDFName.of("Launch");

  const readScript = (value: PDFObject | undefined): string | null => {
    const v = value instanceof PDFRef ? ctx.lookup(value) : value;
    if (v instanceof PDFString || v instanceof PDFHexString) return v.decodeText();
    if (v instanceof PDFRawStream) {
      try {
        return new TextDecoder("latin1").decode(decodePDFRawStream(v).decode());
      } catch {
        return null;
      }
    }
    return null;
  };

  const visit = (obj: PDFObject | undefined, where: string) => {
    if (!obj) return;
    const v = obj instanceof PDFRef ? ctx.lookup(obj) : obj;
    if (!v || seen.has(v)) return;
    seen.add(v);
    if (v instanceof PDFDict) {
      const kind = v.get(S);
      if (kind === JAVASCRIPT || v.has(JS)) {
        const script = readScript(v.get(JS));
        if (script && script.trim()) found.push({ location: where, script });
      } else if (kind === LAUNCH) {
        found.push({ location: `${where} (launch action)`, script: `/* PDF launch action */ ${v.toString().slice(0, 500)}` });
      }
      for (const [key, child] of v.entries()) visit(child, `${where}/${key.decodeText()}`);
    } else if (v instanceof PDFArray) {
      v.asArray().forEach((child, i) => visit(child, `${where}[${i}]`));
    }
  };

  for (const [ref, obj] of ctx.enumerateIndirectObjects()) visit(obj, `obj ${ref.objectNumber}`);
  return found;
}
