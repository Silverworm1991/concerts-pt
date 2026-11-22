import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateUp, migrationStatus, runSeeds } from "./runner.js";

// Integration tests: need a real Postgres. Skipped unless TEST_DATABASE_URL is set, e.g.
//   TEST_DATABASE_URL=postgres://concerts:concerts@localhost:5432/postgres npm test
// Each run creates (and drops) its own throwaway database.
const adminUrl = process.env.TEST_DATABASE_URL;
const silent = { info: () => {} };

describe.skipIf(!adminUrl)("database schema", () => {
  const dbName = `concerts_test_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;
  let admin: pg.Client;
  let db: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    await migrateUp(db, silent);
    await runSeeds(db, silent);
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin?.end();
  });

  const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;

  async function newEvent(title = "Test Show") {
    const [v] = await q("SELECT id FROM venues WHERE name_norm = 'meo arena'");
    const [e] = await q(
      `INSERT INTO events (title, venue_id, start_at, local_date)
       VALUES ($1, $2, '2027-06-01 20:00+01', '2027-06-01') RETURNING id`,
      [title, v.id],
    );
    return e.id as number;
  }

  it("applies cleanly and is idempotent", async () => {
    expect(await migrateUp(db, silent)).toBe(0);
    const status = await migrationStatus(db);
    expect(status.every((s) => s.state === "applied")).toBe(true);
  });

  it("detects a modified migration", async () => {
    const [orig] = await q("SELECT checksum FROM schema_migrations WHERE version = '001'");
    await db.query("UPDATE schema_migrations SET checksum = 'tampered' WHERE version = '001'");
    await expect(migrateUp(db, silent)).rejects.toThrow(/modified after being applied/);
    expect((await migrationStatus(db))[0]?.state).toBe("MODIFIED");
    await db.query("UPDATE schema_migrations SET checksum = $1 WHERE version = '001'", [orig.checksum]);
    expect(await migrateUp(db, silent)).toBe(0);
  });

  it("rolls back a failing migration completely", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mig-"));
    await writeFile(join(dir, "900_bad.sql"), "CREATE TABLE half_done (id int); SELECT 1/0;");
    await expect(migrateUp(db, silent, pathToFileURL(dir + "/"))).rejects.toThrow(/900_bad.sql failed/);
    expect(await q("SELECT to_regclass('half_done') AS t")).toEqual([{ t: null }]);
    expect(await q("SELECT 1 FROM schema_migrations WHERE version = '900'")).toHaveLength(0);
  });

  it("normalizes Portuguese names (accents, case, spacing)", async () => {
    const [r] = await q("SELECT norm_name('  Sétima   ÉVORA ') AS n");
    expect(r.n).toBe("setima evora");
  });

  it("seeds are idempotent", async () => {
    const before = await q("SELECT (SELECT count(*) FROM cities) c, (SELECT count(*) FROM venues) v, (SELECT count(*) FROM sources) s");
    await runSeeds(db, silent);
    const after = await q("SELECT (SELECT count(*) FROM cities) c, (SELECT count(*) FROM venues) v, (SELECT count(*) FROM sources) s");
    expect(after).toEqual(before);
    expect(Number(after[0].c)).toBeGreaterThanOrEqual(15);
  });

  it("resolves a renamed venue through its aliases", async () => {
    const rows = await q(
      `SELECT v.name FROM venue_aliases a JOIN venues v ON v.id = a.venue_id
       WHERE a.alias_norm = norm_name($1)`,
      ["Pavilhão Atlântico"],
    );
    expect(rows).toEqual([{ name: "MEO Arena" }]);
  });

  it("stores Azores/Madeira timezones", async () => {
    const [r] = await q("SELECT timezone FROM cities WHERE name_norm = 'ponta delgada'");
    expect(r.timezone).toBe("Atlantic/Azores");
  });

  it("rejects an offer whose max price is below its min", async () => {
    const id = await newEvent();
    await expect(
      db.query(
        `INSERT INTO event_offers (event_id, source_id, external_id, url, price_min_cents, price_max_cents)
         VALUES ($1, 'ticketline', 'x1', 'https://x', 5000, 2500)`,
        [id],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("allows one offer per (source, external_id) only", async () => {
    const id = await newEvent();
    const ins = () =>
      db.query(
        `INSERT INTO event_offers (event_id, source_id, external_id, url, price_min_cents)
         VALUES ($1, 'bol', 'dup-1', 'https://x', 2000)`,
        [id],
      );
    await ins();
    await expect(ins()).rejects.toThrow(/duplicate key/);
  });

  it("deleting an event removes its offers", async () => {
    const id = await newEvent();
    await db.query(
      `INSERT INTO event_offers (event_id, source_id, external_id, url) VALUES ($1,'blueticket','del-1','https://x')`,
      [id],
    );
    await db.query("DELETE FROM events WHERE id = $1", [id]);
    expect(await q("SELECT 1 FROM event_offers WHERE external_id = 'del-1'")).toHaveLength(0);
  });

  it("rejects an event that ends before it starts, and an invalid status", async () => {
    const [v] = await q("SELECT id FROM venues LIMIT 1");
    await expect(
      db.query(
        `INSERT INTO events (title, venue_id, start_at, end_at, local_date)
         VALUES ('bad', $1, '2027-06-01 22:00+00', '2027-06-01 20:00+00', '2027-06-01')`, [v.id]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(
        `INSERT INTO events (title, venue_id, start_at, local_date, status)
         VALUES ('bad', $1, now(), current_date, 'maybe')`, [v.id]),
    ).rejects.toThrow(/check constraint/);
  });

  it("does not store the same raw payload twice", async () => {
    const ins = () =>
      db.query(
        `INSERT INTO raw_events (source_id, external_id, payload, payload_hash)
         VALUES ('ticketline', 'abc', '{"a":1}', 'h1')`);
    await ins();
    await expect(ins()).rejects.toThrow(/duplicate key/);
  });

  it("bumps updated_at on update", async () => {
    const id = await newEvent("Before");
    const [a] = await q("SELECT updated_at FROM events WHERE id = $1", [id]);
    await new Promise((r) => setTimeout(r, 20));
    await db.query("UPDATE events SET title = 'After' WHERE id = $1", [id]);
    const [b] = await q("SELECT updated_at FROM events WHERE id = $1", [id]);
    expect(new Date(b.updated_at).getTime()).toBeGreaterThan(new Date(a.updated_at).getTime());
  });
});
