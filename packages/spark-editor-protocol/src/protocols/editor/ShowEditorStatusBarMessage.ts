import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ShowEditorStatusBarMethod =
  typeof ShowEditorStatusBarMessage.method;

export interface ShowEditorStatusBarParams {}

export interface ShowEditorStatusBarResult {}

export class ShowEditorStatusBarMessage {
  static readonly method = "editor/showStatusBar";
  static readonly type = new MessageProtocolRequestType<
    ShowEditorStatusBarMethod,
    ShowEditorStatusBarParams,
    ShowEditorStatusBarResult
  >(ShowEditorStatusBarMessage.method);
}

export namespace ShowEditorStatusBarMessage {
  export interface Request
    extends RequestMessage<
      ShowEditorStatusBarMethod,
      ShowEditorStatusBarParams,
      ShowEditorStatusBarResult
    > {}
  export interface Response
    extends ResponseMessage<
      ShowEditorStatusBarMethod,
      ShowEditorStatusBarResult
    > {}
}
