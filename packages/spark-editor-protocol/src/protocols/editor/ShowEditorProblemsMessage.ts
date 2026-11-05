import { TextDocumentIdentifier } from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ShowEditorProblemsMethod = typeof ShowEditorProblemsMessage.method;

export interface ShowEditorProblemsParams {
  textDocument: TextDocumentIdentifier;
}

export interface ShowEditorProblemsResult {}

export class ShowEditorProblemsMessage {
  static readonly method = "editor/showProblems";
  static readonly type = new MessageProtocolRequestType<
    ShowEditorProblemsMethod,
    ShowEditorProblemsParams,
    ShowEditorProblemsResult
  >(ShowEditorProblemsMessage.method);
}

export namespace ShowEditorProblemsMessage {
  export interface Request extends RequestMessage<
    ShowEditorProblemsMethod,
    ShowEditorProblemsParams,
    ShowEditorProblemsResult
  > {}
  export type Response = ResponseMessage<
    ShowEditorProblemsMethod,
    ShowEditorProblemsResult
  >;
}
