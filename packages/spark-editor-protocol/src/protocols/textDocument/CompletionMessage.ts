import { CompletionItem, CompletionList, CompletionParams } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type CompletionMethod = typeof CompletionMessage.method;

export namespace CompletionMessage {
  export const method = "textDocument/completion";
  export const type = new MessageProtocolRequestType<
    CompletionMethod,
    CompletionParams,
    CompletionList | CompletionItem[] | null
  >(CompletionMessage.method);
}
