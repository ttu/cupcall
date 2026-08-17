/**
 * scripts/load-local-env.ts — loads apps/web/.env.local into process.env when DATABASE_URL is
 * absent, without overwriting any key that is already set. Strips surrounding single or double
 * quotes from parsed values, matching standard dotenv behaviour.
 */
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

export function loadLocalEnv(): void {
  if (process.env['DATABASE_URL']) return;

  const envPath = join(process.cwd(), 'apps', 'web', '.env.local');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = val;
  }
}
