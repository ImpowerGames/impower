import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";
import type { RoutePin } from "../preview/SetRoutePinsMessage";

export type SetEditorRoutePinsMethod = typeof SetEditorRoutePinsMessage.method;

export interface SetEditorRoutePinsParams {
  pins: RoutePin[];
}

export interface SetEditorRoutePinsResult {}

export class SetEditorRoutePinsMessage {
  static readonly method = "editor/setRoutePins";
  static readonly type = new MessageProtocolRequestType<
    SetEditorRoutePinsMethod,
    SetEditorRoutePinsParams,
    SetEditorRoutePinsResult
  >(SetEditorRoutePinsMessage.method);
}

export namespace SetEditorRoutePinsMessage {
  export interface Request extends RequestMessage<
    SetEditorRoutePinsMethod,
    SetEditorRoutePinsParams,
    SetEditorRoutePinsResult
  > {}
  export type Response = ResponseMessage<
    SetEditorRoutePinsMethod,
    SetEditorRoutePinsResult
  >;
}
