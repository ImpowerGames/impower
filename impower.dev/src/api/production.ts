"use strict";

import * as dotenv from "dotenv";
import Fastify from "fastify";
import router from "./plugins/router.js";

dotenv.config();

const app = Fastify({ logger: true });

app.register(router);

export default async (req: any, res: any) => {
  await app.ready();
  app.server.emit("request", req, res);
};
