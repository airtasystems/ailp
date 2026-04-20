import type { AilpAssessResponse, AilpClientOptions, AilpLogEntry, AilpProvider } from "./types.js";
/** Extra headers sent alongside a single `assess()` call (e.g. provider API keys). */
export interface AilpAssessHeaders {
    geminiApiKey?: string;
    openaiApiKey?: string;
}
/**
 * Build the provider-specific `X-*-Api-Key` header map for the chosen provider.
 * The Gemini/OpenAI key is sent only for its own provider.
 */
export declare function buildProviderAuthHeaders(provider: AilpProvider | undefined, auth: AilpAssessHeaders | undefined): Record<string, string>;
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
     * `entry.provider`. Throws an `AilpError` on non-2xx responses.
     */
    assess(entry: AilpLogEntry, authHeaders?: AilpAssessHeaders): Promise<AilpAssessResponse>;
    private _fetch;
}
export declare class AilpError extends Error {
    readonly status: number;
    readonly body: unknown;
    constructor(message: string, status: number, body: unknown);
}
//# sourceMappingURL=client.d.ts.map