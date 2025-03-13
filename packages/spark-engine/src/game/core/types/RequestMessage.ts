import { IMessage } from "./IMessage";

export interface RequestMessage<
  M extends string = string,
  P = unknown,
  R = unknown
> extends IMessage<M> {
  /**
   * The request's params.
   */
  params: P;

  /**
   * The request id.
   */
  id: number | string;

  /**
   * The type of result. (for type checking only)
   */
  _result?: R;
}
