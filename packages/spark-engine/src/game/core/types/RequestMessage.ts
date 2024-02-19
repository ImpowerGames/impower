import { IMessage } from "./IMessage";

export interface RequestMessage<M extends string = string, P = unknown>
  extends IMessage<M> {
  /**
   * The request's params.
   */
  params: P;

  /**
   * The request id.
   */
  id: number | string;
}
