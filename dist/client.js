/**
 * Build the provider-specific `X-*-Api-Key` header map for the chosen provider.
 * The Gemini/OpenAI key is sent only for its own provider.
 */
export function buildProviderAuthHeaders(provider, auth) {
    if (!auth)
        return {};
    const headers = {};
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
    constructor(options) {
        this.baseUrl = options.baseUrl.replace(/\/$/, "");
        this.timeoutMs = options.timeoutMs;
        this.headers = {
            "Content-Type": "application/json",
            ...options.headers,
        };
    }
    /** Check server liveness. Returns true if the server responded with status "ok". */
    async health() {
        try {
            const res = await this._fetch("/health");
            const data = (await res.json());
            return data.status === "ok";
        }
        catch {
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
    async assess(entry, authHeaders) {
        const extra = buildProviderAuthHeaders(entry.provider, authHeaders);
        const res = await this._fetch("/assess", {
            method: "POST",
            body: JSON.stringify(entry),
            headers: extra,
        });
        const data = await res.json();
        if (!res.ok) {
            const detail = typeof data === "object" && data !== null && "detail" in data
                ? String(data.detail)
                : res.statusText;
            throw new AilpError(`AILP assess failed (HTTP ${res.status}): ${detail}`, res.status, data);
        }
        return data;
    }
    async _fetch(path, init = {}) {
        const url = `${this.baseUrl}${path}`;
        const controller = this.timeoutMs != null ? new AbortController() : null;
        const timer = controller != null
            ? setTimeout(() => controller.abort(), this.timeoutMs)
            : null;
        try {
            return await fetch(url, {
                ...init,
                headers: { ...this.headers, ...init.headers },
                signal: controller?.signal,
            });
        }
        catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
                throw new AilpError(`Request to ${path} timed out after ${this.timeoutMs}ms`, 0, null);
            }
            throw err;
        }
        finally {
            if (timer != null)
                clearTimeout(timer);
        }
    }
}
export class AilpError extends Error {
    constructor(message, status, body) {
        super(message);
        this.status = status;
        this.body = body;
        this.name = "AilpError";
    }
}
//# sourceMappingURL=client.js.map