import type { AilpAssessResponse, AilpAssessStreamEvent, AilpClientOptions, AilpLogEntry } from "./types.js";
/** Extra headers sent alongside a single `assess()` call (e.g. provider API keys). */
export interface AilpAssessHeaders {
    geminiApiKey?: string;
    openaiApiKey?: string;
}
/**
 * Build `X-*-Api-Key` headers for an assess request. Sends **both** keys when
 * experts and judge use different vendors (`expertProvider` / `judgeProvider`).
 * When `provider` and split fields are all omitted (server uses `.config` defaults),
 * sends any non-empty keys from `auth` so mixed pipelines still work.
 */
export declare function buildProviderAuthHeaders(entry: Pick<AilpLogEntry, "provider" | "expertProvider" | "judgeProvider">, auth: AilpAssessHeaders | undefined): Record<string, string>;
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
export declare function readAilpAssessNdjsonStream(body: ReadableStream<Uint8Array> | null, onEvent?: (event: AilpAssessStreamEvent) => void): Promise<AilpAssessResponse>;
export declare class AilpClient {
    private baseUrl;
    private timeoutMs;
    private headers;
    constructor(options: AilpClientOptions);
    /** Check server liveness. Returns true if the server responded with status "ok". */
    health(): Promise<boolean>;
    /**
     * Submit an LLM log entry for compliance risk assessment.
     *
     * `authHeaders` (optional) lets you pass provider API keys per request — the
     * right `X-Gemini-Api-Key` or `X-OpenAI-Api-Key` is selected based on
     * `entry` (including optional `expertProvider` / `judgeProvider`). Throws an `AilpError` on non-2xx responses.
     */
    assess(entry: AilpLogEntry, authHeaders?: AilpAssessHeaders): Promise<AilpAssessResponse>;
    /**
     * Same log entry as {@link AilpClient.assess}, but calls `POST /assess/stream`
     * and parses NDJSON until `done`. Optional `onEvent` receives progressive
     * `meta`, `cached`, `expert`, and `judge` lines for UI or logging.
     */
    assessStream(entry: AilpLogEntry, authHeaders?: AilpAssessHeaders, options?: AilpAssessStreamOptions): Promise<AilpAssessResponse>;
    private _fetch;
}
export declare class AilpError extends Error {
    readonly status: number;
    readonly body: unknown;
    constructor(message: string, status: number, body: unknown);
}
//# sourceMappingURL=client.d.ts.map