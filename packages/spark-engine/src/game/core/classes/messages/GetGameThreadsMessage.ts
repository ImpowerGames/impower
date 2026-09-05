import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import { type Thread } from "../../types/Thread";

export type GetGameThreadsMethod = typeof GetGameThreadsMessage.method;

export interface GetGameThreadsParams {}

export interface GetGameThreadsResult {
  /**
   * All threads.
   */
  threads: Thread[];
}

export class GetGameThreadsMessage {
  static readonly method = "game/threads";
  static readonly type = new MessageProtocolRequestType<
    GetGameThreadsMethod,
    GetGameThreadsParams,
    GetGameThreadsResult
  >(GetGameThreadsMessage.method);
}

export namespace GetGameThreadsMessage {
  export interface Request extends RequestMessage<
    GetGameThreadsMethod,
    GetGameThreadsParams,
    GetGameThreadsResult
  > {}
  export interface Response extends ResponseMessage<
    GetGameThreadsMethod,
    GetGameThreadsResult
  > {}
}
