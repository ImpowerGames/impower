import type { IMessage } from "./IMessage";
import type { ProgressValue } from "./ProgressValue";

export interface ProgressResponseMessage<
  M extends string = string,
> extends IMessage<M | `${M}/progress`> {
  /**
   * The request id.
   */
  id: number | string;

  /**
   * The error object in case a request fails.
   */
  value: ProgressValue;
}
