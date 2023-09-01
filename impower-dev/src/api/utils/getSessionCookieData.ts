import { FastifyRequest } from "fastify/types/request";
import { SessionCookieData } from "../types/SessionCookieData";

const getSessionCookieData = (
  request: FastifyRequest
): SessionCookieData | undefined => {
  return request.session.get("data");
};

export default getSessionCookieData;
