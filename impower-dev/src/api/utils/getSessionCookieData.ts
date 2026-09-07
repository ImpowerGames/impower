import { FastifyRequest } from "fastify/types/request";
import { SessionCookieData } from "../types/SessionCookieData";
import getAppSession from "./getAppSession";

const getSessionCookieData = (
  request: FastifyRequest,
): SessionCookieData | undefined => {
  return getAppSession(request).get("data");
};

export default getSessionCookieData;
