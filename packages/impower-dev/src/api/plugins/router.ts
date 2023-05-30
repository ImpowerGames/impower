import { FastifyPluginCallback } from "fastify";
import { readFile } from "fs/promises";
import { join } from "path";
import transformDocument from "../transforms/transformDocument.js";

const router: FastifyPluginCallback = async (app, opts, next) => {
  const publicFolder = join(process.cwd(), "out", "public");
  const pagesFolder = join(process.cwd(), "out", "pages");
  app.register(import("@fastify/static"), {
    root: publicFolder,
    prefix: "/public/",
  });
  app.register(import("@fastify/cors"), {
    origin: "*",
    methods: "OPTION, GET,HEAD,PUT,PATCH,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 204,
    exposedHeaders: "Authorization",
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
        const documentHtmlFilePath = join(publicFolder, "document.html");
        const htmlFilePath = join(pagesFolder, `${route}.html`);
        const cssFilePath = join(pagesFolder, `${route}.css`);
        const jsFilePath = join(pagesFolder, `${route}.js`);
        const mjsFilePath = join(pagesFolder, `${route}.mjs`);
        const [documentHtml, html, css, js, mjs] = await Promise.all([
          readFile(documentHtmlFilePath, "utf-8").catch((err) => {
            request.log.error(err);
            return "";
          }),
          readFile(htmlFilePath, "utf-8").catch((err) => {
            request.log.error(err);
            return "";
          }),
          readFile(cssFilePath, "utf-8").catch((err) => {
            // request.log.warn(err);
            return "";
          }),
          readFile(jsFilePath, "utf-8").catch((err) => {
            // request.log.warn(err);
            return "";
          }),
          readFile(mjsFilePath, "utf-8").catch((err) => {
            // request.log.warn(err);
            return "";
          }),
        ]);
        const transformedHtml = transformDocument(
          documentHtml,
          css,
          html,
          js || mjs
        );
        reply.headers({ "content-type": "text/html" });
        reply.send(transformedHtml);
      }
    } catch (err) {
      request.log.error(err);
      reply.callNotFound();
    }
  });
  next();
};

export default router;
