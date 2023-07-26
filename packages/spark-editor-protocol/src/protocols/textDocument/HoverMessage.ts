import { Hover, HoverParams } from "vscode-languageserver-protocol";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type HoverMethod = typeof HoverMessage.method;

export abstract class HoverMessage {
  static readonly method = "textDocument/hover";
  static readonly type = new MessageProtocolRequestType<
    HoverMethod,
    HoverParams,
    Hover | null
  >(HoverMessage.method);
}
