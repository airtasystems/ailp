import type { AilpFn } from "./ailp.js";
import type { AilpAssessResponse, AilpCallOptions, AilpFrameworkSlug, AilpMessage, AilpOptions } from "./types.js";
/**
 * Parse framework list from env. Handles:
 * - JSON: `["eu-ai-act","owasp-llm"]` (double quotes)
 * - JS-style (common in .env): `['eu-ai-act']` — **not** valid JSON; we normalize
 * - Bracket list without strict JSON: `[eu-ai-act]`, `[ eu-ai-act , owasp-llm ]`
 * - Plain CSV: `eu-ai-act,owasp-llm`
 */
export declare function parseFrameworksFromEnv(raw: string | undefined): AilpFrameworkSlug[] | undefined;
/**
 * Resolve config from optional overrides + environment variables.
 *
 * - `programId` is optional; omitted from the payload if unset.
 * - `provider` defaults to `"gemini"` if neither override nor env specifies one.
 * - Throws if the resolved provider requires an API key that was not supplied.
 */
export declare function resolveAilpConfigFromEnv(overrides?: Partial<AilpOptions>): AilpOptions;
/** Optional overrides; omitted fields are read from env (see README). */
export type UseAilpOptions = Partial<AilpOptions>;
export type UseAilpResult = UseAssessState & {
    ailp: AilpFn;
};
/**
 * One-liner for React apps: memoized `createAilp` + assessment state.
 * Reads `NEXT_PUBLIC_*` (Next.js) or `VITE_*` (Vite) when options are omitted.
 *
 * Env vars (all optional except the API key required by the chosen provider):
 * - `NEXT_PUBLIC_AILP_BASE_URL` / `VITE_AILP_BASE_URL` — default `http://127.0.0.1:8000`; hosted example `https://airtasystems.com/ailp-server` (no trailing slash)
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
export declare function useAilp(options?: UseAilpOptions): UseAilpResult;
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
export declare function useAssess(ailp: AilpFn): UseAssessState;
//# sourceMappingURL=react.d.ts.map