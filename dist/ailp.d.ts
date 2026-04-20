import type { AilpAssessResponse, AilpCallOptions, AilpMessage, AilpOptions } from "./types.js";
/**
 * A pre-configured assess function returned by createAilp().
 * Call it after any LLM interaction — vendor agnostic.
 *
 * @param messages  The conversation messages sent to the LLM.
 * @param output    The raw text response from the LLM.
 * @param options   Optional per-call overrides (model, endpoint).
 */
export type AilpFn = (messages: AilpMessage[], output: string, options?: AilpCallOptions) => Promise<AilpAssessResponse>;
/**
 * Create a pre-configured AILP assess function.
 * Call createAilp() once at startup, then drop the returned function
 * in after any LLM call.
 *
 * @example Gemini (default provider)
 * const ailp = createAilp({
 *   baseUrl: "http://localhost:8000",
 *   frameworks: ["eu-ai-act", "owasp-llm"],
 *   geminiApiKey: process.env.GEMINI_API_KEY,
 * });
 *
 * @example OpenAI
 * const ailp = createAilp({
 *   baseUrl: "http://localhost:8000",
 *   frameworks: ["eu-ai-act"],
 *   provider: "openai",
 *   openaiApiKey: process.env.OPENAI_API_KEY,
 * });
 *
 * // after any LLM call:
 * const res = await ailp(messages, llmOutput);
 * console.log(res.risk_level);
 */
export declare function createAilp(options: AilpOptions): AilpFn;
//# sourceMappingURL=ailp.d.ts.map