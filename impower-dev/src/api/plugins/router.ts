import { FastifyPluginCallback } from "fastify";
import { readFile } from "fs/promises";
import { join } from "path";

const IS_GOOGLE_CLOUD_RUN = process.env["K_SERVICE"] !== undefined;
const IS_PRODUCTION =
  process.env["NODE_ENV"] === "production" || IS_GOOGLE_CLOUD_RUN;

const router: FastifyPluginCallback = async (app, opts) => {
  if (IS_PRODUCTION) {
    const publicFolder = join(process.cwd(), "out", "public");

    app.register(import("@fastify/static"), {
      root: publicFolder,
      prefix: "/public/",
    });

    app.get("/*", async (request, reply) => {
      try {
        const { url } = request;

        if (url.includes(".")) {
          const target = url.startsWith("/") ? url.slice(1) : url;
          return reply.sendFile(target);
        }

        const route = url === "/" ? "index" : url;
        const htmlFilePath = join(publicFolder, `${route}.html`);

        const html = await readFile(htmlFilePath, "utf-8").catch((err) => {
          request.log.error(err);
          reply.callNotFound();
          return "";
        });

        if (html) {
          reply.type("text/html").send(html);
        }
      } catch (err) {
        request.log.error(err);
        reply.callNotFound();
      }
      return reply;
    });
  } else {

    app.log.info("Development mode: Static routes disabled to allow Vite HMR.");
  }
};

export default router;
