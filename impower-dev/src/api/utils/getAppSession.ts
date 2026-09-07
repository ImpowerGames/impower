import { FastifyRequest } from "fastify/types/request";
import { SessionCookieData } from "../types/SessionCookieData";

/**
 * The one entry this app keeps in the session cookie.
 *
 * The session plugin keys its `get`/`set` on an interface it declares but does
 * not export, so an application cannot add its own keys to it and every key
 * name is rejected. Naming the key here restores the checking that would
 * otherwise be lost.
 */
interface AppSession {
  get(key: "data"): SessionCookieData | undefined;
  set(key: "data", value: SessionCookieData): void;
}

const getAppSession = (request: FastifyRequest): AppSession =>
  request.session as unknown as AppSession;

export default getAppSession;
