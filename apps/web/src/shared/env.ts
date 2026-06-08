import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url('must be a valid URL'),
  AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  AUTH_URL: z.string().url('must be a valid URL'),
  RESEND_API_KEY: z.string().min(1, 'must not be empty'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates a raw env-like object against the required environment variables.
 * Throws with an aggregated, human-readable message listing every invalid/missing var.
 * Exported separately from `env` so tests can call it with crafted objects.
 */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => {
    const key = issue.path.join('.');
    return `  ${key}: ${issue.message}`;
  });
  throw new Error(`Invalid environment variables:\n${lines.join('\n')}`);
}

/**
 * Lazily-validated env singleton for app use.
 * Validates process.env exactly once on first access.
 */
let _env: Env | undefined;
export function getEnv(): Env {
  if (!_env) {
    _env = parseEnv(process.env as Record<string, string | undefined>);
  }
  return _env;
}

/**
 * Pre-validated env for import convenience. Fails fast at startup if env is invalid.
 * Use `parseEnv` in tests instead.
 *
 * Note: lazy via a Proxy so the module can be imported in test files without
 * triggering validation (tests use parseEnv directly with crafted objects).
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});
