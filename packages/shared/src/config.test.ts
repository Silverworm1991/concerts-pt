import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const valid = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  RABBITMQ_URL: "amqp://guest:guest@localhost:5672",
};

describe("loadConfig", () => {
  it("applies defaults", () => {
    const c = loadConfig({}, valid);
    expect(c.PORT).toBe(3000);
    expect(c.LOG_LEVEL).toBe("info");
  });

  it("coerces PORT to a number", () => {
    expect(loadConfig({}, { ...valid, PORT: "4010" }).PORT).toBe(4010);
  });

  it("fails fast with a readable message when required vars are missing", () => {
    expect(() => loadConfig({}, {})).toThrow(/DATABASE_URL/);
  });
});
