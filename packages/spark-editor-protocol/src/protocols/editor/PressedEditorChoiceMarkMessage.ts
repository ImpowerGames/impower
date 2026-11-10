import { TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type PressedEditorChoiceMarkMethod =
  typeof PressedEditorChoiceMarkMessage.method;

export type EditorChoiceMarkAction =
  | { kind: "pin"; option: number }
  | { kind: "unpin" }
  | { kind: "route" };

export interface PressedEditorChoiceMarkParams {
  textDocument: TextDocumentIdentifier;
  line: number;
  action: EditorChoiceMarkAction;
}

export class PressedEditorChoiceMarkMessage {
  static readonly method = "editor/pressedChoiceMark";
  static readonly type = new MessageProtocolNotificationType<
    PressedEditorChoiceMarkMethod,
    PressedEditorChoiceMarkParams
  >(PressedEditorChoiceMarkMessage.method);
}

export namespace PressedEditorChoiceMarkMessage {
  export interface Notification extends NotificationMessage<
    PressedEditorChoiceMarkMethod,
    PressedEditorChoiceMarkParams
  > {}
}
