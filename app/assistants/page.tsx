import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";
import { SiteFooter, SiteHeader } from "../components/Chrome";
import { Icon } from "../components/ui";

export const metadata: Metadata = {
  title: "Use Cuadra from an AI assistant · Cuadra",
  description: "Cuadra's MCP server lets Claude Desktop or any MCP client check a supplier invoice, explain a finding with its source lines and draft the claim to the supplier.",
};

const TOOLS = [
  {
    name: "check_documents",
    what: "Checks an invoice against the delivery note and the order: one of the sample cases by id, or your own files by path (PDF, a .txt WhatsApp export, or a photo of the delivery note).",
    how: "The same reconcile() the app runs: Protect, Inspect, Guard and Extract on each file, Rerank to match lines, the arithmetic in code, Compare, Verify, Decide and Fill. Returns the decision, every finding with the document and line it came from, the safety flags and the Clocked calls used.",
  },
  {
    name: "explain_finding",
    what: "One finding in full: the formula, each piece of evidence with its line, who found it (an endpoint or the arithmetic) and Decide's probabilities.",
    how: "Reads the run already made. It makes no new Clocked call: the evidence is in the run.",
  },
  {
    name: "draft_supplier_claim",
    what: "The email to the supplier and Verify's check of every claim in it, plus the amount to claim. On a held invoice it says to call the supplier on the number on file instead.",
    how: "The email is the one Fill wrote during the run. If the run has none, it says so. It never writes one of its own.",
  },
  {
    name: "list_sample_cases",
    what: "The six recorded sample cases with their supplier and verdict, so the assistant has something to try.",
    how: "Reads the recorded runs.",
  },
];

const CONFIG = `{
  "mcpServers": {
    "cuadra": {
      "command": "node",
      "args": ["C:/path/to/cuadra/mcp/cuadra-mcp.mjs"],
      "env": { "CUADRA_MCP_MODE": "replay" }
    }
  }
}`;

function Code({ children, label }: { children: string; label: string }) {
  return (
    <pre tabIndex={0} aria-label={label} className="overflow-x-auto rounded-xl bg-[#1b1a17] p-4 font-mono text-[12.5px] leading-relaxed text-[#f5f2ea]">
      {children}
    </pre>
  );
}

export default function AssistantsPage() {
  let transcript = "";
  try {
    transcript = fs.readFileSync(path.join(process.cwd(), "docs", "mcp-transcript.txt"), "utf8").trim();
  } catch {
    transcript = "";
  }
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-4xl px-4 pb-20 pt-8 sm:px-6 sm:pt-14">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-[14px] text-ink-2 hover:text-ink">
          <Icon name="back" /> Home
        </Link>
        <h1 className="mt-4 font-display text-[clamp(2.4rem,8vw,4rem)] leading-[1] tracking-[-0.01em]">Use Cuadra from your AI assistant</h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-2">
          Cuadra runs as an MCP server over stdio. Point Claude Desktop, or any client that speaks the Model Context Protocol, at it, and ask in plain
          words: &ldquo;check this invoice against the delivery note&rdquo;. The assistant gets Cuadra&apos;s answer, not its own guess: the decision, the lines
          each finding came from, and the same holds. It cannot approve an invoice Cuadra holds.
        </p>

        <section aria-labelledby="setup-h" className="mt-12">
          <h2 id="setup-h" className="text-2xl font-semibold tracking-tight">Set it up</h2>
          <ol className="mt-5 space-y-6 text-[15.5px] leading-relaxed text-ink-2">
            <li>
              <p>
                <span className="font-medium text-ink">1. Get the code.</span> Node 20.9 or later.
              </p>
              <div className="mt-2">
                <Code label="Install commands">{`git clone ${SITE.repo}\ncd cuadra\nnpm install`}</Code>
              </div>
            </li>
            <li>
              <p>
                <span className="font-medium text-ink">2. Add it to your client.</span> In Claude Desktop: Settings, Developer, Edit Config, then paste this into{" "}
                <span className="font-mono text-[13.5px]">claude_desktop_config.json</span> with the real path to the repository (on macOS, for example{" "}
                <span className="font-mono text-[13.5px]">/Users/you/cuadra/mcp/cuadra-mcp.mjs</span>).
              </p>
              <div className="mt-2">
                <Code label="Claude Desktop configuration">{CONFIG}</Code>
              </div>
            </li>
            <li>
              <p>
                <span className="font-medium text-ink">3. Restart the client and ask.</span> &ldquo;List Cuadra&apos;s sample cases&rdquo;, then &ldquo;check the meat
                invoice&rdquo;, &ldquo;explain the first finding&rdquo;, &ldquo;draft the claim to the supplier&rdquo;.
              </p>
            </li>
          </ol>
        </section>

        <section aria-labelledby="modes-h" className="mt-12 rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 id="modes-h" className="text-xl font-semibold tracking-tight">Replay or live</h2>
          <ul className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-2">
            <li>
              <span className="font-medium text-ink">Replay, no key.</span> With <span className="font-mono text-[13.5px]">CUADRA_MCP_MODE=replay</span>, or without a
              key, the server answers from the real Clocked recordings in the repository. The six sample cases work offline and cost nothing. Any other file
              gets a clear error, because nothing recorded can answer it.
            </li>
            <li>
              <span className="font-medium text-ink">Live, your key.</span> Remove that line and put <span className="font-mono text-[13.5px]">CLOCKED_API_KEY</span>{" "}
              in <span className="font-mono text-[13.5px]">env</span> (or in the repository&apos;s <span className="font-mono text-[13.5px]">.env.local</span>). Your own
              PDFs and photos are then checked live, with the same hard credit cap as the app (<span className="font-mono text-[13.5px]">CLOCKED_CREDIT_CAP</span>,
              6,000 by default): every call is checked against it before it is sent.
            </li>
          </ul>
        </section>

        <section aria-labelledby="tools-h" className="mt-12">
          <h2 id="tools-h" className="text-2xl font-semibold tracking-tight">The four tools</h2>
          <div className="mt-5 grid gap-4">
            {TOOLS.map((t) => (
              <article key={t.name} className="rounded-2xl border border-line bg-surface p-5">
                <h3 className="font-mono text-[15px] font-medium">{t.name}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{t.what}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{t.how}</p>
              </article>
            ))}
          </div>
        </section>

        {transcript ? (
          <section aria-labelledby="transcript-h" className="mt-12">
            <h2 id="transcript-h" className="text-2xl font-semibold tracking-tight">A real session</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
              Recorded with the SDK&apos;s own MCP client over stdio, in replay mode (<span className="font-mono text-[13.5px]">npm run mcp:demo</span>). These are the
              tool calls an assistant makes and exactly what it gets back.
            </p>
            <div className="mt-4">
              <Code label="MCP session transcript">{transcript}</Code>
            </div>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
