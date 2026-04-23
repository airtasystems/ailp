import type { AilpClient } from "./client.js";
import type { AilpAssessResponse, AilpFrameworkSlug, AilpLogEntry, AilpMessage, AilpProvider } from "./types.js";
export interface WrapOptions {
    client: AilpClient;
    /**
     * **Required.** AILP API key from ailp.airtasystems.com
     * (sent as `Airta-Api-Key`).
     */
    apiKey: string;
    /**
     * **Required.** AIRTA Systems program ID
     * (sent as `Airta-Program-Id` and echoed under `airtasystems.programId`).
     */
    programId: string;
    /** Framework slug(s) to assess against. */
    frameworks?: AilpFrameworkSlug | AilpFrameworkSlug[];
    /** Which LLM AILP should use (expert + judge). Defaults to server's `gemini`. */
    provider?: AilpProvider;
    /** Gemini API key (only sent when `provider === "gemini"`). */
    geminiApiKey?: string;
    /** OpenAI API key (only sent when `provider === "openai"`). */
    openaiApiKey?: string;
    /** Name of the calling function/route (logged as "function" in the entry). */
    functionName?: string;
    /** Endpoint path to record (e.g. "/api/chat"). */
    endpoint?: string;
    /**
     * Called after the assessment completes (fire-and-forget).
     * Errors inside this callback are swallowed.
     */
    onAssess?: (result: AilpAssessResponse, entry: AilpLogEntry) => void;
    /**
     * Called if the AILP assess call itself throws.
     * Defaults to console.warn so LLM errors are never blocked.
     */
    onAssessError?: (err: unknown, entry: AilpLogEntry) => void;
}
export interface LlmWrapOptions<TResult> extends WrapOptions {
    /**
     * Map the LLM result to the fields AILP needs.
     * Only output text is required; model is optional.
     */
    extractOutput: (result: TResult) => {
        output: string;
        model?: string;
    };
    /** Input messages to log. */
    messages: AilpMessage[];
}
/**
 * Generic wrapper: calls any async LLM function and fires an AILP assess
 * in the background. Never blocks or throws on assess failures — your LLM
 * call result is always returned.
 */
export declare function wrapLlmCall<TParams, TResult>(fn: (params: TParams) => Promise<TResult>, params: TParams, options: LlmWrapOptions<TResult>): Promise<TResult>;
interface OpenAIMessage {
    role: string;
    content: string | null;
}
interface OpenAIChoice {
    message: OpenAIMessage;
    finish_reason?: string;
}
interface OpenAIChatResponse {
    id?: string;
    model?: string;
    choices: OpenAIChoice[];
}
interface OpenAIChatParams {
    model: string;
    messages: OpenAIMessage[];
    [key: string]: unknown;
}
export interface OpenAIWrapOptions extends WrapOptions {
    endpoint?: string;
}
/**
 * Drop-in wrapper for `openai.chat.completions.create()` (or any compatible API).
 * Assessment runs fire-and-forget — your LLM call is never blocked or delayed.
 *
 * @example
 * const response = await wrapOpenAI(
 *   (p) => openai.chat.completions.create(p),
 *   { model: "gpt-4o-mini", messages },
 *   {
 *     client,
 *     apiKey: process.env.AILP_API_KEY!,
 *     programId: process.env.AIRTASYSTEMS_PROGRAM_ID!,
 *     frameworks: ["eu-ai-act"],
 *   }
 * );
 */
export declare function wrapOpenAI<T extends OpenAIChatParams>(fn: (params: T) => Promise<OpenAIChatResponse>, params: T, options: OpenAIWrapOptions): Promise<OpenAIChatResponse>;
export {};
//# sourceMappingURL=wrap.d.ts.map