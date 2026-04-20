import type { AilpClient } from "./client.js";
import type {
  AilpAssessResponse,
  AilpFrameworkSlug,
  AilpLogEntry,
  AilpMessage,
  AilpProvider,
} from "./types.js";

// -------------------------------------------------------------------------
// Shared wrap options
// -------------------------------------------------------------------------

export interface WrapOptions {
  client: AilpClient;
  /** Framework slug(s) to assess against. */
  frameworks?: AilpFrameworkSlug | AilpFrameworkSlug[];
  /** Optional AIRTA Systems program ID. Omitted from the payload when not set. */
  programId?: string;
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

// -------------------------------------------------------------------------
// Generic LLM call wrapper
// -------------------------------------------------------------------------

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
export async function wrapLlmCall<TParams, TResult>(
  fn: (params: TParams) => Promise<TResult>,
  params: TParams,
  options: LlmWrapOptions<TResult>,
): Promise<TResult> {
  let result: TResult;

  try {
    result = await fn(params);
  } catch (err) {
    _fireAssess(
      {
        timestamp: new Date().toISOString(),
        function: options.functionName,
        input: { messages: options.messages, endpoint: options.endpoint },
        output: err instanceof Error ? err.message : String(err),
        endpoint: options.endpoint,
        framework: options.frameworks,
        ...(options.provider ? { provider: options.provider } : {}),
        ..._buildAirtaBlock(options),
      },
      options,
    );
    throw err;
  }

  let extracted: { output: string; model?: string } = { output: "" };

  try {
    extracted = options.extractOutput(result);
  } catch {
    // extractOutput threw — log what we have
  }

  const entry: AilpLogEntry = {
    timestamp: new Date().toISOString(),
    function: options.functionName,
    modelTested: extracted.model,
    input: { messages: options.messages, endpoint: options.endpoint },
    output: extracted.output ?? "",
    endpoint: options.endpoint,
    framework: options.frameworks,
    ...(options.provider ? { provider: options.provider } : {}),
    ..._buildAirtaBlock(options),
  };

  _fireAssess(entry, options);

  return result;
}

/** Build the optional `airtasystems` routing block, omitted entirely when empty. */
function _buildAirtaBlock(options: WrapOptions): Pick<AilpLogEntry, "airtasystems"> {
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

// -------------------------------------------------------------------------
// OpenAI duck types (avoids a hard dependency on the openai package)
// -------------------------------------------------------------------------

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

// -------------------------------------------------------------------------
// OpenAI-specific wrapper
// -------------------------------------------------------------------------

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
 *   { client, programId: "my-program", frameworks: ["eu-ai-act"] }
 * );
 */
export async function wrapOpenAI<T extends OpenAIChatParams>(
  fn: (params: T) => Promise<OpenAIChatResponse>,
  params: T,
  options: OpenAIWrapOptions,
): Promise<OpenAIChatResponse> {
  const messages: AilpMessage[] = (params.messages ?? []).map((m) => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : "",
  }));

  return wrapLlmCall(fn, params, {
    ...options,
    endpoint: options.endpoint ?? "/v1/chat/completions",
    messages,
    extractOutput: (res) => ({
      output:
        (typeof res.choices?.[0]?.message?.content === "string"
          ? res.choices[0].message.content
          : null) ?? "",
      model: res.model ?? params.model,
    }),
  });
}

// -------------------------------------------------------------------------
// Internal: fire-and-forget assess
// -------------------------------------------------------------------------

function _fireAssess(entry: AilpLogEntry, options: WrapOptions): void {
  const onError =
    options.onAssessError ??
    ((err: unknown) => {
      console.warn("[ailp] assess error (LLM call unaffected):", err);
    });

  options.client
    .assess(entry, {
      geminiApiKey: options.geminiApiKey,
      openaiApiKey: options.openaiApiKey,
    })
    .then((result) => {
      try {
        options.onAssess?.(result, entry);
      } catch {
        // swallow errors in the callback
      }
    })
    .catch((err: unknown) => {
      try {
        onError(err, entry);
      } catch {
        // swallow
      }
    });
}
