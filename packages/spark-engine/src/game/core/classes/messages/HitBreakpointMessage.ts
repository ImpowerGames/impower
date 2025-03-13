import { DocumentLocation } from "../../types/DocumentLocation";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type HitBreakpointMethod = typeof HitBreakpointMessage.method;

export class HitBreakpointMessage {
  static readonly method = "story/hitBreakpoint";
  static readonly type = new MessageProtocolNotificationType<
    HitBreakpointMethod,
    {
      location: DocumentLocation;
    }
  >(HitBreakpointMessage.method);
}
