import type {
  AilpAssessResponse,
  AilpClientOptions,
  AilpLogEntry,
  AilpProvider,
} from "./types.js";

/** Extra headers sent alongside a single `assess()` call (e.g. provider API keys). */
export interface AilpAssessHeaders {
  geminiApiKey?: string;
  openaiApiKey?: string;
}

/**
 * Build the provider-specific `X-*-Api-Key` header map for the chosen provider.
 * The Gemini/OpenAI key is sent only for its own provider.
 */
export function buildProviderAuthHeaders(
  provider: AilpProvider | undefined,
  auth: AilpAssessHeaders | undefined,
): Record<string, string> {
  if (!auth) return {};
  const headers: Record<string, string> = {};
  const p = provider ?? "gemini";
  if (p === "gemini" && auth.geminiApiKey && auth.geminiApiKey.trim() !== "") {
    headers["X-Gemini-Api-Key"] = auth.geminiApiKey.trim();
  }
  if (p === "openai" && auth.openaiApiKey && auth.openaiApiKey.trim() !== "") {
    headers["X-OpenAI-Api-Key"] = auth.openaiApiKey.trim();
  }
  return headers;
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
   * `entry.provider`. Throws an `AilpError` on non-2xx responses.
   */
  async assess(
    entry: AilpLogEntry,
    authHeaders?: AilpAssessHeaders,
  ): Promise<AilpAssessResponse> {
    const extra = buildProviderAuthHeaders(entry.provider, authHeaders);
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
