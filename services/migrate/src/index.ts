import pg from "pg";
import { createLogger, loadConfig } from "@concerts/shared";
import { migrateUp, migrationStatus, runSeeds } from "./runner.js";

// One-shot job (not an HTTP service): runs the commands given on the CLI, in order.
//   node dist/index.js up seed     apply migrations, then seed reference data
//   node dist/index.js status      show applied / pending migrations
const config = loadConfig();
const log = createLogger("migrate", config.LOG_LEVEL);
const commands = process.argv.slice(2);
if (commands.length === 0) commands.push("up");

const client = new pg.Client({ connectionString: config.DATABASE_URL });

try {
  await client.connect();
  for (const cmd of commands) {
    if (cmd === "up") await migrateUp(client, log);
    else if (cmd === "seed") await runSeeds(client, log);
    else if (cmd === "status") console.table(await migrationStatus(client));
    else throw new Error(`Unknown command "${cmd}" (use: up | seed | status)`);
  }
} catch (err) {
  log.error({ err }, "migrate failed");
  process.exitCode = 1;
} finally {
  await client.end();
}
