import { liveStatus } from "@/lib/live-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether live runs are available. Never reveals anything about the key itself. */
export function GET() {
  return Response.json(liveStatus(), { headers: { "Cache-Control": "no-store" } });
}
