import { randomUUID } from "node:crypto";
import net from "node:net";
import Fastify, { type FastifyInstance } from "fastify";

export interface Check {
  name: string;
  run: () => Promise<void>;
}

const DEFAULT_PORTS: Record<string, number> = {
  "postgres:": 5432,
  "postgresql:": 5432,
  "amqp:": 5672,
  "redis:": 6379,
  "http:": 80,
  "https:": 443,
};

/** Readiness check: can we open a TCP connection to the dependency in the URL? */
export function tcpCheck(name: string, url: string, timeoutMs = 2000): Check {
  const u = new URL(url);
  const port = Number(u.port) || DEFAULT_PORTS[u.protocol] || 80;
  return {
    name,
    run: () =>
      new Promise<void>((resolve, reject) => {
        const socket = net.connect({ host: u.hostname, port });
        socket.setTimeout(timeoutMs);
        socket.once("connect", () => { socket.destroy(); resolve(); });
        socket.once("timeout", () => { socket.destroy(); reject(new Error("timeout")); });
        socket.once("error", (err) => { socket.destroy(); reject(err); });
      }),
  };
}

export interface ServiceOptions {
  name: string;
  port: number;
  logLevel?: string;
  checks?: Check[];
  routes?: (app: FastifyInstance) => Promise<void> | void;
}

/**
 * Standard HTTP service skeleton:
 *  - structured JSON logs with request IDs (x-request-id is propagated)
 *  - GET /health  -> liveness (process is up)
 *  - GET /ready   -> readiness (dependencies reachable)
 *  - graceful shutdown on SIGTERM / SIGINT
 */
export async function createService(opts: ServiceOptions) {
  const app = Fastify({
    logger: {
      level: opts.logLevel ?? "info",
      base: { service: opts.name },
      redact: ["req.headers.authorization"],
    },
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  app.get("/health", async () => ({ status: "ok", service: opts.name }));

  app.get("/ready", async (_req, reply) => {
    const results = await Promise.all(
      (opts.checks ?? []).map(async (c) => {
        try {
          await c.run();
          return { name: c.name, ok: true };
        } catch (err) {
          return { name: c.name, ok: false, error: (err as Error).message };
        }
      }),
    );
    const ready = results.every((r) => r.ok);
    return reply.code(ready ? 200 : 503).send({ status: ready ? "ready" : "not_ready", checks: results });
  });

  await opts.routes?.(app);

  async function start() {
    const shutdown = async (signal: string) => {
      app.log.info({ signal }, "shutting down");
      await app.close();
      process.exit(0);
    };
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));
    await app.listen({ port: opts.port, host: "0.0.0.0" });
  }

  return { app, start };
}
