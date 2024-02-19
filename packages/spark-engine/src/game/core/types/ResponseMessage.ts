import { IMessage } from "./IMessage";
import { ResponseError } from "./ResponseError";

export interface ResponseMessage<M extends string = string, R = unknown>
  extends Partial<ValidResponseMessage<M, R>>,
    Partial<InvalidResponseMessage<M>> {
  id: number | string;
}

export interface ValidResponseMessage<M extends string, R> extends IMessage<M> {
  /**
   * The request id.
   */
  id: number | string;

  /**
   * The result of a request. This member is REQUIRED on success.
   * This member MUST NOT exist if there was an error invoking the method.
   */
  result: R;
}

export interface InvalidResponseMessage<M extends string> extends IMessage<M> {
  /**
   * The request id.
   */
  id: number | string;

  /**
   * The error object in case a request fails.
   */
  error: ResponseError;
}
