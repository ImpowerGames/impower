import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";
import type { RoutePin } from "../preview/SetRoutePinsMessage";

export type SetEditorRoutePinsMethod = typeof SetEditorRoutePinsMessage.method;

/** Every pin in the project, after the author changed them from the Game
 *  Preview: the editor keeps its document's on their lines through edits. */
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
