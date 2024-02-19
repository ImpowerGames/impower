import { NotificationMessage } from "./NotificationMessage";
import { RequestMessage } from "./RequestMessage";
import { ResponseMessage } from "./ResponseMessage";

export type Message<M extends string = string, P = any, R = any> =
  | NotificationMessage<M, P>
  | RequestMessage<M, P>
  | ResponseMessage<M, R>;
