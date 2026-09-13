import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export class DidLoadEditorMessage {
  static readonly method = "editor/didLoad";
  static readonly type = new MessageProtocolNotificationType<
    typeof DidLoadEditorMessage.method,
    { textDocument: { uri: string; version: number } }
  >(DidLoadEditorMessage.method);
}
