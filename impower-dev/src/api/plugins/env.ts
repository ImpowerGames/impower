import * as dotenv from "dotenv";
import { FastifyPluginAsync } from "fastify";

const env: FastifyPluginAsync<any> = async (app, opts) => {
  try {
    const envConfig = dotenv.config();
    app.decorate("config", envConfig.parsed);
  } catch (err) {
    console.error(err);
  }
};

export default env;
