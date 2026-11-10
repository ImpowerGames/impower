import { TextDocumentIdentifier } from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type InsertEditorConstructMethod =
  typeof InsertEditorConstructMessage.method;

export interface InsertEditorConstructParams {
  textDocument: TextDocumentIdentifier;
  construct: string;
}

export interface InsertEditorConstructResult {
  inserted: boolean;
}

export class InsertEditorConstructMessage {
  static readonly method = "editor/insertConstruct";
  static readonly type = new MessageProtocolRequestType<
    InsertEditorConstructMethod,
    InsertEditorConstructParams,
    InsertEditorConstructResult
  >(InsertEditorConstructMessage.method);
}

export namespace InsertEditorConstructMessage {
  export interface Request extends RequestMessage<
    InsertEditorConstructMethod,
    InsertEditorConstructParams,
    InsertEditorConstructResult
  > {}
  export type Response = ResponseMessage<
    InsertEditorConstructMethod,
    InsertEditorConstructResult
  >;
}
