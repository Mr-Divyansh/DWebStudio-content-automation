/**
 * Test environment bootstrap.
 *
 * MUST be the first import in run-tests.ts.
 *
 * Why this file exists: the committed Prisma schema targets PostgreSQL for
 * production, but local test runs use the git-ignored SQLite database through
 * prisma/schema.sqlite.prisma. `server/src/database/client.ts` constructs the
 * PrismaClient at module-evaluation time, and ES module imports are evaluated
 * before any statement in the importing file, so the connection string has to be
 * in place BEFORE that module is loaded. Importing this side-effect module first
 * guarantees the correct ordering.
 *
 * No secret is ever written here; the value is a local file path only.
 */

import dotenv from 'dotenv';

dotenv.config();

// Tests always use the committed SQLite override. A production DATABASE_URL
// must never be used accidentally by the local mocked test suite.
process.env.DATABASE_URL = 'file:./prisma/dev.db';
