import { DeleteFilesParams, NotificationMessage } from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type DidDeleteFilesMethod = typeof DidDeleteFiles.type.method;

export interface DidDeleteFilesNotificationMessage
  extends NotificationMessage<DidDeleteFilesMethod, DeleteFilesParams> {
  params: DeleteFilesParams;
}

class DidDeleteFilesProtocolType extends NotificationProtocolType<
  DidDeleteFilesNotificationMessage,
  DeleteFilesParams
> {
  method = "workspace/didDeleteFiles";
}

export abstract class DidDeleteFiles {
  static readonly type = new DidDeleteFilesProtocolType();
}
