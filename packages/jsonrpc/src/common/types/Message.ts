import type { NotificationMessage } from "./NotificationMessage";
import type { RequestMessage } from "./RequestMessage";
import type { ResponseMessage } from "./ResponseMessage";

export type Message<M extends string = string, P = any, R = any> =
  | NotificationMessage<M, P>
  | RequestMessage<M, P, R>
  | ResponseMessage<M, R>;
