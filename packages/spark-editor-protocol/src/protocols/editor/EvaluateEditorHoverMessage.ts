import { TextDocumentIdentifier } from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type EvaluateEditorHoverMethod = typeof EvaluateEditorHoverMessage.method;

export interface EvaluateEditorHoverParams {
  textDocument: TextDocumentIdentifier;
  expression: string;
}

export interface EvaluateEditorHoverResult {
  value: string | null;
}

export class EvaluateEditorHoverMessage {
  static readonly method = "editor/evaluateHover";
  static readonly type = new MessageProtocolRequestType<
    EvaluateEditorHoverMethod,
    EvaluateEditorHoverParams,
    EvaluateEditorHoverResult
  >(EvaluateEditorHoverMessage.method);
}

export namespace EvaluateEditorHoverMessage {
  export interface Request extends RequestMessage<
    EvaluateEditorHoverMethod,
    EvaluateEditorHoverParams,
    EvaluateEditorHoverResult
  > {}
  export type Response = ResponseMessage<
    EvaluateEditorHoverMethod,
    EvaluateEditorHoverResult
  >;
}
