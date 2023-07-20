import { DeleteFilesParams } from "../../../types";
import { MessageProtocolNotificationType } from "../../MessageProtocolNotificationType";

export type DidDeleteFilesMethod = typeof DidDeleteFiles.method;

export abstract class DidDeleteFiles {
  static readonly method = "workspace/didDeleteFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidDeleteFilesMethod,
    DeleteFilesParams
  >(DidDeleteFiles.method);
}
