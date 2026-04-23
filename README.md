# @airtasystems/ailp

**LLM log visibility and risk assessment** — sends llm input/outputs to ailp.airtasystems.com dashboard for log and compliance visibility. Manage and view your AI logs in one easy to use dashboard.

This package is a thin **`fetch`** client for the **AILP** (AI Log Protocol) HTTP API. It runs in **Node 18+**, browsers, workers, and edge runtimes that provide native `fetch`. No extra HTTP dependencies.

**Default server:** AIRTA hosts a public deployment at **`https://ailp.airtasystems.com`** (no trailing slash). Paths **`/health`**, **`/assess`**, and **`/assess/stream`** are appended for you. Use **`baseUrl`** for your own deployment (for example **`http://127.0.0.1:8000`**).

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

Provider keys (`geminiApiKey` / `openaiApiKey`) are only needed when you set **`provider`** / **`expertProvider`** / **`judgeProvider`** explicitly; otherwise the server uses its own configured keys.

---

## Install

```bash
npm install @airtasystems/ailp
```

The package is **ESM** (`"type": "module"`). Import from **`@airtasystems/ailp`**; React helpers from **`@airtasystems/ailp/react`** (optional peer **`react`**).

---

## What you send and what you get

**Send:** An array of **`{ role, content }`** messages (the conversation you sent to your LLM) and the **final assistant text** (`output`) from that model.

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

**Omit `provider`** if your AILP server is configured to choose the expert/judge pipeline (and keys) itself — then you do **not** need to pass provider keys from the client. If you **do** set **`provider`** (or **`expertProvider`** / **`judgeProvider`**), supply the matching **`geminiApiKey`** and/or **`openaiApiKey`** so the client can send **`X-Gemini-Api-Key`** and **`X-OpenAI-Api-Key`** as required.

### `createAilp` options

| Option | Purpose |
|--------|---------|
| **`apiKey`** | **Required.** AILP API key from [ailp.airtasystems.com](https://ailp.airtasystems.com). Sent as **`Airta-Api-Key`**. |
| **`programId`** | **Required.** Program ID from ailp.airtasystems.com. Sent as **`Airta-Program-Id`** and echoed under **`airtasystems.programId`**. |
| **`frameworks`** | **Required.** One slug or an array (see table below). |
| **`baseUrl`** | Server origin, no trailing slash. Omit for **`AILP_DEFAULT_BASE_URL`** (`https://ailp.airtasystems.com`). |
| **`provider`** | **`"gemini"`** \| **`"openai"`** — same vendor for experts and judge when split fields omitted. Omit to let the server default. |
| **`expertProvider`** / **`judgeProvider`** | Split vendors; send both API keys when both sides need them. |
| **`geminiApiKey`** / **`openaiApiKey`** | Mapped to **`X-Gemini-Api-Key`** / **`X-OpenAI-Api-Key`**. When all provider fields are omitted, non-empty keys may both be sent so mixed server configs still authenticate. |
| **`timeoutMs`** | Optional **`fetch` timeout** for assess calls. |

`createAilp()` throws synchronously if **`apiKey`** or **`programId`** is missing or empty — fail fast at boot rather than per request.

Export **`AILP_DEFAULT_BASE_URL`** when you need the constant in app code.

---

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

- **`assess`** — **`POST /assess`**, returns full **`AilpAssessResponse`**.
- **`assessStream`** — **`POST /assess/stream`**, NDJSON until **`done`**. Same final shape as **`assess`**.
- Non-2xx responses throw **`AilpError`** with **`status`** and **`body`**. A **400** mentioning **`Airta-Api-Key`** or **`Airta-Program-Id`** means the server rejected the request for missing auth.

The **`AilpAssessHeaders`** passed to **`assess`** / **`assessStream`** accepts **`apiKey`**, **`programId`**, **`geminiApiKey`**, and **`openaiApiKey`**. Use **`buildProviderAuthHeaders(entry, auth)`** if you build **`fetch`** yourself — it produces the correct **`Airta-*`** and **`X-*-Api-Key`** header set.

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
| **`NEXT_PUBLIC_AILP_BASE_URL`** / **`VITE_AILP_BASE_URL`** | Self-hosted or local origin. Omit for **`AILP_DEFAULT_BASE_URL`**. |
| **`NEXT_PUBLIC_AILP_PROVIDER`** / **`VITE_AILP_PROVIDER`** | Omit so the **server** picks pipeline and keys. Set **`gemini`** or **`openai`** only when the browser must send **`X-*-Api-Key`**. |
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

Node does not load **`.env`** automatically. Use **`dotenv`** (or your host’s secrets) **before** `createAilp` so **`AILP_API_KEY`**, **`AIRTASYSTEMS_PROGRAM_ID`**, and any provider keys are defined — otherwise `createAilp()` throws on start-up, or you may see **400** responses mentioning a missing **`Airta-Api-Key`**, **`Airta-Program-Id`**, or **`X-*-Api-Key`** header.

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| `createAilp` throws at start-up | **`apiKey`** and **`programId`** are both required. Load env (e.g. `dotenv`) before `createAilp()`. |
| **400** — `Missing required header(s): Airta-Api-Key, Airta-Program-Id` | Pass **`apiKey`** / **`programId`** (or the corresponding env vars); values are trimmed, so whitespace-only strings are treated as missing. |
| **400** — missing provider API key | Align **`provider`** / split providers with the keys you pass; verify **`process.env`** at runtime. |
| Wrong server | Set **`baseUrl`** (no trailing slash). |
| Timeouts | Increase **`timeoutMs`** or use **`assessStream`** for progressive UI. |
| **AilpError** | Inspect **`status`** and **`body`**. |

---

## License

MIT
