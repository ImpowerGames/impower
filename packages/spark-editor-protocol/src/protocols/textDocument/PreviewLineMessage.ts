import type { TextDocumentIdentifier } from "vscode-languageserver-protocol";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type PreviewLineMethod = typeof PreviewLineMessage.method;

export type PreviewBeatKind =
  | "title"
  | "heading"
  | "transition"
  | "action"
  | "dialogue"
  | "choice";

export interface PreviewBeat {
  kind: PreviewBeatKind;
  words: string;
  speaker?: string;
}

export type PreviewLine = PreviewBeat | { kind: "setup" } | { kind: "empty" };

export interface PreviewLineParams {
  textDocument: TextDocumentIdentifier;
  line: number;
}

export type PreviewLineResult = PreviewLine | null;

export class PreviewLineMessage {
  static readonly method = "textDocument/previewLine";
  static readonly type = new MessageProtocolRequestType<
    PreviewLineMethod,
    PreviewLineParams,
    PreviewLineResult
  >(PreviewLineMessage.method);
}

export namespace PreviewLineMessage {
  export interface Request extends RequestMessage<
    PreviewLineMethod,
    PreviewLineParams,
    PreviewLineResult
  > {}
  export type Response = ResponseMessage<PreviewLineMethod, PreviewLineResult>;
}
