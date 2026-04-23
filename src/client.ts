import type {
  AilpAssessResponse,
  AilpAssessStreamEvent,
  AilpClientOptions,
  AilpLogEntry,
  AilpProvider,
} from "./types.js";

/**
 * Extra headers sent alongside a single `assess()` call.
 * - `apiKey` / `programId` are **required** by the AILP server (routed to
 *   `Airta-Api-Key` / `Airta-Program-Id`).
 * - `geminiApiKey` / `openaiApiKey` are forwarded as `X-*-Api-Key` only when
 *   the request's provider (or split experts/judge) names that vendor.
 */
export interface AilpAssessHeaders {
  /** AILP API key from ailp.airtasystems.com. Sent as `Airta-Api-Key`. */
  apiKey?: string;
  /** AIRTA Systems program ID. Sent as `Airta-Program-Id`. */
  programId?: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
}

function trimOrEmpty(v: string | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Build the full set of auth headers for an assess request:
 * - Always sends `Airta-Api-Key` / `Airta-Program-Id` when provided (both are
 *   required by the AILP server; non-empty values are forwarded verbatim).
 * - Sends `X-Gemini-Api-Key` / `X-OpenAI-Api-Key` for whichever provider the
 *   entry targets (experts and/or judge). When neither is set (server-side
 *   defaults), any non-empty LLM keys are forwarded so mixed pipelines work.
 */
export function buildProviderAuthHeaders(
  entry: Pick<AilpLogEntry, "provider" | "expertProvider" | "judgeProvider">,
  auth: AilpAssessHeaders | undefined,
): Record<string, string> {
  if (!auth) return {};
  const headers: Record<string, string> = {};

  const airtaApiKey = trimOrEmpty(auth.apiKey);
  if (airtaApiKey) headers["Airta-Api-Key"] = airtaApiKey;
  const airtaProgramId = trimOrEmpty(auth.programId);
  if (airtaProgramId) headers["Airta-Program-Id"] = airtaProgramId;

  const expertP = entry.expertProvider ?? entry.provider;
  const judgeP = entry.judgeProvider ?? entry.provider;
  const gemini = expertP === "gemini" || judgeP === "gemini";
  const openai = expertP === "openai" || judgeP === "openai";
  const geminiKey = trimOrEmpty(auth.geminiApiKey);
  const openaiKey = trimOrEmpty(auth.openaiApiKey);

  if (!gemini && !openai) {
    if (geminiKey) headers["X-Gemini-Api-Key"] = geminiKey;
    if (openaiKey) headers["X-OpenAI-Api-Key"] = openaiKey;
    return headers;
  }
  if (gemini && geminiKey) headers["X-Gemini-Api-Key"] = geminiKey;
  if (openai && openaiKey) headers["X-OpenAI-Api-Key"] = openaiKey;
  return headers;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

export interface AilpAssessStreamOptions {
  /** Invoked for each parsed NDJSON object (including `done`; not called after stream `error` throw). */
  onEvent?: (event: AilpAssessStreamEvent) => void;
}

/**
 * Parse the body of `POST /assess/stream` (NDJSON). Use with your own `fetch`
 * when you cannot use {@link AilpClient.assessStream} (e.g. a same-origin proxy).
 *
 * @throws {@link AilpError} on invalid JSON, missing `done`, or `event: "error"` from the server.
 */
export async function readAilpAssessNdjsonStream(
  body: ReadableStream<Uint8Array> | null,
  onEvent?: (event: AilpAssessStreamEvent) => void,
): Promise<AilpAssessResponse> {
  if (body == null) {
    throw new AilpError("Assess stream response had no body", 0, null);
  }
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let finalResult: AilpAssessResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop() ?? "";
    for (const raw of parts) {
      const line = raw.trim();
      if (!line) continue;
      let obj: unknown;
      try {
        obj = JSON.parse(line) as unknown;
      } catch {
        throw new AilpError("Invalid NDJSON line in assess stream", 0, { line });
      }
      if (!isRecord(obj) || typeof obj.event !== "string") {
        throw new AilpError("Assess stream line missing event field", 0, obj);
      }
      const ev = obj as AilpAssessStreamEvent;
      onEvent?.(ev);
      if (obj.event === "done") {
        const { event: _e, ...rest } = obj;
        finalResult = rest as unknown as AilpAssessResponse;
      }
      if (obj.event === "error") {
        const detail =
          typeof obj.detail === "string" ? obj.detail : "Assessment stream error";
        throw new AilpError(detail, 0, obj);
      }
    }
  }

  if (finalResult) return finalResult;
  throw new AilpError("Assess stream ended without a done event", 0, null);
}

export class AilpClient {
  private baseUrl: string;
  private timeoutMs: number | undefined;
  private headers: Record<string, string>;

  constructor(options: AilpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs;
    this.headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };
  }

  /** Check server liveness. Returns true if the server responded with status "ok". */
  async health(): Promise<boolean> {
    try {
      const res = await this._fetch("/health");
      const data = (await res.json()) as { status?: string };
      return data.status === "ok";
    } catch {
      return false;
    }
  }

  /**
   * Submit an LLM log entry for compliance risk assessment.
   *
   * `authHeaders` (optional) lets you pass provider API keys per request — the
   * right `X-Gemini-Api-Key` or `X-OpenAI-Api-Key` is selected based on
   * `entry` (including optional `expertProvider` / `judgeProvider`). Throws an `AilpError` on non-2xx responses.
   */
  async assess(
    entry: AilpLogEntry,
    authHeaders?: AilpAssessHeaders,
  ): Promise<AilpAssessResponse> {
    const extra = buildProviderAuthHeaders(entry, authHeaders);
    const res = await this._fetch("/assess", {
      method: "POST",
      body: JSON.stringify(entry),
      headers: extra,
    });

    const data = await res.json();

    if (!res.ok) {
      const detail =
        typeof data === "object" && data !== null && "detail" in data
          ? String((data as { detail: unknown }).detail)
          : res.statusText;
      throw new AilpError(`AILP assess failed (HTTP ${res.status}): ${detail}`, res.status, data);
    }

    return data as AilpAssessResponse;
  }

  /**
   * Same log entry as {@link AilpClient.assess}, but calls `POST /assess/stream`
   * and parses NDJSON until `done`. Optional `onEvent` receives progressive
   * `meta`, `cached`, `expert`, and `judge` lines for UI or logging.
   */
  async assessStream(
    entry: AilpLogEntry,
    authHeaders?: AilpAssessHeaders,
    options?: AilpAssessStreamOptions,
  ): Promise<AilpAssessResponse> {
    const extra = buildProviderAuthHeaders(entry, authHeaders);
    const res = await this._fetch("/assess/stream", {
      method: "POST",
      body: JSON.stringify(entry),
      headers: {
        ...extra,
        Accept: "application/x-ndjson, application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      let data: unknown = text;
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        /* keep text */
      }
      const detail =
        typeof data === "object" && data !== null && "detail" in data
          ? String((data as { detail: unknown }).detail)
          : typeof data === "string" && data.length > 0
            ? data
            : res.statusText;
      throw new AilpError(`AILP assess stream failed (HTTP ${res.status}): ${detail}`, res.status, data);
    }

    return readAilpAssessNdjsonStream(res.body, options?.onEvent);
  }

  private async _fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const controller = this.timeoutMs != null ? new AbortController() : null;
    const timer =
      controller != null
        ? setTimeout(() => controller.abort(), this.timeoutMs)
        : null;

    try {
      return await fetch(url, {
        ...init,
        headers: { ...this.headers, ...(init.headers as Record<string, string> | undefined) },
        signal: controller?.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new AilpError(`Request to ${path} timed out after ${this.timeoutMs}ms`, 0, null);
      }
      throw err;
    } finally {
      if (timer != null) clearTimeout(timer);
    }
  }
}

export class AilpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "AilpError";
  }
}
