import { Message } from "./Message";

export interface RequestMessage<M extends string = string, P = any, R = unknown>
  extends Message<M, P> {
  /**
   * The request id.
   */
  id: number | string;

  /**
   * The method to be invoked.
   */
  method: M;

  /**
   * The method's params.
   */
  params: P;

  /**
   * The type of result. (for type checking only)
   */
  _result?: R;
}
