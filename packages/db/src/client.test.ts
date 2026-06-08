import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { createPgliteDb } from './client.js';

describe('createPgliteDb', () => {
  it('executes a raw SQL query against the in-memory PGlite instance', async () => {
    const db = createPgliteDb();
    const result = await db.execute(sql`select 1 as one`);
    // The pglite driver returns { rows: Row[] } via the Db (postgres-js) execute type.
    // Access rows via the result object's rows property.
    const rows = Array.isArray(result) ? result : (result as { rows: unknown[] }).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ one: 1 });
  });
});
