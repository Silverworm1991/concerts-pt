import { z } from "zod";

/** Variables every service needs. Services can extend with their own. */
const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  RABBITMQ_URL: z.string().url(),
});

/**
 * Validate environment variables once, at startup.
 * A misconfigured service crashes immediately with a clear message
 * instead of failing later in some random code path.
 */
export function loadConfig<T extends z.ZodRawShape>(
  extra: T = {} as T,
  env: NodeJS.ProcessEnv = process.env,
) {
  const result = baseSchema.extend(extra).safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  return result.data;
}
