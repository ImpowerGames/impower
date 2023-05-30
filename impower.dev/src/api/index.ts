import Fastify, { FastifyServerOptions } from "fastify";
import pino from "pino";
import livereload from "./plugins/livereload.js";
import router from "./plugins/router.js";

const IS_GOOGLE_CLOUD_RUN = process.env["K_SERVICE"] !== undefined;
const IS_PRODUCTION =
  process.env["NODE_ENV"] === "production" || IS_GOOGLE_CLOUD_RUN;

const reloader: { reload?: () => void } = {};

const config: FastifyServerOptions = IS_PRODUCTION
  ? {
      logger: pino({
        messageKey: "message",
        formatters: {
          level(label: string, number: number) {
            return { severity: label };
          },
        },
      }),
      trustProxy: true,
    }
  : {
      logger: {
        transport: {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        },
      },
    };
const app = Fastify(config);
app.register(router);
if (!IS_PRODUCTION) {
  app.register(livereload, reloader);
}

export const startServer = async () => {
  try {
    await app.ready();
    const port = Number(process.env["PORT"] || 8080);
    const host = IS_GOOGLE_CLOUD_RUN
      ? "0.0.0.0"
      : process.env["HOST"] || "localhost";
    const address = await app.listen({ host, port });
    console.log(`Listening on ${address}`);
    return app;
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

/**
 * Listen for termination signal
 */
process.on("SIGTERM", () => {
  // Clean up resources on shutdown
  app.log.info("Server Terminated.");
});

startServer();

export default { app, reloader };
