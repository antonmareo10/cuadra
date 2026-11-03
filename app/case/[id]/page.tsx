import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { RunResult } from "@/lib/engine/types";
import { SiteFooter, SiteHeader } from "../../components/Chrome";
import { Workspace } from "../../components/workspace/Workspace";

const RUNS = path.join(process.cwd(), "public", "runs");

function loadRun(id: string): RunResult | null {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  const file = path.join(RUNS, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as RunResult;
}

export function generateStaticParams() {
  if (!fs.existsSync(RUNS)) return [];
  return fs
    .readdirSync(RUNS)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => ({ id: f.replace(/\.json$/, "") }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const run = loadRun(id);
  return { title: run ? `${run.title} · Cuadra` : "Case · Cuadra", description: run?.story };
}

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = loadRun(id);
  if (!run) notFound();
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Workspace run={run} />
      </main>
      <SiteFooter />
    </>
  );
}
