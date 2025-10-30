import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { Event } from "../../types/Event";

export type EventMethod = typeof EventMessage.method;

export class EventMessage {
  static readonly method = "event";
  static readonly type = new MessageProtocolNotificationType<
    EventMethod,
    Event
  >(EventMessage.method);
}
