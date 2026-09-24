import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";

export type ConnectPlayMethod = typeof ConnectPlayMessage.method;

export interface ConnectPlayParams {
  /** The run to connect (`player/play`). */
  run: number;
  /** The `BroadcastChannel` the game sends its stream on
   *  (`WorkerGameLink.attachPlay`). */
  channel: string;
}

/**
 * Connect PLAY's game to the page: it sends what it shows from here on.
 * Answered once it has restored every module, as a game on the page answers
 * its application's connect, or as soon as the run is stopped, so a page
 * that stops PLAY while it connects is not left waiting on the restore.
 */
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
