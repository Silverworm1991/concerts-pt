import pino, { type Logger } from "pino";

/**
 * Logging convention: JSON to stdout, always with a `service` field.
 * HTTP services get request IDs via createService(); workers use this directly.
 */
export function createLogger(service: string, level = "info"): Logger {
  return pino({
    level,
    base: { service },
    redact: ["req.headers.authorization", "*.password", "*.token"],
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
