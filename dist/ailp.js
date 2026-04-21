import { AilpClient } from "./client.js";
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
export function createAilp(options) {
    const client = new AilpClient({
        baseUrl: options.baseUrl,
        timeoutMs: options.timeoutMs,
    });
    return function ailp(messages, output, callOptions) {
        const entry = {
            timestamp: new Date().toISOString(),
            input: { messages, endpoint: callOptions?.endpoint },
            output,
            modelTested: callOptions?.model,
            framework: options.frameworks,
            ...(options.provider !== undefined ? { provider: options.provider } : {}),
            ...(options.expertProvider !== undefined ? { expertProvider: options.expertProvider } : {}),
            ...(options.judgeProvider !== undefined ? { judgeProvider: options.judgeProvider } : {}),
            ..._buildAirtaBlock(options),
        };
        return client.assess(entry, {
            geminiApiKey: options.geminiApiKey,
            openaiApiKey: options.openaiApiKey,
        });
    };
}
/** Build the optional `airtasystems` routing block, omitted entirely when empty. */
function _buildAirtaBlock(options) {
    const hasProgramId = options.programId != null && String(options.programId).trim() !== "";
    const hasFrameworks = options.frameworks !== undefined;
    if (!hasProgramId && !hasFrameworks)
        return {};
    return {
        airtasystems: {
            ...(hasProgramId ? { programId: options.programId } : {}),
            ...(hasFrameworks ? { frameworks: options.frameworks } : {}),
        },
    };
}
//# sourceMappingURL=ailp.js.map