import { NotificationMessage, RenameFilesParams } from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type DidRenameFilesMethod = typeof DidRenameFiles.type.method;

export interface DidRenameFilesNotificationMessage
  extends NotificationMessage<DidRenameFilesMethod, RenameFilesParams> {
  params: RenameFilesParams;
}

class DidRenameFilesProtocolType extends NotificationProtocolType<
  DidRenameFilesNotificationMessage,
  RenameFilesParams
> {
  method = "workspace/didRenameFiles";
}

export abstract class DidRenameFiles {
  static readonly type = new DidRenameFilesProtocolType();
}
