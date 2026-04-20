/**
 * Generic wrapper: calls any async LLM function and fires an AILP assess
 * in the background. Never blocks or throws on assess failures — your LLM
 * call result is always returned.
 */
export async function wrapLlmCall(fn, params, options) {
    let result;
    try {
        result = await fn(params);
    }
    catch (err) {
        _fireAssess({
            timestamp: new Date().toISOString(),
            function: options.functionName,
            input: { messages: options.messages, endpoint: options.endpoint },
            output: err instanceof Error ? err.message : String(err),
            endpoint: options.endpoint,
            framework: options.frameworks,
            ...(options.provider ? { provider: options.provider } : {}),
            ..._buildAirtaBlock(options),
        }, options);
        throw err;
    }
    let extracted = { output: "" };
    try {
        extracted = options.extractOutput(result);
    }
    catch {
        // extractOutput threw — log what we have
    }
    const entry = {
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
export async function wrapOpenAI(fn, params, options) {
    const messages = (params.messages ?? []).map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : "",
    }));
    return wrapLlmCall(fn, params, {
        ...options,
        endpoint: options.endpoint ?? "/v1/chat/completions",
        messages,
        extractOutput: (res) => ({
            output: (typeof res.choices?.[0]?.message?.content === "string"
                ? res.choices[0].message.content
                : null) ?? "",
            model: res.model ?? params.model,
        }),
    });
}
// -------------------------------------------------------------------------
// Internal: fire-and-forget assess
// -------------------------------------------------------------------------
function _fireAssess(entry, options) {
    const onError = options.onAssessError ??
        ((err) => {
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
        }
        catch {
            // swallow errors in the callback
        }
    })
        .catch((err) => {
        try {
            onError(err, entry);
        }
        catch {
            // swallow
        }
    });
}
//# sourceMappingURL=wrap.js.map