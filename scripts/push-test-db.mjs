/**
 * Synchronises the SQLite schema used by the automated test suite.
 *
 * WHY THIS EXISTS
 * ---------------
 * `prisma db push` reads DATABASE_URL from .env, which points at the local
 * development database (file:./dev.db -> prisma/dev.db). The test suite instead
 * points at a dedicated throwaway file (file:./prisma/dev.db, set in
 * tests/env-setup.ts) so that test rows never land in real development data.
 *
 * Prisma does not accept a --url flag for `db push`, and it does not reload a
 * different env file. So this small wrapper sets the exact same connection
 * string the tests use and then invokes the Prisma CLI, keeping both in sync
 * from one source of truth.
 *
 * Safe by construction: it only ever runs against the SQLite test schema.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Must match tests/env-setup.ts exactly.
process.env.DATABASE_URL = 'file:./prisma/dev.db';

const result = spawnSync('npx', ['prisma', 'db', 'push', '--schema', 'prisma/schema.sqlite.prisma', '--skip-generate', '--accept-data-loss'], {
  cwd: root,
  encoding: 'utf8',
  // On Windows `npx` is a .cmd shim, which spawnSync can only launch via a shell.
  shell: process.platform === 'win32',
  env: { ...process.env },
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) {
  console.error('Failed to run prisma db push:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);