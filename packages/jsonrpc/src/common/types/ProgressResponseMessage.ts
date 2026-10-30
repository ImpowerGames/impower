import type { IMessage } from "./IMessage";
import type { ProgressValue } from "./ProgressValue";

export interface ProgressResponseMessage<
  M extends string = string,
> extends IMessage<M | `${M}/progress`> {
  id: number | string;

  value: ProgressValue;
}
