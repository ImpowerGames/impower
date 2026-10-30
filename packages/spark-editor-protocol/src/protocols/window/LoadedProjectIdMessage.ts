import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export class LoadedProjectIdMessage {
  static readonly method = "window/loadedProjectId";
  static readonly type = new MessageProtocolRequestType<
    typeof LoadedProjectIdMessage.method,
    Record<string, never>,
    { id: string }
  >(LoadedProjectIdMessage.method);
}
