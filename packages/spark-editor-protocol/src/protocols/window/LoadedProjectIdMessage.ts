import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

/** The project actually loaded by the workspace, including the local fallback. */
export class LoadedProjectIdMessage {
  static readonly method = "window/loadedProjectId";
  static readonly type = new MessageProtocolRequestType<
    typeof LoadedProjectIdMessage.method,
    Record<string, never>,
    { id: string }
  >(LoadedProjectIdMessage.method);
}
