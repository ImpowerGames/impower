import { ResponseError } from "../types/ResponseError";

export class RequestError extends Error {
  code: number;
  data: any;
  constructor(error: ResponseError) {
    super(error.message);
    this.name = `${error.code}`;
    this.code = error.code;
    this.data = error.data;
  }
}
