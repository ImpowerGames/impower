import { RenameFilesParams } from "../../../types";
import { MessageProtocolNotificationType } from "../../MessageProtocolNotificationType";

export type DidRenameFilesMethod = typeof DidRenameFiles.method;

export abstract class DidRenameFiles {
  static readonly method = "workspace/didRenameFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidRenameFilesMethod,
    RenameFilesParams
  >(DidRenameFiles.method);
}
