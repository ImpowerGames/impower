import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";
import type { EditorFix } from "./ApplyEditorEditMessage";

export type ChoseEditorFixMethod = typeof ChoseEditorFixMessage.method;

export interface ChoseEditorFixParams {
  fix: EditorFix;
  name: string;
  done: string;
}

export class ChoseEditorFixMessage {
  static readonly method = "editor/choseFix";
  static readonly type = new MessageProtocolNotificationType<
    ChoseEditorFixMethod,
    ChoseEditorFixParams
  >(ChoseEditorFixMessage.method);
}

export namespace ChoseEditorFixMessage {
  export interface Notification extends NotificationMessage<
    ChoseEditorFixMethod,
    ChoseEditorFixParams
  > {}
}
