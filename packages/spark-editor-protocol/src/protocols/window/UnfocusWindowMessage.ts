import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export interface UnfocusWindowParams {}

export type UnfocusWindowMethod = typeof UnfocusWindowMessage.method;

export class UnfocusWindowMessage {
  static readonly method = "window/unfocus";
  static readonly type = new MessageProtocolRequestType<
    UnfocusWindowMethod,
    UnfocusWindowParams,
    null
  >(UnfocusWindowMessage.method);
}
