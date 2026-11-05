// Types for cdp.mjs (used by the TypeScript asset scripts).
export function sleep(ms: number): Promise<void>;
export function findBrowser(): string;
export interface CdpBrowser {
  send(method: string, params?: Record<string, unknown>): Promise<any>;
  on(method: string, fn: (params: any) => void): void;
  evaluate(expression: string): Promise<any>;
  setViewport(w: number, h: number, mobile?: boolean): Promise<unknown>;
  goto(url: string, wait?: number): Promise<void>;
  theme(t: "light" | "dark"): Promise<void>;
  scrollTo(selectorOrY: string | number, ms?: number): Promise<void>;
  click(selector: string): Promise<boolean>;
  screenshot(file: string, opts?: { fullPage?: boolean }): Promise<void>;
  close(): Promise<void>;
}
export function launch(opts?: { width?: number; height?: number; port?: number }): Promise<CdpBrowser>;
