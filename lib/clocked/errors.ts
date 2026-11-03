/**
 * Errors raised by the Clocked client. The message never contains the API key
 * or request headers; it carries the HTTP status and the service's own error text.
 */
export type ClockedErrorKind =
  | "invalid_request" // 400 / 422: fix the request, never retried
  | "auth" // 401 / 403
  | "credits" // 402
  | "conflict" // 409
  | "too_large" // 413
  | "rate_limited" // 429 after the retry budget
  | "server" // 5xx after the retry budget
  | "network" // no HTTP answer after the retry budget
  | "budget" // refused locally by the credit cap, nothing was sent
  | "no_key" // CLOCKED_API_KEY is not set
  | "replay_miss"; // a recorded run has no answer for this request

export class ClockedError extends Error {
  readonly kind: ClockedErrorKind;
  readonly status: number | null;
  readonly endpoint: string;
  readonly retryAsNew: boolean;

  constructor(
    kind: ClockedErrorKind,
    endpoint: string,
    message: string,
    opts: { status?: number | null; retryAsNew?: boolean } = {},
  ) {
    super(message);
    this.name = "ClockedError";
    this.kind = kind;
    this.endpoint = endpoint;
    this.status = opts.status ?? null;
    this.retryAsNew = opts.retryAsNew ?? false;
  }

  /** Short, user-facing explanation with one next step. */
  get userMessage(): string {
    switch (this.kind) {
      case "invalid_request":
        return `Clocked refused the ${this.endpoint} request (${this.status}): ${this.message}`;
      case "auth":
        return "The Clocked API key was rejected. Check CLOCKED_API_KEY in .env.local.";
      case "credits":
        return "The Clocked account is out of credits. Nothing else will be sent.";
      case "conflict":
        return "Clocked reported a request conflict. Wait a moment and run again.";
      case "too_large":
        return "That document is too large for the API (about 2.5 MB per PDF). Try a smaller file.";
      case "rate_limited":
        return "Clocked is busy for this account (concurrency limit). Try again in a minute.";
      case "server":
        return "Clocked had a temporary problem. The run stopped safely; try again.";
      case "network":
        return "Could not reach Clocked. Check the connection and try again.";
      case "budget":
        return "The local credit cap was reached, so the request was not sent.";
      case "no_key":
        return "Live runs need a Clocked API key on the server. Recorded runs still work.";
      case "replay_miss":
        return "This recorded run does not contain that request. Re-record it with npm run record.";
    }
  }
}

export function kindForStatus(status: number): ClockedErrorKind {
  if (status === 400 || status === 422) return "invalid_request";
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "credits";
  if (status === 409) return "conflict";
  if (status === 413) return "too_large";
  if (status === 429) return "rate_limited";
  return "server";
}
