import { admit, buildInput, liveStatus, runLive, type SampleBody, type UploadBody } from "@/lib/live-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Streams a live reconciliation as NDJSON events: step, call, result, error. */
export async function POST(req: Request) {
  const status = liveStatus();
  if (!status.live) return Response.json({ error: status.reason }, { status: 503 });

  let body: UploadBody | SampleBody;
  try {
    body = (await req.json()) as UploadBody | SampleBody;
  } catch {
    return Response.json({ error: "Send JSON." }, { status: 400 });
  }
  let input;
  try {
    input = buildInput(body);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Invalid request." }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const refusal = admit(ip);
  if (refusal) return Response.json({ error: refusal }, { status: 429 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: unknown) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runLive(input, send);
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "The run failed." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
