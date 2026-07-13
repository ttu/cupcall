import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

// apps/web uses "type": "module" — __dirname is not available; derive it from import.meta.url
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

export default function globalSetup(): void {
  // Loads the static e2e-open/e2e-seeded fixtures (never touches the live wc-2026 data, so
  // specs stay stable regardless of the real tournament's progress) and seeds a 10-member pool
  // with varied predictions for the leaderboard/results/late-joiner specs.
  // The script auto-loads apps/web/.env.local when DATABASE_URL is not set.
  execSync('pnpm seed:e2e', { cwd: repoRoot, stdio: 'inherit' });
}
