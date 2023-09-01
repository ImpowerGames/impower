import fastifyFormbody from "@fastify/formbody";
import fastifyMultipart from "@fastify/multipart";
import fastifySecureSession from "@fastify/secure-session";
import Fastify, { FastifyInstance } from "fastify";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import pino from "pino";
import env from "./plugins/env.js";
import livereload from "./plugins/livereload.js";
import googleDriveSyncProvider from "./plugins/providers/googleDriveSyncProvider.js";
import router from "./plugins/router.js";

const DEV_HTTPS_KEY_PATH = join(process.cwd(), "https", "key.pem");
const DEV_HTTPS_CERT_PATH = join(process.cwd(), "https", "cert.pem");

const IS_GOOGLE_CLOUD_RUN = process.env["K_SERVICE"] !== undefined;
const IS_PRODUCTION =
  process.env["NODE_ENV"] === "production" || IS_GOOGLE_CLOUD_RUN;

const reloader: { reload?: () => void } = {};

const app = IS_PRODUCTION
  ? (Fastify({
      logger: pino({
        messageKey: "message",
        formatters: {
          level(label: string, number: number) {
            return { severity: label };
          },
        },
      }),
      trustProxy: true,
    }) as unknown as FastifyInstance)
  : existsSync(DEV_HTTPS_KEY_PATH) && existsSync(DEV_HTTPS_CERT_PATH)
  ? (Fastify({
      http2: true,
      https: {
        key: readFileSync(DEV_HTTPS_KEY_PATH),
        cert: readFileSync(DEV_HTTPS_CERT_PATH),
      },
      logger: {
        transport: {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        },
      },
    }) as unknown as FastifyInstance)
  : (Fastify({
      logger: {
        transport: {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        },
      },
    }) as unknown as FastifyInstance);

export const startServer = async () => {
  try {
    if (!IS_PRODUCTION) {
      app.register(env);
      await app.after();
    }
    const cookieKey = process.env["SERVER_SESSION_COOKIE_KEY"];
    if (cookieKey) {
      app.register(fastifySecureSession, {
        key: Buffer.from(cookieKey, "hex"),
        cookie: {
          path: "/",
          httpOnly: true,
          sameSite: "strict",
          secure: IS_PRODUCTION,
        },
      });
    }
    app.register(fastifyFormbody);
    app.register(fastifyMultipart);
    app.register(googleDriveSyncProvider);
    app.register(router);
    if (!IS_PRODUCTION) {
      app.register(livereload, reloader);
    }
    await app.ready();
    const port = Number(process.env["PORT"] || 8080);
    const host = IS_GOOGLE_CLOUD_RUN
      ? "0.0.0.0"
      : process.env["HOST"] || "localhost";
    await app.listen({ host, port });
    return app;
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => {
  app.log.info("Server Terminated.");
  process.exit(0);
});
process.on("SIGINT", () => {
  app.log.info("Server Interrupted.");
  process.exit(0);
});

startServer();

export default { app, reloader };
