/// <reference types="node" />
/**
 * React hooks for AILP assess.
 * Import from "@airtasystems/ailp/react" to keep React out of the main bundle.
 *
 * @example Recommended — env-driven Next.js / Vite (no useMemo boilerplate)
 * import { useAilp } from "@airtasystems/ailp/react";
 *
 * function ChatWidget() {
 *   const { assess, result, loading, error, reset } = useAilp();
 *   // ...
 * }
 *
 * @example Advanced — reuse an existing AilpFn
 * import { createAilp } from "@airtasystems/ailp";
 * import { useAssess } from "@airtasystems/ailp/react";
 *
 * const ailp = createAilp({ apiKey, programId, frameworks });
 * const { assess, result, loading, error } = useAssess(ailp);
 */
import { useCallback, useMemo, useState } from "react";
import { AILP_DEFAULT_BASE_URL } from "./constants.js";
import { createAilp } from "./ailp.js";
const PROVIDER_VALUES = ["gemini", "openai"];
function coerceProvider(raw) {
    if (raw == null)
        return undefined;
    const t = raw.trim().toLowerCase().replace(/-/g, "_");
    if (t === "")
        return undefined;
    // Map "google" -> "gemini" as a friendly alias.
    if (t === "google")
        return "gemini";
    return PROVIDER_VALUES.includes(t) ? t : undefined;
}
function readNextPublicEnv() {
    return {
        baseUrl: process.env.NEXT_PUBLIC_AILP_BASE_URL,
        apiKey: process.env.NEXT_PUBLIC_AILP_API_KEY,
        programId: process.env.NEXT_PUBLIC_AIRTASYSTEMS_PROGRAM_ID,
        frameworks: process.env.NEXT_PUBLIC_AILP_FRAMEWORKS,
        provider: process.env.NEXT_PUBLIC_AILP_PROVIDER,
        geminiApiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY,
        openaiApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
    };
}
function readViteEnv() {
    // Next.js has `import.meta` but not `import.meta.env` — optional chaining avoids a throw.
    return {
        baseUrl: import.meta.env?.VITE_AILP_BASE_URL,
        apiKey: import.meta.env?.VITE_AILP_API_KEY,
        programId: import.meta.env?.VITE_AIRTASYSTEMS_PROGRAM_ID,
        frameworks: import.meta.env?.VITE_AILP_FRAMEWORKS,
        provider: import.meta.env?.VITE_AILP_PROVIDER,
        geminiApiKey: import.meta.env?.VITE_GEMINI_API_KEY,
        openaiApiKey: import.meta.env?.VITE_OPENAI_API_KEY,
    };
}
function nonempty(v) {
    if (v == null || v === "")
        return undefined;
    return v;
}
/**
 * Parse framework list from env. Handles:
 * - JSON: `["eu-ai-act","owasp-llm"]` (double quotes)
 * - JS-style (common in .env): `['eu-ai-act']` — **not** valid JSON; we normalize
 * - Bracket list without strict JSON: `[eu-ai-act]`, `[ eu-ai-act , owasp-llm ]`
 * - Plain CSV: `eu-ai-act,owasp-llm`
 */
export function parseFrameworksFromEnv(raw) {
    if (raw == null || raw.trim() === "")
        return undefined;
    const t = raw.trim();
    if (t.startsWith("[")) {
        try {
            const j = JSON.parse(t);
            if (Array.isArray(j) && j.every((x) => typeof x === "string")) {
                return j.length > 0 ? j : undefined;
            }
        }
        catch {
            /* fall through */
        }
        try {
            const j = JSON.parse(t.replace(/'/g, '"'));
            if (Array.isArray(j) && j.every((x) => typeof x === "string")) {
                return j.length > 0 ? j : undefined;
            }
        }
        catch {
            /* fall through */
        }
        if (t.endsWith("]")) {
            const inner = t.slice(1, -1).trim();
            if (inner.length > 0) {
                const parts = inner
                    .split(",")
                    .map((s) => s.trim().replace(/^['"]+|['"]+$/g, ""))
                    .filter(Boolean);
                if (parts.length > 0)
                    return parts;
            }
        }
    }
    const comma = t.split(",").map((s) => s.trim()).filter(Boolean);
    return comma.length > 0 ? comma : undefined;
}
/**
 * Resolve config from optional overrides + environment variables.
 *
 * - `apiKey` and `programId` are **required** (get both at ailp.airtasystems.com).
 * - `provider` is omitted when neither override nor env sets it — the server uses
 *   its configured expert/judge pipeline and no client provider key is required.
 * - When `provider` / `expertProvider` / `judgeProvider` explicitly name `gemini`
 *   or `openai`, the matching API key must be supplied (env or override).
 */
export function resolveAilpConfigFromEnv(overrides) {
    const next = readNextPublicEnv();
    const vite = readViteEnv();
    const baseUrl = overrides?.baseUrl ??
        nonempty(next.baseUrl) ??
        nonempty(vite.baseUrl) ??
        AILP_DEFAULT_BASE_URL;
    const apiKeyRaw = overrides?.apiKey ??
        nonempty(next.apiKey) ??
        nonempty(vite.apiKey);
    const apiKey = apiKeyRaw != null ? String(apiKeyRaw).trim() : "";
    if (apiKey === "") {
        throw new Error("AILP: missing `apiKey`. Get a key at https://ailp.airtasystems.com and set NEXT_PUBLIC_AILP_API_KEY (Next.js) or VITE_AILP_API_KEY (Vite), or pass `apiKey` to useAilp(). Restart the dev server after changing env so it is inlined. Security: browser-exposed keys are public — prefer calling AILP from a server route.");
    }
    const programIdRaw = overrides?.programId ??
        nonempty(next.programId) ??
        nonempty(vite.programId);
    const programId = programIdRaw != null ? String(programIdRaw).trim() : "";
    if (programId === "") {
        throw new Error("AILP: missing `programId`. Copy your program ID from ailp.airtasystems.com and set NEXT_PUBLIC_AIRTASYSTEMS_PROGRAM_ID (Next.js) or VITE_AIRTASYSTEMS_PROGRAM_ID (Vite), or pass `programId` to useAilp().");
    }
    let frameworks;
    if (overrides?.frameworks != null) {
        frameworks = overrides.frameworks;
    }
    else {
        const raw = nonempty(next.frameworks) ?? nonempty(vite.frameworks);
        frameworks = parseFrameworksFromEnv(raw) ?? ["eu-ai-act"];
    }
    const provider = overrides?.provider ??
        coerceProvider(next.provider) ??
        coerceProvider(vite.provider);
    const expertProvider = overrides?.expertProvider ?? provider;
    const judgeProvider = overrides?.judgeProvider ?? provider;
    const geminiApiKey = overrides?.geminiApiKey ??
        nonempty(next.geminiApiKey) ??
        nonempty(vite.geminiApiKey);
    const openaiApiKey = overrides?.openaiApiKey ??
        nonempty(next.openaiApiKey) ??
        nonempty(vite.openaiApiKey);
    if ((expertProvider === "gemini" || judgeProvider === "gemini") &&
        (geminiApiKey == null || geminiApiKey.trim() === "")) {
        throw new Error("AILP: missing Gemini API key (experts and/or judge use Gemini). Set NEXT_PUBLIC_GEMINI_API_KEY (or VITE_GEMINI_API_KEY), pass geminiApiKey to useAilp(), or adjust expertProvider/judgeProvider. If the AILP server holds keys, omit NEXT_PUBLIC_AILP_PROVIDER (and split provider env vars) so the client does not assert a vendor. Restart the dev server after changing env so it is inlined (Next.js).");
    }
    if ((expertProvider === "openai" || judgeProvider === "openai") &&
        (openaiApiKey == null || openaiApiKey.trim() === "")) {
        throw new Error("AILP: missing OpenAI API key (experts and/or judge use OpenAI). Set NEXT_PUBLIC_OPENAI_API_KEY (or VITE_OPENAI_API_KEY), pass openaiApiKey to useAilp(), or adjust expertProvider/judgeProvider. If the AILP server holds keys, omit NEXT_PUBLIC_AILP_PROVIDER (and split provider env vars) so the client does not assert a vendor. Restart the dev server after changing env so it is inlined (Next.js).");
    }
    return {
        baseUrl: baseUrl.replace(/\/$/, ""),
        apiKey,
        programId,
        frameworks,
        provider,
        expertProvider,
        judgeProvider,
        geminiApiKey,
        openaiApiKey,
        timeoutMs: overrides?.timeoutMs,
    };
}
function frameworksDepKey(fw) {
    if (fw === undefined)
        return "__env__";
    return Array.isArray(fw) ? JSON.stringify(fw) : String(fw);
}
/**
 * One-liner for React apps: memoized `createAilp` + assessment state.
 * Reads `NEXT_PUBLIC_*` (Next.js) or `VITE_*` (Vite) when options are omitted.
 *
 * Env vars:
 * - `NEXT_PUBLIC_AILP_API_KEY` / `VITE_AILP_API_KEY` — **required** (ailp.airtasystems.com)
 * - `NEXT_PUBLIC_AIRTASYSTEMS_PROGRAM_ID` / `VITE_AIRTASYSTEMS_PROGRAM_ID` — **required**
 * - `NEXT_PUBLIC_AILP_BASE_URL` / `VITE_AILP_BASE_URL` — omit to use `AILP_DEFAULT_BASE_URL` (`https://ailp.airtasystems.com/ailp`, no trailing slash)
 * - `NEXT_PUBLIC_AILP_PROVIDER` / `VITE_AILP_PROVIDER` — omit to let the **server** use its configured expert/judge (no browser LLM key). Set to `gemini` or `openai` only when the client must send `X-*-Api-Key` headers.
 * - `NEXT_PUBLIC_GEMINI_API_KEY` / `VITE_GEMINI_API_KEY` — required when provider (or split experts/judge) uses `gemini`
 * - `NEXT_PUBLIC_OPENAI_API_KEY` / `VITE_OPENAI_API_KEY` — required when provider (or split experts/judge) uses `openai`
 * - `NEXT_PUBLIC_AILP_FRAMEWORKS` / `VITE_AILP_FRAMEWORKS` — comma-separated or JSON array; default `eu-ai-act`
 *
 * Security note: `NEXT_PUBLIC_*` / `VITE_*` variables are baked into the browser
 * bundle. Do not ship real LLM API keys in client code — call AILP from a server
 * route (or your own proxy) that reads keys from a non-public env var.
 */
export function useAilp(options) {
    const baseUrl = options?.baseUrl;
    const apiKey = options?.apiKey;
    const programId = options?.programId;
    const frameworks = options?.frameworks;
    const timeoutMs = options?.timeoutMs;
    const provider = options?.provider;
    const expertProvider = options?.expertProvider;
    const judgeProvider = options?.judgeProvider;
    const geminiApiKey = options?.geminiApiKey;
    const openaiApiKey = options?.openaiApiKey;
    const config = useMemo(() => resolveAilpConfigFromEnv({
        baseUrl,
        apiKey,
        programId,
        frameworks,
        timeoutMs,
        provider,
        expertProvider,
        judgeProvider,
        geminiApiKey,
        openaiApiKey,
    }), [
        baseUrl,
        apiKey,
        programId,
        frameworksDepKey(frameworks),
        timeoutMs,
        provider,
        expertProvider,
        judgeProvider,
        geminiApiKey,
        openaiApiKey,
    ]);
    const ailp = useMemo(() => createAilp(config), [config]);
    const state = useAssess(ailp);
    return { ...state, ailp };
}
export function useAssess(ailp) {
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const assess = useCallback(async (messages, output, callOptions) => {
        setResult(null);
        setError(null);
        setLoading(true);
        try {
            const res = await ailp(messages, output, callOptions);
            setResult(res);
            return res;
        }
        catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            setError(e);
            return null;
        }
        finally {
            setLoading(false);
        }
    }, [ailp]);
    const reset = useCallback(() => {
        setResult(null);
        setError(null);
    }, []);
    return { result, loading, error, assess, reset };
}
export { AILP_DEFAULT_BASE_URL } from "./constants.js";
//# sourceMappingURL=react.js.map