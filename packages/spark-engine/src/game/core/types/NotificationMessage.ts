import { IMessage } from "./IMessage";

export interface NotificationMessage<M extends string = string, P = unknown>
  extends IMessage<M> {
  /**
   * The notification's params.
   */
  params: P;
}
