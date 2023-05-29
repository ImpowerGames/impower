import * as dotenv from "dotenv";
import Fastify from "fastify";
import livereload from "./plugins/livereload.js";
import router from "./plugins/router.js";

const startServer = async () => {
  dotenv.config();
  const app = Fastify({
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
  await app.register(router);
  const reloadOptions: { reload?: () => void } = {};
  await app.register(livereload, reloadOptions);
  (app as any).reload = reloadOptions.reload;
  try {
    await app.ready();
    const host = process.env["HOST"] || "localhost";
    const port = Number(process.env["PORT"] || 3000);
    await app.listen({ host, port });
    return app;
  } catch (error) {
    app.log.error(error);
    console.error(error);
    process.exit(1);
  }
};

export default startServer;
