import { MessageProtocolRequestType } from "../../../../protocol/classes/MessageProtocolRequestType";
import { RequestMessage } from "../../../../protocol/types/RequestMessage";
import { ResponseMessage } from "../../../../protocol/types/ResponseMessage";
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
  export interface Request
    extends RequestMessage<
      GetGameThreadsMethod,
      GetGameThreadsParams,
      GetGameThreadsResult
    > {}
  export interface Response
    extends ResponseMessage<GetGameThreadsMethod, GetGameThreadsResult> {}
}
