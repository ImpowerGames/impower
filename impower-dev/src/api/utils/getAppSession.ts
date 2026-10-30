import { FastifyRequest } from "fastify/types/request";
import { SessionCookieData } from "../types/SessionCookieData";

interface AppSession {
  get(key: "data"): SessionCookieData | undefined;
  set(key: "data", value: SessionCookieData): void;
}

const getAppSession = (request: FastifyRequest): AppSession =>
  request.session as unknown as AppSession;

export default getAppSession;
