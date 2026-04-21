# @airtasystems/ailp

**LLM compliance risk assessment — drop one line into any AI call.**

## IMPORTANT - THIS IS CLIENT IS UNDER DEVELOPMENT. NOT IN ACTIVE USE.

> **Pre-1.0:** This client is still in active development. Breaking changes are possible until **1.0.0**; pin an exact version or a tight semver range in production.

Sends your LLM interactions to the [AIRTA Systems AILP](https://github.com/airtasystems/ailp-server) server for automated compliance scoring against frameworks like EU AI Act, OWASP LLM Top 10, NIST AI RMF, and more. Works with any LLM provider. No runtime dependencies — uses native `fetch`.

**Hosted server:** AIRTA runs a deployment at [https://airtasystems.com/ailp](https://airtasystems.com/ailp). Use that string as `baseUrl` (no trailing slash — the client appends `/assess`, `/assess/stream`, `/health`, and so on). For React, set `NEXT_PUBLIC_AILP_BASE_URL` or `VITE_AILP_BASE_URL` to the same value when you are not pointing at a local instance.

## Install

```bash
npm install @airtasystems/ailp
```

## Quick start

Examples use the **hosted** `baseUrl` from above. If the API runs on your machine or in Docker, use `http://localhost:8000` or your service hostname (for example `http://ailp-server:8000`) instead.

Configure once:

```typescript
import { createAilp } from "@airtasystems/ailp";

const ailp = createAilp({
  baseUrl: "https://airtasystems.com/ailp",
  frameworks: ["eu-ai-act", "owasp-llm"],
  // Pick which LLM AILP uses internally (expert + judge). Defaults to "gemini".
  provider: "gemini",
  geminiApiKey: process.env.GEMINI_API_KEY,
});
```

Drop in after **any LLM call**:

```typescript
const res = await ailp(messages, llmOutput);

console.log(res.risk_level);      // "compliant"
console.log(res.frameworks);      // e.g. ["EU AI Act", "OWASP Top 10 for LLMs"]
console.log(res.experts);         // [{ framework, risk_level, reasoning }, ...]
console.log(res.judge_reasoning); // "The interaction is benign and poses no risk..."
```

Pass an optional model hint (this is the model that produced `llmOutput`, not the one AILP uses internally):

```typescript
const res = await ailp(messages, llmOutput, { model: "gpt-4o-mini" });
```

---

## Provider selection

AILP uses Gemini or OpenAI as its expert + judge LLM. Pick per-client with `provider` and pass the matching API key — the client sends it as the correct `X-*-Api-Key` header for you.

```typescript
// OpenAI
const ailp = createAilp({
  baseUrl: "https://airtasystems.com/ailp",
  frameworks: ["eu-ai-act"],
  provider: "openai",
  openaiApiKey: process.env.OPENAI_API_KEY,
});
```

The server picks the internal expert/judge models from env (`GEMINI_MODEL`/`GEMINI_JUDGE`, `OPENAI_MODEL`/`OPENAI_JUDGE`); per-request `expertModel` / `judgeModel` overrides are also supported.

To use **different vendors** for experts vs judge, set `expertProvider` and `judgeProvider` on `createAilp({ ... })` (or on each `AilpLogEntry`). Supply **both** API keys when both sides need them — the client sends the matching `X-*-Api-Key` headers automatically.

On the **server**, you can omit `provider` (and split fields) from JSON and set **`AILP_PROVIDER`**, **`AILP_EXPERT_PROVIDER`**, **`AILP_JUDGE_PROVIDER`**, **`AILP_EXPERT_MODEL`**, and **`AILP_JUDGE_MODEL`** in repo **`.config`** instead. If you omit `provider` from `createAilp()` options, the SDK does not send that field so those defaults apply. When nothing in the payload selects a vendor, the SDK sends **any** API keys you pass so mixed `.config` pipelines still authenticate.

> **Security:** LLM API keys are secrets. Do **not** ship them to browsers via `NEXT_PUBLIC_*` or `VITE_*` variables in production — they will be baked into the JS bundle. Call AILP from a **server route** (Next.js API route, Vite server endpoint, etc.) that reads the key from a private env var. `NEXT_PUBLIC_*` is only safe for local demos.

---

## Streaming assessment (`assessStream`)

`POST /assess/stream` returns **NDJSON** (one JSON object per line) so clients can show progress while experts and the judge run. **`AilpClient.assessStream()`** calls that endpoint, invokes an optional **`onEvent`** callback for each `meta`, `cached`, `phase`, `expert`, and `judge` line, then resolves with the same object shape as **`assess()`** (parsed from the final `done` line).

```typescript
import { AilpClient } from "@airtasystems/ailp";

const client = new AilpClient({
  baseUrl: "https://airtasystems.com/ailp",
  timeoutMs: 120_000,
});

const result = await client.assessStream(
  entry,
  { geminiApiKey: process.env.GEMINI_API_KEY! },
  {
    onEvent(ev) {
      if (ev.event === "expert") {
        console.log(ev.expert.framework, ev.expert.risk_level);
      }
    },
  },
);
```

If you **proxy** AILP through your own `fetch` (for example a Next.js route that forwards the body), use **`readAilpAssessNdjsonStream(response.body, onEvent)`** to parse the stream; it does not require a base URL.

Exported types: **`AilpAssessStreamEvent`**, **`AilpAssessStreamExpertPayload`**, **`AilpAssessStreamOptions`**. See the main AILP **README** for the NDJSON `event` contract.

---

## Works with any LLM provider

### OpenAI

```typescript
const response = await openai.chat.completions.create({ model, messages });
const res = await ailp(messages, response.choices[0].message.content ?? "");
```

### Anthropic

```typescript
const response = await anthropic.messages.create({ model, messages, max_tokens: 256 });
const res = await ailp(messages, response.content[0]?.text ?? "");
```

### Any other provider

```typescript
const output = await myLlm(messages);
const res = await ailp(messages, output);
```

---

## Fire-and-forget wrapper (OpenAI)

Assessment runs in the background — your LLM response is never blocked or delayed:

```typescript
import { wrapOpenAI, AilpClient } from "@airtasystems/ailp";

const client = new AilpClient({ baseUrl: "https://airtasystems.com/ailp" });

const response = await wrapOpenAI(
  (p) => openai.chat.completions.create(p),
  { model: "gpt-4o-mini", messages },
  {
    client,
    frameworks: ["eu-ai-act", "owasp-llm"],
    provider: "gemini",
    geminiApiKey: process.env.GEMINI_API_KEY,
    onAssess: (result) => console.log("Risk:", result.risk_level),
  },
);
```

## Generic fire-and-forget wrapper

Use `wrapLlmCall` for any async LLM function:

```typescript
import { wrapLlmCall, AilpClient } from "@airtasystems/ailp";

const client = new AilpClient({ baseUrl: "https://airtasystems.com/ailp" });

const response = await wrapLlmCall(
  (p) => anthropic.messages.create(p),
  { model: "claude-3-haiku-20240307", max_tokens: 256, messages },
  {
    client,
    frameworks: ["nist-ai-rmf"],
    provider: "openai",
    openaiApiKey: process.env.OPENAI_API_KEY,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    extractOutput: (res) => ({
      output: res.content[0]?.text ?? "",
      model: res.model,
    }),
  },
);
```

---

## React

Import from `@airtasystems/ailp/react` to keep React out of the core bundle.

### `useAilp()` — recommended

One hook: memoized client + `assess` / `result` / `loading` / `error` / `reset`.  
Configure with **environment variables** (Next.js `NEXT_PUBLIC_*`, Vite `VITE_*`) so you do not need `useMemo` or `createAilp` in every component.

Each call to `assess()` clears the previous `result` and `error` before the new request, so you do not need to call `reset()` between chat turns. Use `reset()` only when you want to clear the UI without assessing (for example when leaving a view).

```tsx
import { useAilp } from "@airtasystems/ailp/react";

function ChatWidget() {
  const { assess, result, loading, error } = useAilp();

  async function handleSend(userMessage: string, llmOutput: string) {
    await assess([{ role: "user", content: userMessage }], llmOutput);
  }

  return (
    <div>
      {loading && <p>Assessing…</p>}
      {error && <p>Error: {error.message}</p>}
      {result && (
        <p>
          Risk: <strong>{result.risk_level}</strong> — {result.judge_reasoning}
        </p>
      )}
      <button onClick={() => handleSend("hello", "Hi there!")}>Send</button>
    </div>
  );
}
```

**Env vars** (override any field by passing options to `useAilp({ ... })` instead):

| Variable | Required | Default |
|----------|----------|---------|
| `NEXT_PUBLIC_AILP_BASE_URL` or `VITE_AILP_BASE_URL` | No | Local dev: `http://127.0.0.1:8000`. Hosted: `https://airtasystems.com/ailp` |
| `NEXT_PUBLIC_AILP_PROVIDER` or `VITE_AILP_PROVIDER` | No | Omit so the **AILP server** picks expert/judge (and API keys) from its own config — use this for production browser apps against a hosted AILP. Set `gemini` or `openai` only when the client must send `X-*-Api-Key` headers. |
| `NEXT_PUBLIC_GEMINI_API_KEY` or `VITE_GEMINI_API_KEY` | Only if provider (or split expert/judge env) is `gemini` | — |
| `NEXT_PUBLIC_OPENAI_API_KEY` or `VITE_OPENAI_API_KEY` | Only if provider (or split expert/judge env) is `openai` | — |
| `NEXT_PUBLIC_AIRTASYSTEMS_PROGRAM_ID` or `VITE_AIRTASYSTEMS_PROGRAM_ID` | No | — (omitted from the payload when unset) |
| `NEXT_PUBLIC_AILP_FRAMEWORKS` or `VITE_AILP_FRAMEWORKS` | No | `eu-ai-act` |

Frameworks in env — prefer **comma-separated** (simplest in `.env`): `NEXT_PUBLIC_AILP_FRAMEWORKS=eu-ai-act` or `eu-ai-act,owasp-llm`.  
JSON arrays must use **double** quotes: `["eu-ai-act","owasp-llm"]`. Values like `['eu-ai-act']` are not valid JSON; the client normalizes them, but CSV is clearer.

**Next.js:** `NEXT_PUBLIC_*` values are baked in at **build time**. After changing `.env`, restart `next dev` (or rebuild). Variable names must be exact literals (this package reads them as static `process.env` references so Next can inline them).

> **Security:** `NEXT_PUBLIC_*` / `VITE_*` variables are shipped to the browser. For production, do **not** expose `GEMINI_API_KEY` / `OPENAI_API_KEY` in client bundles — proxy AILP through your own server route that reads the key from a private env var.

Partial override example:

```tsx
const { assess, result, loading, error } = useAilp({
  provider: "openai",
  openaiApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
});
```

The hook also returns `ailp` (the underlying `AilpFn`) if you need it outside `assess`.

### `useAssess(ailp)` — advanced

If you already have an `AilpFn` from `createAilp()`:

```tsx
import { createAilp } from "@airtasystems/ailp";
import { useAssess } from "@airtasystems/ailp/react";

const ailp = createAilp({
  baseUrl,
  frameworks,
  provider: "gemini",
  geminiApiKey: process.env.GEMINI_API_KEY,
});
const { assess, result, loading, error } = useAssess(ailp);
```

---

## Framework slugs

| Slug | Framework |
|------|-----------|
| `eu_ai_act` / `eu-ai-act` | EU AI Act |
| `oecd` | OECD AI Principles (default) |
| `owasp_llm` / `owasp-llm` | OWASP Top 10 for LLMs |
| `owasp_agent` / `owasp-agent` | OWASP Top 10 for Agentic Applications |
| `nist_ai_rmf` / `nist-ai-rmf` | NIST AI RMF |
| `mitre_attack` / `mitre-attack` | MITRE ATT&CK |
| `pld` | EU PLD (AI) |
| `fria_core` / `fria-core` | FRIA Core |
| `fria_extended` / `fria-extended` | FRIA Extended |

---

## Risk levels

`critical` › `high` › `medium` › `low` › `informational` › `compliant` › `indeterminate`

---

## License

MIT
