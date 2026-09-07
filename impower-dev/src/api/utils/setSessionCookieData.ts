import { FastifyRequest } from "fastify/types/request";
import { SessionCookieData } from "../types/SessionCookieData";
import getAppSession from "./getAppSession";

const setSessionCookieData = (
  request: FastifyRequest,
  data: SessionCookieData,
) => {
  const expires = new Date();
  expires.setDate(expires.getDate() + 200); // Expire 200 days from now
  request.session.options({
    expires,
  });
  getAppSession(request).set("data", data);
  return expires.getTime();
};

export default setSessionCookieData;
