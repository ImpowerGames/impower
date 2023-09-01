import { FastifyRequest } from "fastify/types/request";

const deleteSessionCookie = (request: FastifyRequest) => {
  request.session.delete();
};

export default deleteSessionCookie;
