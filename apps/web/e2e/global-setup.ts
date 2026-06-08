import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

// apps/web uses "type": "module" — __dirname is not available; derive it from import.meta.url
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

export default function globalSetup(): void {
  // Ensure wc-2026 tournament data is present in the dev DB before tests run.
  // The sync script auto-loads apps/web/.env.local when DATABASE_URL is not set.
  execSync('pnpm sync -- wc-2026', { cwd: repoRoot, stdio: 'inherit' });
}
