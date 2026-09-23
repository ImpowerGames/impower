import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";

export type ConnectPlayMethod = typeof ConnectPlayMessage.method;

/**
 * Connect PLAY's game to the page: it sends what it shows from here on.
 * Answered once it has restored every module, as a game on the page answers
 * its application's connect.
 */
export class ConnectPlayMessage {
  static readonly method = "player/connectPlay";
  static readonly type = new MessageProtocolRequestType<
    ConnectPlayMethod,
    {},
    {}
  >(ConnectPlayMessage.method);
}

export namespace ConnectPlayMessage {
  export interface Request extends RequestMessage<ConnectPlayMethod, {}, {}> {}
}
