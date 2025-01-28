import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ShowEditorStatusBarMethod =
  typeof ShowEditorStatusBarMessage.method;

export interface ShowEditorStatusBarParams {}

export class ShowEditorStatusBarMessage {
  static readonly method = "editor/showStatusBar";
  static readonly type = new MessageProtocolRequestType<
    ShowEditorStatusBarMethod,
    ShowEditorStatusBarParams,
    null
  >(ShowEditorStatusBarMessage.method);
}
