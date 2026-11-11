import { TextDocumentIdentifier } from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type AuditionEditorConstructMethod =
  typeof AuditionEditorConstructMessage.method;

export interface AuditionEditorConstructParams {
  textDocument: TextDocumentIdentifier;
  audition: { construct: string; name: string } | null;
}

export interface AuditionEditorConstructResult {
  shown: boolean;
}

export class AuditionEditorConstructMessage {
  static readonly method = "editor/auditionConstruct";
  static readonly type = new MessageProtocolRequestType<
    AuditionEditorConstructMethod,
    AuditionEditorConstructParams,
    AuditionEditorConstructResult
  >(AuditionEditorConstructMessage.method);
}

export namespace AuditionEditorConstructMessage {
  export interface Request extends RequestMessage<
    AuditionEditorConstructMethod,
    AuditionEditorConstructParams,
    AuditionEditorConstructResult
  > {}
  export type Response = ResponseMessage<
    AuditionEditorConstructMethod,
    AuditionEditorConstructResult
  >;
}
