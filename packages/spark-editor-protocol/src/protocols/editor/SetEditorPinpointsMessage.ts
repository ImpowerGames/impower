import { type Location } from "vscode-languageserver-protocol";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SetEditorPinpointsMethod = typeof SetEditorPinpointsMessage.method;

export interface SetEditorPinpointsParams {
  locations: Location[];
}

export interface SetEditorPinpointsResult {}

export class SetEditorPinpointsMessage {
  static readonly method = "editor/setPinpoints";
  static readonly type = new MessageProtocolRequestType<
    SetEditorPinpointsMethod,
    SetEditorPinpointsParams,
    SetEditorPinpointsResult
  >(SetEditorPinpointsMessage.method);
}

export namespace SetEditorPinpointsMessage {
  export interface Request
    extends RequestMessage<
      SetEditorPinpointsMethod,
      SetEditorPinpointsParams,
      SetEditorPinpointsResult
    > {}
  export interface Response
    extends ResponseMessage<
      SetEditorPinpointsMethod,
      SetEditorPinpointsResult
    > {}
}
