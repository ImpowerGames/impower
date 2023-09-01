import * as dotenv from "dotenv";
import { FastifyPluginCallback } from "fastify";

const env: FastifyPluginCallback = async (app, opts, next) => {
  try {
    const envConfig = dotenv.config();
    app.decorate("config", envConfig.parsed);
  } catch (err) {
    console.error(err);
  }
  next();
};

export default env;
