import { describe, expect, it } from "vitest";
import { createService } from "./service.js";

describe("createService", () => {
  it("exposes /health", async () => {
    const { app } = await createService({ name: "t", port: 0, logLevel: "silent" });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", service: "t" });
  });

  it("/ready returns 503 when a dependency fails", async () => {
    const { app } = await createService({
      name: "t", port: 0, logLevel: "silent",
      checks: [{ name: "db", run: async () => { throw new Error("down"); } }],
    });
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(503);
  });

  it("echoes a request id header", async () => {
    const { app } = await createService({ name: "t", port: 0, logLevel: "silent" });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-request-id"]).toBeTruthy();
  });
});
