import { Event } from "../../types/Event";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type EventMethod = typeof EventMessage.method;

export class EventMessage {
  static readonly method = "event";
  static readonly type = new MessageProtocolNotificationType<
    EventMethod,
    Event
  >(EventMessage.method);
}
