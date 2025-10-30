import { Message } from "./Message";
import { ProgressValue } from "./ProgressValue";

export interface ProgressResponseMessage<M extends string = string, R = any>
  extends Message<`${M}/progress`, R> {
  /**
   * The request id.
   */
  id: number | string;

  /**
   * The progress value.
   */
  value: ProgressValue;
}
