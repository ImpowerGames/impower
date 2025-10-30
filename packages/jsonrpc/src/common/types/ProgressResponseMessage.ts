import { IMessage } from "./IMessage";
import { ProgressValue } from "./ProgressValue";

export interface ProgressResponseMessage<M extends string>
  extends IMessage<`${M}/progress`> {
  /**
   * The request id.
   */
  id: number | string;

  /**
   * The error object in case a request fails.
   */
  value: ProgressValue;
}
