# @airtasystems/ailp

**LLM log visibility and risk assessment** — sends llm input/outputs to ailp.airtasystems.com dashboard for log and compliance visibility. Manage and view your AI logs in one easy to use dashboard.

This package is a thin **`fetch`** client for the **AILP** (AI Log Protocol) HTTP API. It runs in **Node 18+**, browsers, workers, and edge runtimes that provide native `fetch`. No extra HTTP dependencies.

**Default server:** The hosted AILP API is at **`https://ailp.airtasystems.com/ailp`** (no trailing slash). The client appends **`/health`**, **`/assess`**, and **`/assess/stream`** to that base. Override with **`baseUrl`** if you use another deployment (for example **`http://127.0.0.1:8000/ailp`** when your server is mounted there).

For integration patterns, env loading in Node, and production security, see **[Integrating the AIRTA AILP TypeScript client](https://github.com/airtasystems/ailp/blob/main/integrating-airta-ailp-client.md)** in the repository. The HTTP contract (headers, log entry shape, streaming events) is described in the **[AILP server README](https://github.com/airtasystems/ailp/blob/main/README.md)**.

**Stable 3.01 release.** Follows semver — breaking changes will bump the major version.

---

## Requirements

To call AILP you need **two credentials**, both issued at **[ailp.airtasystems.com](https://ailp.airtasystems.com)**:

| Credential | Header sent | Option / env |
|------------|-------------|--------------|
| **AILP API key** | `Airta-Api-Key` | `apiKey` (Node) · `NEXT_PUBLIC_AILP_API_KEY` / `VITE_AILP_API_KEY` (React) |
| **Program ID** | `Airta-Program-Id` | `programId` (Node) · `NEXT_PUBLIC_AIRTASYSTEMS_PROGRAM_ID` / `VITE_AIRTASYSTEMS_PROGRAM_ID` (React) |

Sign in, create a program, copy the API key and program ID, and keep both in server-side env vars. The server rejects requests that are missing either header with HTTP 400.

Provider keys (`geminiApiKey` / `openaiApiKey`) are needed when you set **`provider`** / **`expertProvider`** / **`judgeProvider`** explicitly or when your hosted API program requires client-supplied pipeline keys. The client sends both hosted headers (**`Gemini-Api-Key`** / **`OpenAI-Api-Key`**) and compatibility headers (**`X-Gemini-Api-Key`** / **`X-OpenAI-Api-Key`**) when those keys are provided.

---

## Install

```bash
npm install @airtasystems/ailp
```

The package is **ESM** (`"type": "module"`). Import from **`@airtasystems/ailp`**; React helpers from **`@airtasystems/ailp/react`** (optional peer **`react`**).

---

## What you send and what you get

**Send:** With **`createAilp()`**, pass an array of **`{ role, content }`** messages (the conversation you sent to your LLM) and the **final assistant text** (`output`) from that model. The client builds a flat AILP log entry and posts it directly to the API. The hosted server validates **`airta_import: 1`** as a numeric import flag alongside the normal top-level log fields.

**Receive:** An **`AilpAssessResponse`** including:

| Field | Meaning |
|-------|---------|
| **`risk_level`** | Overall verdict (most severe finding across frameworks). |
| **`judge_reasoning`** | Judge synthesis string. |
| **`experts`** | One result per framework expert (`framework`, `risk_level`, `reasoning`). |
| **`frameworks`** | Resolved display names for the rubrics that ran. |
| **`assessment`** | Which vendor/models AILP used internally (**`expertProvider`**, **`judgeProvider`**, **`expertModel`**, **`judgeModel`**; legacy **`provider`** is **`"mixed"`** when sides differ). |
| **`log`** | Echo of the submitted entry. **`input.messages[*].content`** and **`output`** come back with PII/PHI placeholders substituted (see "Server-side redaction" below); all other fields echo verbatim. |

The **`model`** you attach (via `createAilp`’s third argument or a full **`AilpLogEntry`**) describes the **audited** model. The models used **inside** AILP for experts and judge come from **`provider`** / **`expertProvider`** / **`judgeProvider`** and server configuration — not from your product model name.

---

## Server-side redaction

AILP redacts PII/PHI in **`input.messages[*].content`** and **`output`** at ingress, before any LLM sees the data. Detected entities are replaced with numbered placeholders like **`<PERSON_1>`**, **`<EMAIL_ADDRESS_1>`**, **`<DATE_TIME_1>`**, **`<CUSTOMER_ID_1>`**, **`<MRN_1>`**. This means:

- The **`log`** field on the response carries the redacted text, not what you sent. If you need the raw content for your own correlation or storage, keep your original strings — don't round-trip them through AILP.
- The **`experts[*].reasoning`** and **`judge_reasoning`** strings only ever reference placeholders, so downstream UIs that render them are safe to display without further scrubbing.
- Redaction is enabled by default on the hosted deployment and on any self-hosted AILP built from the current Dockerfile. Self-hosters can tune the entity set or swap the NER model via **`AILP_REDACT_*`** env vars on the server — see the [AILP server README](https://github.com/airtasystems/ailp/blob/main/README.md#ingress-piiphi-redaction).

Nothing in the client needs to change for redaction to work — it happens server-side before the message hits any rubric.

---

## Quick start (`createAilp`)

Configure once, then call the returned function after each LLM response:

```typescript
import { createAilp } from "@airtasystems/ailp";

const ailp = createAilp({
  apiKey: process.env.AILP_API_KEY!,
  programId: process.env.AIRTASYSTEMS_PROGRAM_ID!,
  frameworks: ["eu-ai-act", "owasp-llm"],
});

const result = await ailp(messages, assistantText);
console.log(result.risk_level, result.judge_reasoning);
```

Optional third argument per call: **`{ model?, endpoint? }`** to record which model produced the output and an optional endpoint label.

**Omit `provider`** if your AILP server is configured to choose the expert/judge pipeline (and keys) itself — then you may not need to pass provider keys from the client. If you **do** set **`provider`** (or **`expertProvider`** / **`judgeProvider`**), supply the matching **`geminiApiKey`** and/or **`openaiApiKey`** so the client can send **`Gemini-Api-Key`** / **`OpenAI-Api-Key`** plus the **`X-*-Api-Key`** compatibility variants.

### `createAilp` options

| Option | Purpose |
|--------|---------|
| **`apiKey`** | **Required.** AILP API key from [ailp.airtasystems.com](https://ailp.airtasystems.com). Sent as **`Airta-Api-Key`**. |
| **`programId`** | **Required.** Program ID from ailp.airtasystems.com. Sent as **`Airta-Program-Id`** and echoed under **`airtasystems.programId`**. |
| **`frameworks`** | **Required.** One slug or an array (see table below). |
| **`baseUrl`** | API base URL, no trailing slash. Omit for **`AILP_DEFAULT_BASE_URL`** (`https://ailp.airtasystems.com/ailp`). |
| **`provider`** | **`"gemini"`** \| **`"openai"`** — same vendor for experts and judge when split fields omitted. Omit to let the server default. |
| **`expertProvider`** / **`judgeProvider`** | Split vendors; send both API keys when both sides need them. |
| **`geminiApiKey`** / **`openaiApiKey`** | Mapped to **`Gemini-Api-Key`** / **`OpenAI-Api-Key`** and **`X-Gemini-Api-Key`** / **`X-OpenAI-Api-Key`**. When all provider fields are omitted, non-empty keys may both be sent so mixed server configs still authenticate. |
| **`timeoutMs`** | Optional **`fetch` timeout** for assess calls. |

`createAilp()` throws synchronously if **`apiKey`** or **`programId`** is missing or empty — fail fast at boot rather than per request.

Export **`AILP_DEFAULT_BASE_URL`** when you need the constant in app code.

---

## Setup Guide for LLMs

When an LLM or coding agent is asked to integrate AILP into a JavaScript/TypeScript app, follow this checklist:

1. Install the package:

```bash
npm install @airtasystems/ailp
```

2. Use the hosted API default unless the user gives a different deployment:

```text
https://ailp.airtasystems.com/ailp
```

Do not append `/assess` yourself when using **`createAilp()`** or **`AilpClient`**; the client appends **`/health`**, **`/assess`**, or **`/assess/stream`**.

3. Require these app secrets:

```bash
AILP_API_KEY=...
AIRTASYSTEMS_PROGRAM_ID=...
```

If the app explicitly sets **`provider: "openai"`** or **`provider: "gemini"`**, also require the matching provider key:

```bash
OPENAI_API_KEY=...
# or
GEMINI_API_KEY=...
```

4. Prefer **`createAilp()`** for normal integrations:

```typescript
import { createAilp } from "@airtasystems/ailp";

const ailp = createAilp({
  apiKey: process.env.AILP_API_KEY!,
  programId: process.env.AIRTASYSTEMS_PROGRAM_ID!,
  frameworks: ["eu-ai-act", "owasp-llm"],
});

const result = await ailp(messages, assistantText, {
  model: "gpt-4o-mini",
  endpoint: "chat-completion",
});
```

5. Send the original LLM conversation as **`messages`** and the final assistant text as **`assistantText`**. Do not send the AILP assessment prompt, hidden system policy text, or provider SDK response object unless the application intentionally wants that audited.

6. For raw **`fetch`** integrations, post a flat JSON body to **`POST /assess`**. Do not wrap it as **`{ airta_import: entry }`**. The hosted API expects:

```js
{
  airta_import: 1,
  timestamp: new Date().toISOString(),
  input: { messages, endpoint: "chat-completion" },
  output: assistantText,
  modelTested: "gpt-4o-mini",
  framework: ["eu-ai-act", "owasp-llm"],
  airtasystems: {
    programId: process.env.AIRTASYSTEMS_PROGRAM_ID,
    frameworks: ["eu-ai-act", "owasp-llm"],
  },
}
```

7. For raw **`fetch`** headers, include:

| Header | Value |
|--------|-------|
| **`Content-Type`** | **`application/json`** |
| **`Airta-Api-Key`** | AILP API key |
| **`Airta-Program-Id`** | AIRTA Systems program ID |
| **`OpenAI-Api-Key`** / **`Gemini-Api-Key`** | Provider key when that provider is used by the AILP pipeline |
| **`X-OpenAI-Api-Key`** / **`X-Gemini-Api-Key`** | Compatibility variant; safe to send with the non-`X` header |

8. In browser apps, prefer a server route or proxy for production. **`NEXT_PUBLIC_*`** and **`VITE_*`** values are visible to users, so never expose production LLM provider keys in a public bundle.

9. If the API returns HTTP 400, print or log the JSON response body. Validation errors usually name the missing header, missing field, or bad request shape.

## `AilpClient` (full control)

```typescript
import { AilpClient, AILP_DEFAULT_BASE_URL } from "@airtasystems/ailp";

const client = new AilpClient({
  baseUrl: AILP_DEFAULT_BASE_URL,
  timeoutMs: 120_000,
  headers: { /* optional extra headers on every request */ },
});

const auth = {
  apiKey: process.env.AILP_API_KEY!,
  programId: process.env.AIRTASYSTEMS_PROGRAM_ID!,
  geminiApiKey,
  openaiApiKey,
};

await client.health(); // GET /health → boolean
await client.assess(entry, auth);
await client.assessStream(entry, auth, { onEvent });
```

- **`assess`** — sends the **`AilpLogEntry`** as a flat **`POST /assess`** body and returns the full **`AilpAssessResponse`**. Use **`airta_import: 1`** for hosted import-mode requests.
- **`assessStream`** — sends the **`AilpLogEntry`** as a flat **`POST /assess/stream`** body and reads NDJSON until **`done`**. Same final shape as **`assess`**.
- Non-2xx responses throw **`AilpError`** with **`status`** and **`body`**. A **400** mentioning **`Airta-Api-Key`** or **`Airta-Program-Id`** means the server rejected the request for missing auth.

The **`AilpAssessHeaders`** passed to **`assess`** / **`assessStream`** accepts **`apiKey`**, **`programId`**, **`geminiApiKey`**, and **`openaiApiKey`**. Use **`buildProviderAuthHeaders(entry, auth)`** if you build **`fetch`** yourself — it produces the correct **`Airta-*`**, provider-key, and **`X-*-Api-Key`** compatibility header set.

**Proxied streams:** **`readAilpAssessNdjsonStream(response.body, onEvent)`** parses **`POST /assess/stream`** from any **`fetch`** (for example your own Next.js route).

### Streaming events (`event` field)

Same contract as the server:

| `event` | Purpose |
|---------|---------|
| **`meta`** | Framework list + **`assessment`** metadata. |
| **`cached`** | Result served from server disk cache. |
| **`phase`** | **`experts`** or **`judge`** — UI hints during long LLM gaps. |
| **`expert`** | One expert payload (may include **`expert_id`**). |
| **`judge`** | Judge progress (**`risk_level`**, **`reasoning_preview`**). |
| **`done`** | Final payload — same keys as **`assess`**. |
| **`error`** | Terminal failure (**`detail`**). |

Types: **`AilpAssessStreamEvent`**, **`AilpAssessStreamExpertPayload`**, **`AilpAssessStreamOptions`**.

---

## Works with any LLM provider

Pass through **`messages`** and the **string output** from OpenAI, Anthropic, Gemini, or a custom stack:

```typescript
const response = await openai.chat.completions.create({ model, messages });
const text = response.choices[0]?.message?.content ?? "";
const res = await ailp(messages, text);
```

---

## Fire-and-forget wrappers

Assessment runs **after** your LLM returns; failures are logged, not thrown (unless your LLM call fails).

**OpenAI-shaped chat API:**

```typescript
import { wrapOpenAI, AilpClient, AILP_DEFAULT_BASE_URL } from "@airtasystems/ailp";

const client = new AilpClient({ baseUrl: AILP_DEFAULT_BASE_URL });

const response = await wrapOpenAI(
  (p) => openai.chat.completions.create(p),
  { model: "gpt-4o-mini", messages },
  {
    client,
    apiKey: process.env.AILP_API_KEY!,
    programId: process.env.AIRTASYSTEMS_PROGRAM_ID!,
    frameworks: ["eu-ai-act"],
    provider: "gemini",
    geminiApiKey: process.env.GEMINI_API_KEY,
    onAssess: (result) => console.log("Risk:", result.risk_level),
  },
);
```

**Any async LLM function:** **`wrapLlmCall(fn, params, { client, apiKey, programId, frameworks, extractOutput, messages, ... })`**. Both **`apiKey`** and **`programId`** are required.

---

## React (`@airtasystems/ailp/react`)

Keeps **`react`** out of the main bundle.

### `useAilp()` — recommended

Memoized **`createAilp`** + **`assess`** / **`result`** / **`loading`** / **`error`** / **`reset`**. Reads **Next.js** **`NEXT_PUBLIC_*`** or **Vite** **`VITE_*`** when options are omitted. Throws synchronously on the first render if **`apiKey`** or **`programId`** is missing — wrap in an error boundary if you want a graceful fallback.

```tsx
import { useAilp } from "@airtasystems/ailp/react";

function Panel() {
  const { assess, result, loading, error } = useAilp();

  async function run(messages: { role: string; content: string }[], output: string) {
    await assess(messages, output);
  }

  return (
    <>
      {loading && <p>Assessing…</p>}
      {error && <p>{error.message}</p>}
      {result && <p>Risk: {result.risk_level}</p>}
    </>
  );
}
```

Each **`assess`** clears the previous **`result`** and **`error`** before the new request. **`reset()`** clears UI state without assessing.

### Environment variables (browser)

Override any field by passing **`useAilp({ ... })`** instead of relying on env.

| Variable | Role |
|----------|------|
| **`NEXT_PUBLIC_AILP_API_KEY`** / **`VITE_AILP_API_KEY`** | **Required.** AILP API key from ailp.airtasystems.com. |
| **`NEXT_PUBLIC_AIRTASYSTEMS_PROGRAM_ID`** / **`VITE_AIRTASYSTEMS_PROGRAM_ID`** | **Required.** Program ID from ailp.airtasystems.com. |
| **`NEXT_PUBLIC_AILP_BASE_URL`** / **`VITE_AILP_BASE_URL`** | API base (including any path prefix, e.g. `/ailp`). Omit for **`AILP_DEFAULT_BASE_URL`** (`https://ailp.airtasystems.com/ailp`). |
| **`NEXT_PUBLIC_AILP_PROVIDER`** / **`VITE_AILP_PROVIDER`** | Omit so the **server** picks pipeline and keys. Set **`gemini`** or **`openai`** only when the browser must send provider API key headers. |
| **`NEXT_PUBLIC_GEMINI_API_KEY`** / **`VITE_GEMINI_API_KEY`** | Required when provider (or split experts/judge) uses Gemini. |
| **`NEXT_PUBLIC_OPENAI_API_KEY`** / **`VITE_OPENAI_API_KEY`** | Required when provider (or split experts/judge) uses OpenAI. |
| **`NEXT_PUBLIC_AILP_FRAMEWORKS`** / **`VITE_AILP_FRAMEWORKS`** | Comma-separated or JSON array; default **`eu-ai-act`**. |

**Security:** **`NEXT_PUBLIC_*`** / **`VITE_*`** values ship to the browser. Treat **`NEXT_PUBLIC_AILP_API_KEY`** as a scoped credential — use a program ID dedicated to browser traffic, and never put production LLM provider keys in public env vars. For sensitive deployments, call AILP from a **server route** or proxy and keep both the AILP key and LLM keys in private env vars.

### `useAssess(ailp)`

If you already have an **`AilpFn`** from **`createAilp()`**:

```tsx
import { createAilp } from "@airtasystems/ailp";
import { useAssess } from "@airtasystems/ailp/react";

const ailp = createAilp({
  apiKey: process.env.AILP_API_KEY!,
  programId: process.env.AIRTASYSTEMS_PROGRAM_ID!,
  frameworks: ["eu-ai-act"],
  geminiApiKey: process.env.GEMINI_API_KEY,
});
const { assess, result, loading, error } = useAssess(ailp);
```

---

## Framework slugs

Hyphen and underscore variants are accepted where listed.

| Slug(s) | Framework |
|---------|-----------|
| `eu_ai_act` / `eu-ai-act` | EU AI Act |
| `oecd` | OECD AI Principles (server default if none selected) |
| `owasp_llm` / `owasp-llm` | OWASP Top 10 for LLMs |
| `owasp_agent` / `owasp-agent` | OWASP Top 10 for Agentic Applications |
| `nist_ai_rmf` / `nist-ai-rmf` | NIST AI RMF |
| `mitre_attack` / `mitre-attack` | MITRE ATT&CK |
| `pld` | EU PLD (AI) |
| `fria_core` / `fria-core` | FRIA Core |
| `fria_extended` / `fria-extended` | FRIA Extended |

**OWASP:** LLM and agentic experts are **separate**; include **both** slugs in **`frameworks`** if you want both lenses in one request.

---

## Risk levels (severity)

`critical` › `high` › `medium` › `low` › `informational` › `compliant` › `indeterminate`

---

## Node: load `.env` before reading `process.env`

Node does not load **`.env`** automatically. Use **`dotenv`** (or your host’s secrets) **before** `createAilp` so **`AILP_API_KEY`**, **`AIRTASYSTEMS_PROGRAM_ID`**, and any provider keys are defined — otherwise `createAilp()` throws on start-up, or you may see **400** responses mentioning a missing **`Airta-Api-Key`**, **`Airta-Program-Id`**, **`OpenAI-Api-Key`**, or **`Gemini-Api-Key`** header.

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| `createAilp` throws at start-up | **`apiKey`** and **`programId`** are both required. Load env (e.g. `dotenv`) before `createAilp()`. |
| **400** — `Missing required header(s): Airta-Api-Key, Airta-Program-Id` | Pass **`apiKey`** / **`programId`** (or the corresponding env vars); values are trimmed, so whitespace-only strings are treated as missing. |
| **400** — missing provider API key | Align **`provider`** / split providers with the keys you pass; verify **`process.env`** at runtime. |
| **400** — bad body shape or missing import flag | Send a flat body with **`airta_import: 1`**, not **`{ airta_import: entry }`**. Include top-level **`timestamp`**, **`input`**, **`output`**, **`modelTested`**, **`framework`**, and **`airtasystems`**. |
| Wrong server | Set **`baseUrl`** (no trailing slash). |
| Timeouts | Increase **`timeoutMs`** or use **`assessStream`** for progressive UI. |
| **AilpError** | Inspect **`status`** and **`body`**; while testing raw scripts, print the response as **`JSON.stringify(result)`** so validation details are visible. |

---

## License

MIT
