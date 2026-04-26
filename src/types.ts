export type AilpFrameworkSlug =
  | "eu_ai_act"    | "eu-ai-act"
  | "oecd"
  | "owasp_llm"    | "owasp-llm"
  | "owasp_agent"  | "owasp-agent"
  | "nist_ai_rmf"  | "nist-ai-rmf"
  | "mitre_attack" | "mitre-attack"
  | "pld"
  | "fria_core"    | "fria-core"
  | "fria_extended"| "fria-extended"
  | (string & {}); // allow arbitrary strings without losing autocomplete

/**
 * Which LLM AILP uses internally for the expert + judge pipeline.
 * - `"gemini"` (default): requires a Gemini API key.
 * - `"openai"`: requires an OpenAI API key.
 */
export type AilpProvider = "gemini" | "openai";

export type AilpRiskLevel =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "informational"
  | "compliant"
  | "indeterminate";

// -------------------------------------------------------------------------
// Shared message shape
// -------------------------------------------------------------------------

export interface AilpMessage {
  role: string;
  content: string;
}

// -------------------------------------------------------------------------
// Internal log entry (sent to the server)
// -------------------------------------------------------------------------

export interface AilpLogEntry {
  timestamp: string;
  /** Name of the calling function / route handler. */
  function?: string;
  /**
   * Identifier of the LLM that *produced* `output` — the call being audited.
   * Distinct from the assessment LLM (see `provider`). Server returns this
   * field as `modelTested` in the response echo.
   */
  modelTested?: string;
  /** @deprecated Use `modelTested`. Still accepted by the server. */
  model?: string;
  input: {
    messages: AilpMessage[];
    endpoint?: string;
  };
  /** Raw text output from the LLM. */
  output: string;
  /** Token counts for the audited LLM call (NOT the AILP assessment itself). */
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** Wall-clock latency of the audited LLM call in milliseconds. */
  responseTime?: number;
  endpoint?: string;
  /**
   * Framework slug(s) to assess against.
   * Defaults to OECD if omitted everywhere.
   */
  framework?: AilpFrameworkSlug | AilpFrameworkSlug[];
  /**
   * Which LLM AILP uses internally to run the expert + judge pipeline when
   * `expertProvider` / `judgeProvider` are omitted (defaults for both sides).
   * Independent of `model` (which describes the model that produced `output`).
   * Omit to use the server default (`gemini`).
   */
  provider?: AilpProvider;
  /** When set, framework experts use this vendor instead of `provider`. */
  expertProvider?: AilpProvider;
  /** When set, the judge uses this vendor instead of `provider`. */
  judgeProvider?: AilpProvider;
  /**
   * Optional per-request override for the model the **expert** node uses
   * within the chosen `provider`. Takes precedence over the server's *_MODEL
   * env default. When set without `judgeModel`, the judge uses this too.
   */
  expertModel?: string;
  /**
   * Optional per-request override for the model the **judge** node uses
   * within the chosen `provider`. Takes precedence over the server's *_JUDGE
   * env default.
   */
  judgeModel?: string;
  airtasystems?: {
    programId?: string;
    frameworks?: AilpFrameworkSlug | AilpFrameworkSlug[];
  };
}

// -------------------------------------------------------------------------
// Response types
// -------------------------------------------------------------------------

export interface AilpExpertResult {
  framework: string;
  risk_level: AilpRiskLevel;
  reasoning: string;
}

/** Summary vendor for the pipeline: same as experts/judge when aligned, else `"mixed"`. */
export type AilpAssessmentProviderField = AilpProvider | "mixed";

/** Which LLM AILP actually used to score this request (expert + judge nodes). */
export interface AilpAssessment {
  provider: AilpAssessmentProviderField;
  expertProvider: AilpProvider;
  judgeProvider: AilpProvider;
  expertModel: string;
  judgeModel: string;
}

export interface AilpAssessResponse {
  /** Most severe risk level across all experts (judge's final verdict). */
  risk_level: AilpRiskLevel;
  /** Judge's chain-of-thought synthesis. */
  judge_reasoning: string;
  /** Resolved display names of all frameworks that ran. */
  frameworks: string[];
  /** One entry per framework expert, in the same order as frameworks. */
  experts: AilpExpertResult[];
  /** Provider + model names AILP used to score this run. */
  assessment: AilpAssessment;
  /** Echo of the submitted log entry. */
  log: AilpLogEntry;
}

// -------------------------------------------------------------------------
// POST /assess/stream — NDJSON (`application/x-ndjson`)
// -------------------------------------------------------------------------

/**
 * One expert payload on an `event: "expert"` line (server may truncate
 * `reasoning` for bandwidth).
 */
export interface AilpAssessStreamExpertPayload {
  framework: string;
  risk_level: string;
  reasoning: string;
  expert_id?: string;
}

/**
 * Discriminated union for each NDJSON object from `POST /assess/stream`.
 * The final `done` object includes the same fields as {@link AilpAssessResponse}.
 */
export type AilpAssessStreamEvent =
  | { event: "meta"; frameworks: string[]; assessment: AilpAssessment }
  | { event: "cached" }
  | { event: "expert"; expert: AilpAssessStreamExpertPayload }
  /** Emitted before a long gap: `experts` right after `meta` when not cached; `judge` when experts are in state and the judge LLM runs. */
  | { event: "phase"; phase: "experts" | "judge" }
  | { event: "judge"; risk_level: string; reasoning_preview: string }
  | (AilpAssessResponse & { event: "done" })
  | { event: "error"; detail: string };

// -------------------------------------------------------------------------
// createAilp config
// -------------------------------------------------------------------------

export interface AilpOptions {
  /**
   * Base URL of the AILP server (no trailing slash).
   * Omit to use the package default `AILP_DEFAULT_BASE_URL` (https://ailp.airtasystems.com/ailp).
   */
  baseUrl?: string;
  /**
   * **Required.** AILP API key issued by ailp.airtasystems.com. Sent as the
   * `Airta-Api-Key` request header. Pair with {@link programId} — both are
   * required by the server.
   */
  apiKey: string;
  /**
   * **Required.** AIRTA Systems program ID. Sent as the `Airta-Program-Id`
   * request header and echoed in the payload under `airtasystems.programId`.
   */
  programId: string;
  /** Framework slug(s) to run. */
  frameworks: AilpFrameworkSlug | AilpFrameworkSlug[];
  /**
   * Which LLM AILP uses internally (expert + judge pipeline).
   * Omit so the server applies its own default (and can use server-side API keys).
   */
  provider?: AilpProvider;
  expertProvider?: AilpProvider;
  judgeProvider?: AilpProvider;
  /**
   * Gemini API key. Required when `provider` resolves to `"gemini"`; sent as
   * the `X-Gemini-Api-Key` request header. Security: if you inline this via a
   * `NEXT_PUBLIC_*` / `VITE_*` env var it will be shipped to browsers — prefer
   * calling AILP from a server route that reads the key from a non-public env.
   */
  geminiApiKey?: string;
  /**
   * OpenAI API key. Required when `provider` resolves to `"openai"`; sent as
   * the `X-OpenAI-Api-Key` request header. Same browser-exposure caveat as
   * `geminiApiKey`.
   */
  openaiApiKey?: string;
  /** Optional request timeout in milliseconds (default: no timeout). */
  timeoutMs?: number;
}

/** Options accepted per individual ailp() call. */
export interface AilpCallOptions {
  /** Model identifier (e.g. "gpt-4o-mini"). */
  model?: string;
  /** Endpoint path to record (e.g. "/api/chat"). */
  endpoint?: string;
}

// -------------------------------------------------------------------------
// Low-level client config (used internally)
// -------------------------------------------------------------------------

export interface AilpClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}
