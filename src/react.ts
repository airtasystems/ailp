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
 * const ailp = createAilp({ baseUrl, programId, frameworks });
 * const { assess, result, loading, error } = useAssess(ailp);
 */
import { useCallback, useMemo, useState } from "react";
import { createAilp } from "./ailp.js";
import type { AilpFn } from "./ailp.js";
import type {
  AilpAssessResponse,
  AilpCallOptions,
  AilpFrameworkSlug,
  AilpMessage,
  AilpOptions,
  AilpProvider,
} from "./types.js";

const PROVIDER_VALUES: readonly AilpProvider[] = ["gemini", "openai"];

function coerceProvider(raw: string | undefined): AilpProvider | undefined {
  if (raw == null) return undefined;
  const t = raw.trim().toLowerCase().replace(/-/g, "_");
  if (t === "") return undefined;
  // Map "google" -> "gemini" as a friendly alias.
  if (t === "google") return "gemini";
  return (PROVIDER_VALUES as readonly string[]).includes(t) ? (t as AilpProvider) : undefined;
}

// -------------------------------------------------------------------------
// Env helpers (Next.js NEXT_PUBLIC_*, Vite VITE_*)
// -------------------------------------------------------------------------
//
// Next.js (and similar) only inlines **static** `process.env.NEXT_PUBLIC_*` at
// build time. Dynamic access like `process.env[key]` is never replaced, so
// values are undefined in the browser — use explicit property names below.

interface EnvBag {
  baseUrl: string | undefined;
  programId: string | undefined;
  frameworks: string | undefined;
  provider: string | undefined;
  geminiApiKey: string | undefined;
  openaiApiKey: string | undefined;
}

function readNextPublicEnv(): EnvBag {
  return {
    baseUrl: process.env.NEXT_PUBLIC_AILP_BASE_URL,
    programId: process.env.NEXT_PUBLIC_AIRTASYSTEMS_PROGRAM_ID,
    frameworks: process.env.NEXT_PUBLIC_AILP_FRAMEWORKS,
    provider: process.env.NEXT_PUBLIC_AILP_PROVIDER,
    geminiApiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY,
    openaiApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  };
}

function readViteEnv(): EnvBag {
  // Next.js has `import.meta` but not `import.meta.env` — optional chaining avoids a throw.
  return {
    baseUrl: import.meta.env?.VITE_AILP_BASE_URL,
    programId: import.meta.env?.VITE_AIRTASYSTEMS_PROGRAM_ID,
    frameworks: import.meta.env?.VITE_AILP_FRAMEWORKS,
    provider: import.meta.env?.VITE_AILP_PROVIDER,
    geminiApiKey: import.meta.env?.VITE_GEMINI_API_KEY,
    openaiApiKey: import.meta.env?.VITE_OPENAI_API_KEY,
  };
}

function nonempty(v: string | undefined): string | undefined {
  if (v == null || v === "") return undefined;
  return v;
}

/**
 * Parse framework list from env. Handles:
 * - JSON: `["eu-ai-act","owasp-llm"]` (double quotes)
 * - JS-style (common in .env): `['eu-ai-act']` — **not** valid JSON; we normalize
 * - Bracket list without strict JSON: `[eu-ai-act]`, `[ eu-ai-act , owasp-llm ]`
 * - Plain CSV: `eu-ai-act,owasp-llm`
 */
export function parseFrameworksFromEnv(raw: string | undefined): AilpFrameworkSlug[] | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const t = raw.trim();

  if (t.startsWith("[")) {
    try {
      const j = JSON.parse(t) as unknown;
      if (Array.isArray(j) && j.every((x) => typeof x === "string")) {
        return j.length > 0 ? (j as AilpFrameworkSlug[]) : undefined;
      }
    } catch {
      /* fall through */
    }
    try {
      const j = JSON.parse(t.replace(/'/g, '"')) as unknown;
      if (Array.isArray(j) && j.every((x) => typeof x === "string")) {
        return j.length > 0 ? (j as AilpFrameworkSlug[]) : undefined;
      }
    } catch {
      /* fall through */
    }
    if (t.endsWith("]")) {
      const inner = t.slice(1, -1).trim();
      if (inner.length > 0) {
        const parts = inner
          .split(",")
          .map((s) => s.trim().replace(/^['"]+|['"]+$/g, ""))
          .filter(Boolean);
        if (parts.length > 0) return parts as AilpFrameworkSlug[];
      }
    }
  }

  const comma = t.split(",").map((s) => s.trim()).filter(Boolean);
  return comma.length > 0 ? (comma as AilpFrameworkSlug[]) : undefined;
}

/**
 * Resolve config from optional overrides + environment variables.
 *
 * - `programId` is optional; omitted from the payload if unset.
 * - `provider` defaults to `"gemini"` if neither override nor env specifies one.
 * - Throws if the resolved provider requires an API key that was not supplied.
 */
export function resolveAilpConfigFromEnv(overrides?: Partial<AilpOptions>): AilpOptions {
  const next = readNextPublicEnv();
  const vite = readViteEnv();

  const baseUrl =
    overrides?.baseUrl ??
    nonempty(next.baseUrl) ??
    nonempty(vite.baseUrl) ??
    "http://127.0.0.1:8000";

  const programIdRaw =
    overrides?.programId ??
    nonempty(next.programId) ??
    nonempty(vite.programId);
  const programId =
    programIdRaw != null && String(programIdRaw).trim() !== ""
      ? String(programIdRaw).trim()
      : undefined;

  let frameworks: AilpFrameworkSlug | AilpFrameworkSlug[];
  if (overrides?.frameworks != null) {
    frameworks = overrides.frameworks;
  } else {
    const raw = nonempty(next.frameworks) ?? nonempty(vite.frameworks);
    frameworks = parseFrameworksFromEnv(raw) ?? ["eu-ai-act"];
  }

  const provider: AilpProvider =
    overrides?.provider ??
    coerceProvider(next.provider) ??
    coerceProvider(vite.provider) ??
    "gemini";

  const geminiApiKey =
    overrides?.geminiApiKey ??
    nonempty(next.geminiApiKey) ??
    nonempty(vite.geminiApiKey);

  const openaiApiKey =
    overrides?.openaiApiKey ??
    nonempty(next.openaiApiKey) ??
    nonempty(vite.openaiApiKey);

  if (provider === "gemini" && (geminiApiKey == null || geminiApiKey.trim() === "")) {
    throw new Error(
      "AILP: missing Gemini API key. Set NEXT_PUBLIC_GEMINI_API_KEY (or VITE_GEMINI_API_KEY), pass geminiApiKey to useAilp(), or switch provider. Restart the dev server after changing env so it is inlined (Next.js).",
    );
  }
  if (provider === "openai" && (openaiApiKey == null || openaiApiKey.trim() === "")) {
    throw new Error(
      "AILP: missing OpenAI API key. Set NEXT_PUBLIC_OPENAI_API_KEY (or VITE_OPENAI_API_KEY), pass openaiApiKey to useAilp(), or switch provider. Restart the dev server after changing env so it is inlined (Next.js).",
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    programId,
    frameworks,
    provider,
    geminiApiKey,
    openaiApiKey,
    timeoutMs: overrides?.timeoutMs,
  };
}

function frameworksDepKey(
  fw: AilpFrameworkSlug | AilpFrameworkSlug[] | undefined,
): string {
  if (fw === undefined) return "__env__";
  return Array.isArray(fw) ? JSON.stringify(fw) : String(fw);
}

// -------------------------------------------------------------------------
// useAilp — createAilp + useAssess + env defaults
// -------------------------------------------------------------------------

/** Optional overrides; omitted fields are read from env (see README). */
export type UseAilpOptions = Partial<AilpOptions>;

export type UseAilpResult = UseAssessState & { ailp: AilpFn };

/**
 * One-liner for React apps: memoized `createAilp` + assessment state.
 * Reads `NEXT_PUBLIC_*` (Next.js) or `VITE_*` (Vite) when options are omitted.
 *
 * Env vars (all optional except the API key required by the chosen provider):
 * - `NEXT_PUBLIC_AILP_BASE_URL` / `VITE_AILP_BASE_URL` — default `http://127.0.0.1:8000`
 * - `NEXT_PUBLIC_AILP_PROVIDER` / `VITE_AILP_PROVIDER` — `gemini` (default) or `openai`
 * - `NEXT_PUBLIC_GEMINI_API_KEY` / `VITE_GEMINI_API_KEY` — required if provider is `gemini`
 * - `NEXT_PUBLIC_OPENAI_API_KEY` / `VITE_OPENAI_API_KEY` — required if provider is `openai`
 * - `NEXT_PUBLIC_AIRTASYSTEMS_PROGRAM_ID` / `VITE_AIRTASYSTEMS_PROGRAM_ID` — optional
 * - `NEXT_PUBLIC_AILP_FRAMEWORKS` / `VITE_AILP_FRAMEWORKS` — comma-separated or JSON array; default `eu-ai-act`
 *
 * Security note: `NEXT_PUBLIC_*` / `VITE_*` variables are baked into the browser
 * bundle. Do not ship real LLM API keys in client code — call AILP from a server
 * route (or your own proxy) that reads keys from a non-public env var.
 */
export function useAilp(options?: UseAilpOptions): UseAilpResult {
  const baseUrl = options?.baseUrl;
  const programId = options?.programId;
  const frameworks = options?.frameworks;
  const timeoutMs = options?.timeoutMs;
  const provider = options?.provider;
  const geminiApiKey = options?.geminiApiKey;
  const openaiApiKey = options?.openaiApiKey;

  const config = useMemo(
    () =>
      resolveAilpConfigFromEnv({
        baseUrl,
        programId,
        frameworks,
        timeoutMs,
        provider,
        geminiApiKey,
        openaiApiKey,
      }),
    [
      baseUrl,
      programId,
      frameworksDepKey(frameworks),
      timeoutMs,
      provider,
      geminiApiKey,
      openaiApiKey,
    ],
  );

  const ailp = useMemo(() => createAilp(config), [config]);

  const state = useAssess(ailp);

  return { ...state, ailp };
}

// -------------------------------------------------------------------------
// useAssess — state only, for a pre-built AilpFn
// -------------------------------------------------------------------------

export interface UseAssessState {
  /** Last successful response, or null if not yet assessed. */
  result: AilpAssessResponse | null;
  /** True while an assess request is in-flight. */
  loading: boolean;
  /** Last error thrown by assess, or null. */
  error: Error | null;
  /** Submit messages and LLM output for assessment. Returns the response, or null on error. Clears any previous result and error before the request starts. */
  assess: (messages: AilpMessage[], output: string, options?: AilpCallOptions) => Promise<AilpAssessResponse | null>;
  /** Clear result and error without starting an assessment (e.g. leaving a screen). */
  reset: () => void;
}

export function useAssess(ailp: AilpFn): UseAssessState {
  const [result, setResult] = useState<AilpAssessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const assess = useCallback(
    async (
      messages: AilpMessage[],
      output: string,
      callOptions?: AilpCallOptions,
    ): Promise<AilpAssessResponse | null> => {
      setResult(null);
      setError(null);
      setLoading(true);
      try {
        const res = await ailp(messages, output, callOptions);
        setResult(res);
        return res;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [ailp],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, loading, error, assess, reset };
}
