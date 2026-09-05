import type { Message } from "./Message";
import type { ProgressValue } from "./ProgressValue";

export interface ProgressResponseMessage<M extends string = string>
  extends Message<`${M}/progress`> {
  /**
   * The request id.
   */
  id: number | string;

  /**
   * The progress value.
   */
  value: ProgressValue;
}
