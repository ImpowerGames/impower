import { type Thread } from "../../../../spark-engine/src/game/core/types/Thread";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

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
