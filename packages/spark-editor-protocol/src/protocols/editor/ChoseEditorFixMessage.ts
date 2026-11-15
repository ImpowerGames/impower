import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";
import type { EditorFix } from "./ApplyEditorEditMessage";

export type ChoseEditorFixMethod = typeof ChoseEditorFixMessage.method;

export interface ChoseEditorEditFixParams {
  fix: EditorFix;
  name: string;
  done: string;
}

export interface EditorFixCommand {
  command: string;
  arguments?: unknown[];
}

export interface ChoseEditorCommandFixParams {
  name: string;
  command: EditorFixCommand;
}

export type ChoseEditorFixParams =
  | ChoseEditorEditFixParams
  | ChoseEditorCommandFixParams;

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
