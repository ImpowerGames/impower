import {
  CompletionItem,
  CompletionList,
  CompletionParams,
} from "vscode-languageserver-protocol";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type CompletionMethod = typeof CompletionMessage.method;

export abstract class CompletionMessage {
  static readonly method = "textDocument/completion";
  static readonly type = new MessageProtocolRequestType<
    CompletionMethod,
    CompletionParams,
    CompletionList | CompletionItem[] | null
  >(CompletionMessage.method);
}
