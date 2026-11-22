import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type pg from "pg";

export interface Logger {
  info: (obj: object | string, msg?: string) => void;
}

export const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);
export const SEEDS_DIR = new URL("../seeds/", import.meta.url);

// Arbitrary constant: ensures two migrate containers never run at the same time.
const ADVISORY_LOCK_ID = 727_001;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function readSqlFiles(dir: URL) {
  const names = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(new URL(name, dir), "utf8");
      return { name, version: name.split("_")[0]!, sql, checksum: sha256(sql) };
    }),
  );
}

async function withLock<T>(client: pg.Client, fn: () => Promise<T>): Promise<T> {
  await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_ID]);
  try {
    return await fn();
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_ID]);
  }
}

/**
 * Applies pending migrations in filename order, each in its own transaction.
 * Already-applied migrations are checksum-verified: editing a migration that has
 * run is an error (write a new migration instead).
 */
export async function migrateUp(client: pg.Client, log: Logger, dir: URL = MIGRATIONS_DIR) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     text PRIMARY KEY,
      name        text NOT NULL,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )`);

  return withLock(client, async () => {
    const files = await readSqlFiles(dir);
    const { rows } = await client.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM schema_migrations",
    );
    const applied = new Map(rows.map((r) => [r.version, r.checksum]));
    let count = 0;

    for (const f of files) {
      const existing = applied.get(f.version);
      if (existing) {
        if (existing !== f.checksum) {
          throw new Error(
            `Migration ${f.name} was modified after being applied. ` +
              `Never edit applied migrations; add a new one.`,
          );
        }
        continue;
      }
      log.info({ migration: f.name }, "applying migration");
      try {
        await client.query("BEGIN");
        await client.query(f.sql);
        await client.query(
          "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
          [f.version, f.name, f.checksum],
        );
        await client.query("COMMIT");
        count++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${f.name} failed: ${(err as Error).message}`);
      }
    }
    log.info({ applied: count, total: files.length }, "migrations up to date");
    return count;
  });
}

/** Seeds are idempotent SQL (ON CONFLICT DO NOTHING) and run on every start. */
export async function runSeeds(client: pg.Client, log: Logger, dir: URL = SEEDS_DIR) {
  return withLock(client, async () => {
    for (const f of await readSqlFiles(dir)) {
      log.info({ seed: f.name }, "running seed");
      try {
        await client.query("BEGIN");
        await client.query(f.sql);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Seed ${f.name} failed: ${(err as Error).message}`);
      }
    }
  });
}

export async function migrationStatus(client: pg.Client, dir: URL = MIGRATIONS_DIR) {
  const exists = await client.query("SELECT to_regclass('schema_migrations') AS t");
  const applied = new Map<string, string>();
  if (exists.rows[0].t) {
    const { rows } = await client.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM schema_migrations",
    );
    rows.forEach((r) => applied.set(r.version, r.checksum));
  }
  return (await readSqlFiles(dir)).map((f) => ({
    name: f.name,
    state: !applied.has(f.version) ? "pending" : applied.get(f.version) === f.checksum ? "applied" : "MODIFIED",
  }));
}
