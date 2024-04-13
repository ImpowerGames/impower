import { FastifyPluginCallback } from "fastify";
import { readFile } from "fs/promises";
import { join } from "path";

const router: FastifyPluginCallback = async (app, opts, next) => {
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
        reply.sendFile(target);
      } else {
        const route = url === "/" ? "index" : url;
        const htmlFilePath = join(publicFolder, `${route}.html`);
        const html = await readFile(htmlFilePath, "utf-8").catch((err) => {
          request.log.error(err);
          reply.callNotFound();
          return "";
        });
        if (html) {
          reply.headers({ "content-type": "text/html" });
          reply.send(html);
        }
      }
    } catch (err) {
      request.log.error(err);
      reply.callNotFound();
    }
    return reply;
  });
  next();
};

export default router;
