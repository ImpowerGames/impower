import type { IMessage } from "./IMessage";
import type { ResponseError } from "./ResponseError";

export type ResponseMessage<M extends string = string, R = unknown> =
  ValidResponseMessage<M, R> | InvalidResponseMessage<M>;

export interface ValidResponseMessage<M extends string, R> extends IMessage<M> {
  id: number | string;
  result: R;
  error?: never;
}

export interface InvalidResponseMessage<M extends string> extends IMessage<M> {
  id: number | string;
  error: ResponseError;
  result?: never;
}
