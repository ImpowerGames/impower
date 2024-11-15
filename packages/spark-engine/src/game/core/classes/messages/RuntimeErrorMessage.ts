import { ErrorType } from "../../types/ErrorType";
import { DocumentSource } from "../../types/DocumentSource";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type RuntimeErrorMethod = typeof RuntimeErrorMessage.method;

export class RuntimeErrorMessage {
  static readonly method = "story/executionTimedOut";
  static readonly type = new MessageProtocolNotificationType<
    RuntimeErrorMethod,
    { message: string; type: ErrorType; source: DocumentSource }
  >(RuntimeErrorMessage.method);
}

export interface RuntimeErrorMessageMap extends Record<string, [any, any]> {
  [RuntimeErrorMessage.method]: [
    ReturnType<typeof RuntimeErrorMessage.type.notification>,
    undefined
  ];
}
