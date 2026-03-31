import Fastify from "fastify";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import env from "./plugins/env";
import googleDriveSyncProvider from "./plugins/providers/googleDriveSyncProvider";
import router from "./plugins/router.js";

const IS_GOOGLE_CLOUD_RUN = process?.env?.["K_SERVICE"] !== undefined;
const IS_PRODUCTION =
  process?.env?.["NODE_ENV"] === "production" || IS_GOOGLE_CLOUD_RUN;

const DEV_HTTPS_KEY_PATH = join(process?.cwd?.() || "", "https", "key.pem");
const DEV_HTTPS_CERT_PATH = join(process?.cwd?.() || "", "https", "cert.pem");

const HTTPS_CONFIG =
  existsSync(DEV_HTTPS_KEY_PATH) && existsSync(DEV_HTTPS_CERT_PATH)
    ? {
        http2: true,
        https: {
          key: readFileSync(DEV_HTTPS_KEY_PATH),
          cert: readFileSync(DEV_HTTPS_CERT_PATH),
        },
      }
    : {};

const app = IS_PRODUCTION
  ? Fastify({
      logger: true,
      trustProxy: true,
    })
  : Fastify({
      ...HTTPS_CONFIG,
      logger: {
        transport: {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        },
      },
    });

export const startServer = async () => {
  try {
    if (!IS_PRODUCTION) {
      app.register(env);
      await app.after();
    }

    const cookieKey = process.env["SERVER_SESSION_COOKIE_KEY"];
    if (cookieKey) {
      app.register(import("@fastify/secure-session"), {
        key: Buffer.from(cookieKey, "hex"),
        cookie: {
          path: "/",
          httpOnly: true,
          sameSite: "strict",
          secure: IS_PRODUCTION,
        },
      });
    }

    app.register(import("@fastify/formbody"));
    app.register(import("@fastify/multipart"), {
      limits: {
        fileSize: 1000000000,
      },
    });

    const oauthClientId = process.env["BROWSER_GOOGLE_OAUTH_CLIENT_ID"];
    const oauthClientSecret = process.env["SERVER_GOOGLE_OAUTH_CLIENT_SECRET"];
    if (oauthClientId && oauthClientSecret) {
      app.register(googleDriveSyncProvider, {
        oauthClientId,
        oauthClientSecret,
      });
    }

    app.register(router);

    if (IS_PRODUCTION) {
      const port = Number(process.env["PORT"] || 8080);
      const host = IS_GOOGLE_CLOUD_RUN
        ? "0.0.0.0"
        : process.env["HOST"] || "localhost";
      await app.ready();
      await app.listen({ host, port });
    } else {
      await app.register(import("@fastify/middie"));
      await app.ready();
    }
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

export default { app };
