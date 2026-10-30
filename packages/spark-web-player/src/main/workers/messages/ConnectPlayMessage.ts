import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";

export type ConnectPlayMethod = typeof ConnectPlayMessage.method;

export interface ConnectPlayParams {
  run: number;
  channel: string;
}

export class ConnectPlayMessage {
  static readonly method = "player/connectPlay";
  static readonly type = new MessageProtocolRequestType<
    ConnectPlayMethod,
    ConnectPlayParams,
    {}
  >(ConnectPlayMessage.method);
}

export namespace ConnectPlayMessage {
  export interface Request extends RequestMessage<ConnectPlayMethod, ConnectPlayParams, {}> {}
}
