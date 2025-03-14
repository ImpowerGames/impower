import type * as LSP from "../../types";
import { CompletionItem, CompletionList } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type CompletionMethod = typeof CompletionMessage.method;

export type CompletionParams = LSP.CompletionParams;

export class CompletionMessage {
  static readonly method = "textDocument/completion";
  static readonly type = new MessageProtocolRequestType<
    CompletionMethod,
    CompletionParams,
    CompletionList | CompletionItem[] | null
  >(CompletionMessage.method);
}
