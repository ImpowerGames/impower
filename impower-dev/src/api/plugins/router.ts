import { FastifyPluginCallback } from "fastify";
import { readFile } from "fs/promises";
import { join } from "path";

const router: FastifyPluginCallback = async (app, opts, next) => {
  const publicFolder = join(process.cwd(), "impower-dev", "out", "public");
  app.register(import("@fastify/static"), {
    root: publicFolder,
    prefix: "/public/",
  });
  app.get("/*", async (request, reply) => {
    try {
      const { url } = request;
      const parts = url.split("/");
      const target = parts[parts.length - 1] || "";
      if (target.includes(".")) {
        reply.sendFile(join(publicFolder, url));
      } else {
        const route = target === "" ? "index" : `${url}/${target}`;
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
  });
  next();
};

export default router;
