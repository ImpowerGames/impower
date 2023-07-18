import {
  DidChangeConfigurationParams,
  NotificationMessage,
} from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type DidChangeConfigurationMethod =
  typeof DidChangeConfiguration.type.method;

export interface DidChangeConfigurationNotificationMessage
  extends NotificationMessage<
    DidChangeConfigurationMethod,
    DidChangeConfigurationParams
  > {}

class DidChangeConfigurationProtocolType extends NotificationProtocolType<
  DidChangeConfigurationNotificationMessage,
  DidChangeConfigurationParams
> {
  method = "workspace/didChangeConfiguration";
}

export abstract class DidChangeConfiguration {
  static readonly type = new DidChangeConfigurationProtocolType();
}
