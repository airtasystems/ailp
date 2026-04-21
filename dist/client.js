/**
 * Build `X-*-Api-Key` headers for an assess request. Sends **both** keys when
 * experts and judge use different vendors (`expertProvider` / `judgeProvider`).
 * When `provider` and split fields are all omitted (server uses `.config` defaults),
 * sends any non-empty keys from `auth` so mixed pipelines still work.
 */
export function buildProviderAuthHeaders(entry, auth) {
    if (!auth)
        return {};
    const headers = {};
    const expertP = entry.expertProvider ?? entry.provider;
    const judgeP = entry.judgeProvider ?? entry.provider;
    const gemini = expertP === "gemini" || judgeP === "gemini";
    const openai = expertP === "openai" || judgeP === "openai";
    if (!gemini && !openai) {
        if (auth.geminiApiKey && auth.geminiApiKey.trim() !== "") {
            headers["X-Gemini-Api-Key"] = auth.geminiApiKey.trim();
        }
        if (auth.openaiApiKey && auth.openaiApiKey.trim() !== "") {
            headers["X-OpenAI-Api-Key"] = auth.openaiApiKey.trim();
        }
        return headers;
    }
    if (gemini && auth.geminiApiKey && auth.geminiApiKey.trim() !== "") {
        headers["X-Gemini-Api-Key"] = auth.geminiApiKey.trim();
    }
    if (openai && auth.openaiApiKey && auth.openaiApiKey.trim() !== "") {
        headers["X-OpenAI-Api-Key"] = auth.openaiApiKey.trim();
    }
    return headers;
}
function isRecord(x) {
    return typeof x === "object" && x !== null;
}
/**
 * Parse the body of `POST /assess/stream` (NDJSON). Use with your own `fetch`
 * when you cannot use {@link AilpClient.assessStream} (e.g. a same-origin proxy).
 *
 * @throws {@link AilpError} on invalid JSON, missing `done`, or `event: "error"` from the server.
 */
export async function readAilpAssessNdjsonStream(body, onEvent) {
    if (body == null) {
        throw new AilpError("Assess stream response had no body", 0, null);
    }
    const reader = body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let finalResult = null;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() ?? "";
        for (const raw of parts) {
            const line = raw.trim();
            if (!line)
                continue;
            let obj;
            try {
                obj = JSON.parse(line);
            }
            catch {
                throw new AilpError("Invalid NDJSON line in assess stream", 0, { line });
            }
            if (!isRecord(obj) || typeof obj.event !== "string") {
                throw new AilpError("Assess stream line missing event field", 0, obj);
            }
            const ev = obj;
            onEvent?.(ev);
            if (obj.event === "done") {
                const { event: _e, ...rest } = obj;
                finalResult = rest;
            }
            if (obj.event === "error") {
                const detail = typeof obj.detail === "string" ? obj.detail : "Assessment stream error";
                throw new AilpError(detail, 0, obj);
            }
        }
    }
    if (finalResult)
        return finalResult;
    throw new AilpError("Assess stream ended without a done event", 0, null);
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
     * `entry` (including optional `expertProvider` / `judgeProvider`). Throws an `AilpError` on non-2xx responses.
     */
    async assess(entry, authHeaders) {
        const extra = buildProviderAuthHeaders(entry, authHeaders);
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
    /**
     * Same log entry as {@link AilpClient.assess}, but calls `POST /assess/stream`
     * and parses NDJSON until `done`. Optional `onEvent` receives progressive
     * `meta`, `cached`, `expert`, and `judge` lines for UI or logging.
     */
    async assessStream(entry, authHeaders, options) {
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
            let data = text;
            try {
                data = JSON.parse(text);
            }
            catch {
                /* keep text */
            }
            const detail = typeof data === "object" && data !== null && "detail" in data
                ? String(data.detail)
                : typeof data === "string" && data.length > 0
                    ? data
                    : res.statusText;
            throw new AilpError(`AILP assess stream failed (HTTP ${res.status}): ${detail}`, res.status, data);
        }
        return readAilpAssessNdjsonStream(res.body, options?.onEvent);
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