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
 * @param options   Optional per-call overrides (model, endpoint).
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
 * @example Gemini (default provider)
 * const ailp = createAilp({
 *   baseUrl: "https://airtasystems.com/ailp-server",
 *   frameworks: ["eu-ai-act", "owasp-llm"],
 *   geminiApiKey: process.env.GEMINI_API_KEY,
 * });
 *
 * @example OpenAI
 * const ailp = createAilp({
 *   baseUrl: "https://airtasystems.com/ailp-server",
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
  const client = new AilpClient({
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
  });

  return function ailp(
    messages: AilpMessage[],
    output: string,
    callOptions?: AilpCallOptions,
  ): Promise<AilpAssessResponse> {
    const entry: AilpLogEntry = {
      timestamp: new Date().toISOString(),
      input: { messages, endpoint: callOptions?.endpoint },
      output,
      modelTested: callOptions?.model,
      framework: options.frameworks,
      ...(options.provider !== undefined ? { provider: options.provider } : {}),
      ...(options.expertProvider !== undefined ? { expertProvider: options.expertProvider } : {}),
      ...(options.judgeProvider !== undefined ? { judgeProvider: options.judgeProvider } : {}),
      ...(_buildAirtaBlock(options) as Pick<AilpLogEntry, "airtasystems">),
    };

    return client.assess(entry, {
      geminiApiKey: options.geminiApiKey,
      openaiApiKey: options.openaiApiKey,
    });
  };
}

/** Build the optional `airtasystems` routing block, omitted entirely when empty. */
function _buildAirtaBlock(
  options: AilpOptions,
): Pick<AilpLogEntry, "airtasystems"> | Record<string, never> {
  const hasProgramId =
    options.programId != null && String(options.programId).trim() !== "";
  const hasFrameworks = options.frameworks !== undefined;
  if (!hasProgramId && !hasFrameworks) return {};
  return {
    airtasystems: {
      ...(hasProgramId ? { programId: options.programId } : {}),
      ...(hasFrameworks ? { frameworks: options.frameworks } : {}),
    },
  };
}
