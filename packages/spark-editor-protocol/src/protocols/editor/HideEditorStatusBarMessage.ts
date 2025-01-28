import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type HideEditorStatusBarMethod =
  typeof HideEditorStatusBarMessage.method;

export interface HideEditorStatusBarParams {}

export class HideEditorStatusBarMessage {
  static readonly method = "editor/hideStatusBar";
  static readonly type = new MessageProtocolRequestType<
    HideEditorStatusBarMethod,
    HideEditorStatusBarParams,
    null
  >(HideEditorStatusBarMessage.method);
}
