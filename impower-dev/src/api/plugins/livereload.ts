import { FastifyPluginCallback, FastifyReply } from "fastify";

const RELOAD_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Transfer-Encoding": "",
  Connection: "keep-alive",
};

const clients: Record<string, FastifyReply> = {};

const livereload: FastifyPluginCallback = async (app, opts, next) => {
  app.get("/livereload", async (request, reply) => {
    clients[request.id] = reply;
    reply.raw.writeHead(200, RELOAD_HEADERS);
    reply.raw.write(`\n`);
    request.log.info(`Client ${request.id} connected`);
    reply.raw.on("close", () => {
      request.log.info(`Client ${request.id} disconnected`);
      delete clients[request.id];
    });
  });
  app.post("/livereload", async (request, reply) => {
    Object.keys(clients).forEach((clientId) => {
      const reply = clients[clientId];
      if (reply) {
        reply.log.info(`RELOAD ${clientId}`);
        reply.raw.writeHead(200, RELOAD_HEADERS);
        reply.raw.write(`data: message\n\n`);
      }
    });
  });
  next();
};

export default livereload;
