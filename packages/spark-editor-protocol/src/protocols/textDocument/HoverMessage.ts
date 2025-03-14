import type * as LSP from "../../types";
import { Hover } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type HoverMethod = typeof HoverMessage.method;

export type HoverParams = LSP.HoverParams;

export class HoverMessage {
  static readonly method = "textDocument/hover";
  static readonly type = new MessageProtocolRequestType<
    HoverMethod,
    HoverParams,
    Hover | null
  >(HoverMessage.method);
}
