import { Message } from "./Message";

export interface NotificationMessage<M extends string = string, P = any>
  extends Message<M, P> {
  /**
   * The method to be invoked.
   */
  method: M;

  /**
   * The notification's params.
   */
  params: P;
}
