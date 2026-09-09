/**
 * Strips credentials out of log output before it leaves the server.
 *
 * Container logs are not written with an audience in mind. LiteLLM prints
 * request detail, Postgres prints connection strings, and `DATABASE_URL`
 * carries its own password. Anything streamed to a browser has to be filtered
 * on the way out.
 *
 * This reduces exposure; it does not remove it. A service that prints a secret
 * in a shape not listed here will still print it, which is why the stream is
 * gated to development in the first place — see `logStreamEnabled`.
 */

const MASK = "***REDACTED***";

/**
 * Environment variables whose *values* are replaced wherever they appear.
 *
 * This is the only reliable way to catch a key a service echoed in a format no
 * pattern anticipates.
 */
const SECRET_ENV_KEYS = [
  "GEMINI_API_KEY",
  "LITELLM_MASTER_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "AWS_SECRET_KEY",
  "AWS_ACCESS_KEY",
  "AUTH_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "META_APP_SECRET",
  "LINKEDIN_CLIENT_SECRET",
  "CRON_SECRET",
];

/**
 * Below this length a value is too generic to substitute blindly.
 *
 * A secret set to something short — or to a word that also occurs in ordinary
 * output — would turn every log line into redaction noise.
 */
const MIN_LITERAL_LENGTH = 8;

/** Patterns applied in order. Each keeps its label so output stays readable. */
const PATTERNS: { re: RegExp; replace: string }[] = [
  // AWS key ids: the prefix plus uppercase alphanumerics is distinctive, and
  // there is no reliable upper bound on the length. Pinning it to exactly 16
  // trailing characters -- the documented length -- let a 17-character key
  // through untouched, which is the wrong way for this to fail.
  { re: /\b(?:AKIA|ASIA|AIDA|AROA|AGPA|AIPA|ANPA|ANVA|APKA)[0-9A-Z]{12,}\b/g, replace: MASK },
  // `Authorization: Bearer <token>` and bare `Bearer <token>`.
  { re: /\b(Bearer)\s+[A-Za-z0-9._\-+/=]{8,}/gi, replace: `$1 ${MASK}` },
  // Credentials inside a connection string, password half only.
  { re: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s@/]+@/gi, replace: `$1:${MASK}@` },
  // Key-ish query parameters and assignments: key=, api_key=, apikey=,
  // access_token=, password=, secret=, token=.
  {
    re: /\b((?:[a-z]+[_-])?(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|password|passwd|secret|token|key))(["']?\s*[=:]\s*["']?)([^\s"'&,;)}\]]{8,})/gi,
    replace: `$1$2${MASK}`,
  },
  // Anthropic and OpenAI keys have recognisable prefixes.
  { re: /\bsk-[A-Za-z0-9._\-]{12,}/g, replace: MASK },
];

/** Values pulled from the environment, longest first so the greediest wins. */
function secretLiterals(): string[] {
  const values: string[] = [];
  for (const name of SECRET_ENV_KEYS) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim().length >= MIN_LITERAL_LENGTH) {
      values.push(value.trim());
    }
  }
  // A longer secret that contains a shorter one must be masked first,
  // otherwise the inner match leaves the surrounding characters exposed.
  return values.sort((a, b) => b.length - a.length);
}

export function redactSecrets(line: string): string {
  let out = line;

  for (const literal of secretLiterals()) {
    out = out.split(literal).join(MASK);
  }

  for (const { re, replace } of PATTERNS) {
    // Each regex is global, and `replace` resets lastIndex, so reuse is safe.
    out = out.replace(re, replace);
  }

  return out;
}

export const REDACTION_MASK = MASK;
