import { URI } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangeDirectoriesMethod =
  typeof DidChangeDirectoriesMessage.method;

export interface DidChangeDirectoriesParams {
  created: URI[];
  deleted: URI[];
  remote?: boolean;
}

export class DidChangeDirectoriesMessage {
  static readonly method = "workspace/didChangeDirectories";
  static readonly type = new MessageProtocolNotificationType<
    DidChangeDirectoriesMethod,
    DidChangeDirectoriesParams
  >(DidChangeDirectoriesMessage.method);
}
