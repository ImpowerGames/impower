import { CompletionItem, CompletionList, CompletionParams } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type CompletionMethod = typeof CompletionMessage.method;

export class CompletionMessage {
  static readonly method = "textDocument/completion";
  static readonly type = new MessageProtocolRequestType<
    CompletionMethod,
    CompletionParams,
    CompletionList | CompletionItem[] | null
  >(CompletionMessage.method);
}
