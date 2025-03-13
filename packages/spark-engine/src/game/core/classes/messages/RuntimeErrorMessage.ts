import { DocumentLocation } from "../../types/DocumentLocation";
import { ErrorType } from "../../types/ErrorType";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type RuntimeErrorMethod = typeof RuntimeErrorMessage.method;

export class RuntimeErrorMessage {
  static readonly method = "story/executionTimedOut";
  static readonly type = new MessageProtocolNotificationType<
    RuntimeErrorMethod,
    {
      message: string;
      type: ErrorType;
      location: DocumentLocation;
    }
  >(RuntimeErrorMessage.method);
}
