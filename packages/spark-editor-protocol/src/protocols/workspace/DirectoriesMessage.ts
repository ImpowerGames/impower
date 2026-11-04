import { URI } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type DirectoriesMethod = typeof DirectoriesMessage.method;

export type DirectoriesParams =
  | { action: "list"; directory: { uri: URI } }
  | { action: "create"; uris: URI[] }
  | { action: "delete"; uris: URI[] };

export interface DirectoriesResult {
  uris: URI[];
}

export class DirectoriesMessage {
  static readonly method = "workspace/directories";
  static readonly type = new MessageProtocolRequestType<
    DirectoriesMethod,
    DirectoriesParams,
    DirectoriesResult
  >(DirectoriesMessage.method);
}
