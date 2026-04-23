/** So `import.meta.env.VITE_*` type-checks when building this package (Vite replaces at app build). */
interface ImportMetaEnv {
  readonly VITE_AILP_BASE_URL?: string;
  readonly VITE_AILP_API_KEY?: string;
  readonly VITE_AIRTASYSTEMS_PROGRAM_ID?: string;
  readonly VITE_AILP_FRAMEWORKS?: string;
  readonly VITE_AILP_PROVIDER?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_OPENAI_API_KEY?: string;
}

interface ImportMeta {
  /** Present in Vite; often absent in Next.js — always use optional chaining when reading. */
  readonly env?: ImportMetaEnv;
}
