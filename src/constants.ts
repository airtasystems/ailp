/**
 * Default base URL for the AIRTA-hosted AILP API (no trailing slash).
 * API routes live under the `/ailp` path on the host.
 * Override with `NEXT_PUBLIC_AILP_BASE_URL` / `VITE_AILP_BASE_URL`, or pass
 * `baseUrl` to `createAilp()` / `useAilp()`, when using a self-hosted instance.
 */
export const AILP_DEFAULT_BASE_URL = "https://ailp.airtasystems.com/ailp";
