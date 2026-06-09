import postgres from 'postgres';

export async function resetSchema(connectionString: string): Promise<void> {
  const sql = postgres(connectionString);
  await sql`DROP SCHEMA public CASCADE`;
  // drizzle-kit stores its migration journal in the `drizzle` schema;
  // dropping it forces all migrations to re-run on the next migrate call.
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await sql`CREATE SCHEMA public`;
  await sql.end();
}
