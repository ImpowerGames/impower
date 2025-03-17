import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type HideEditorStatusBarMethod =
  typeof HideEditorStatusBarMessage.method;

export interface HideEditorStatusBarParams {}

export interface HideEditorStatusBarResult {}

export class HideEditorStatusBarMessage {
  static readonly method = "editor/hideStatusBar";
  static readonly type = new MessageProtocolRequestType<
    HideEditorStatusBarMethod,
    HideEditorStatusBarParams,
    HideEditorStatusBarResult
  >(HideEditorStatusBarMessage.method);
}

export namespace HideEditorStatusBarMessage {
  export interface Request
    extends RequestMessage<
      HideEditorStatusBarMethod,
      HideEditorStatusBarParams,
      HideEditorStatusBarResult
    > {}
  export interface Response
    extends ResponseMessage<
      HideEditorStatusBarMethod,
      HideEditorStatusBarResult
    > {}
}
