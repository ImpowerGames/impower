import { CreateFilesParams, NotificationMessage } from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type DidCreateFilesMethod = typeof DidCreateFiles.type.method;

export interface DidCreateFilesNotificationMessage
  extends NotificationMessage<DidCreateFilesMethod, CreateFilesParams> {
  params: CreateFilesParams;
}

class DidCreateFilesProtocolType extends NotificationProtocolType<
  DidCreateFilesNotificationMessage,
  CreateFilesParams
> {
  method = "workspace/didCreateFiles";
}

export abstract class DidCreateFiles {
  static readonly type = new DidCreateFilesProtocolType();
}
