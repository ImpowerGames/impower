import { type Location } from "vscode-languageserver-protocol";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SetEditorHighlightsMethod =
  typeof SetEditorHighlightsMessage.method;

export interface SetEditorHighlightsParams {
  locations: Location[];
}

export interface SetEditorHighlightsResult {}

export class SetEditorHighlightsMessage {
  static readonly method = "editor/setHighlights";
  static readonly type = new MessageProtocolRequestType<
    SetEditorHighlightsMethod,
    SetEditorHighlightsParams,
    SetEditorHighlightsResult
  >(SetEditorHighlightsMessage.method);
}

export namespace SetEditorHighlightsMessage {
  export interface Request
    extends RequestMessage<
      SetEditorHighlightsMethod,
      SetEditorHighlightsParams,
      SetEditorHighlightsResult
    > {}
  export interface Response
    extends ResponseMessage<
      SetEditorHighlightsMethod,
      SetEditorHighlightsResult
    > {}
}
