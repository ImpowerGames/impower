import { type Range } from "vscode-languageserver-protocol";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SetEditorFindMatchesMethod =
  typeof SetEditorFindMatchesMessage.method;

export interface SetEditorFindMatchesParams {
  textDocument: { uri: string };
  ranges: Range[];
}

export interface SetEditorFindMatchesResult {}

export class SetEditorFindMatchesMessage {
  static readonly method = "editor/setFindMatches";
  static readonly type = new MessageProtocolRequestType<
    SetEditorFindMatchesMethod,
    SetEditorFindMatchesParams,
    SetEditorFindMatchesResult
  >(SetEditorFindMatchesMessage.method);
}

export namespace SetEditorFindMatchesMessage {
  export interface Request extends RequestMessage<
    SetEditorFindMatchesMethod,
    SetEditorFindMatchesParams,
    SetEditorFindMatchesResult
  > {}
  export type Response = ResponseMessage<
    SetEditorFindMatchesMethod,
    SetEditorFindMatchesResult
  >;
}
