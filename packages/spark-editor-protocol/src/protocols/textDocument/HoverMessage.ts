import { Hover, HoverParams } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type HoverMethod = typeof HoverMessage.method;

export class HoverMessage {
  static readonly method = "textDocument/hover";
  static readonly type = new MessageProtocolRequestType<
    HoverMethod,
    HoverParams,
    Hover | null
  >(HoverMessage.method);
}
