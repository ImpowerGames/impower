import { Hover, HoverParams } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type HoverMethod = typeof HoverMessage.method;

export namespace HoverMessage {
  export const method = "textDocument/hover";
  export const type = new MessageProtocolRequestType<
    HoverMethod,
    HoverParams,
    Hover | null
  >(HoverMessage.method);
}
