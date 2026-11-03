import type { Endpoint } from "../clocked/client";

/** Endpoints a run used, counting the ones that ran inside a Pipeline (Guard, then Extract). */
export function endpointsUsed(list: Endpoint[]): Endpoint[] {
  const set = new Set(list);
  if (set.has("pipeline")) {
    set.add("injection");
    set.add("extract");
  }
  const order: Endpoint[] = ["pii", "script", "pipeline", "injection", "extract", "rerank", "compare", "grounding", "decide", "fill"];
  return order.filter((e) => set.has(e));
}
