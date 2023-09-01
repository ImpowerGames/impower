import { FastifyRequest } from "fastify/types/request";

const isXmlHttpRequest = (request: FastifyRequest) =>
  request.headers["x-requested-with"] === "XmlHttpRequest";

export default isXmlHttpRequest;
