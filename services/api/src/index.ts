import { createService, loadConfig, tcpCheck } from "@concerts/shared";

const config = loadConfig();

const service = await createService({
  name: "api",
  port: config.PORT,
  logLevel: config.LOG_LEVEL,
  checks: [
    tcpCheck("postgres", config.DATABASE_URL),
    tcpCheck("rabbitmq", config.RABBITMQ_URL),
  ],
  routes: (app) => {
    app.get("/v1/ping", async () => ({ pong: true }));
  },
});

await service.start();
