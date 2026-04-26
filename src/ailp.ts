import { AILP_DEFAULT_BASE_URL } from "./constants.js";
import { AilpClient } from "./client.js";
import type {
  AilpAssessResponse,
  AilpCallOptions,
  AilpLogEntry,
  AilpMessage,
  AilpOptions,
} from "./types.js";

/**
 * A pre-configured assess function returned by createAilp().
 * Call it after any LLM interaction — vendor agnostic.
 *
 * @param messages  The conversation messages sent to the LLM.
 * @param output    The raw text response from the LLM.
 * @param options   Optional per-call overrides (model, endpoint, assessment mode).
 */
export type AilpFn = (
  messages: AilpMessage[],
  output: string,
  options?: AilpCallOptions,
) => Promise<AilpAssessResponse>;

/**
 * Create a pre-configured AILP assess function.
 * Call createAilp() once at startup, then drop the returned function
 * in after any LLM call.
 *
 * `apiKey` and `programId` are **required**: they authenticate the caller
 * with the AILP service (`Airta-Api-Key` / `Airta-Program-Id` headers).
 * Get both from https://ailp.airtasystems.com.
 *
 * @example Minimal — server-side expert/judge keys, hosted AILP
 * const ailp = createAilp({
 *   apiKey: process.env.AILP_API_KEY!,
 *   programId: process.env.AIRTASYSTEMS_PROGRAM_ID!,
 *   frameworks: ["eu-ai-act", "owasp-llm"],
 *   openaiApiKey: process.env.OPENAI_API_KEY,
 *   geminiApiKey: process.env.GEMINI_API_KEY,
 * });
 *
 * @example Client-supplied provider keys
 * const ailp = createAilp({
 *   apiKey: process.env.AILP_API_KEY!,
 *   programId: process.env.AIRTASYSTEMS_PROGRAM_ID!,
 *   frameworks: ["eu-ai-act"],
 *   provider: "openai",
 *   openaiApiKey: process.env.OPENAI_API_KEY,
 * });
 *
 * // after any LLM call:
 * const res = await ailp(messages, llmOutput);
 * console.log(res.risk_level);
 */
export function createAilp(options: AilpOptions): AilpFn {
  const apiKey = typeof options.apiKey === "string" ? options.apiKey.trim() : "";
  if (!apiKey) {
    throw new Error(
      "createAilp: `apiKey` is required. Get a key at https://ailp.airtasystems.com and pass it via `apiKey` (or set AILP_API_KEY / NEXT_PUBLIC_AILP_API_KEY / VITE_AILP_API_KEY for the React hook).",
    );
  }
  const programId =
    typeof options.programId === "string" ? options.programId.trim() : "";
  if (!programId) {
    throw new Error(
      "createAilp: `programId` is required. Copy your program ID from ailp.airtasystems.com and pass it via `programId` (or set AIRTASYSTEMS_PROGRAM_ID / NEXT_PUBLIC_AIRTASYSTEMS_PROGRAM_ID / VITE_AIRTASYSTEMS_PROGRAM_ID for the React hook).",
    );
  }

  const baseUrl = (options.baseUrl ?? AILP_DEFAULT_BASE_URL).replace(/\/$/, "");
  const client = new AilpClient({
    baseUrl,
    timeoutMs: options.timeoutMs,
  });

  return function ailp(
    messages: AilpMessage[],
    output: string,
    callOptions?: AilpCallOptions,
  ): Promise<AilpAssessResponse> {
    const entry: AilpLogEntry = {
      airta_import: 1,
      timestamp: new Date().toISOString(),
      input: { messages, endpoint: callOptions?.endpoint },
      output,
      modelTested: callOptions?.model,
      framework: options.frameworks,
      ...(options.provider !== undefined ? { provider: options.provider } : {}),
      ...(options.expertProvider !== undefined ? { expertProvider: options.expertProvider } : {}),
      ...(options.judgeProvider !== undefined ? { judgeProvider: options.judgeProvider } : {}),
      ...(callOptions?.assessmentMode !== undefined
        ? { assessmentMode: callOptions.assessmentMode }
        : options.assessmentMode !== undefined
          ? { assessmentMode: options.assessmentMode }
          : {}),
      ...(callOptions?.security !== undefined
        ? { security: callOptions.security ? 1 : 0 }
        : options.security !== undefined
          ? { security: options.security ? 1 : 0 }
          : {}),
      airtasystems: {
        programId,
        ...(options.frameworks !== undefined ? { frameworks: options.frameworks } : {}),
      },
    };

    return client.assess(entry, {
      apiKey,
      programId,
      geminiApiKey: options.geminiApiKey,
      openaiApiKey: options.openaiApiKey,
    });
  };
}
