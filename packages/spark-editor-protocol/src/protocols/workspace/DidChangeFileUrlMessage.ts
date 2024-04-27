import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangeFileUrlMethod = typeof DidChangeFileUrlMessage.method;

export interface DidChangeFileUrlParams {
  uri: string;
  src: string;
}

export class DidChangeFileUrlMessage {
  static readonly method = "workspace/didChangeFileUrl";
  static readonly type = new MessageProtocolNotificationType<
    DidChangeFileUrlMethod,
    DidChangeFileUrlParams
  >(DidChangeFileUrlMessage.method);
}
