import type * as LSP from "../../types";
import { Hover } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type HoverMethod = typeof HoverMessage.method;

export type HoverParams = LSP.HoverParams;

export type HoverResult = Hover & {
  images?: { src: string; naturalWidth: number; naturalHeight: number; loaded: boolean }[];
};

export class HoverMessage {
  static readonly method = "textDocument/hover";
  static readonly type = new MessageProtocolRequestType<
    HoverMethod,
    HoverParams,
    HoverResult | null
  >(HoverMessage.method);
}
