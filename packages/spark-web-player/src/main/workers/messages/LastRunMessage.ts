import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { RunMeeting } from "@impower/spark-engine/src/game/core/types/PreviewRoute";

export type LastRunMethod = typeof LastRunMessage.method;

export interface LastRunParams {}

export interface LastRunResult {
  run: RunMeeting[] | null;
}

export class LastRunMessage {
  static readonly method = "player/lastRun";
  static readonly type = new MessageProtocolRequestType<
    LastRunMethod,
    LastRunParams,
    LastRunResult
  >(LastRunMessage.method);
}

export namespace LastRunMessage {
  export interface Request
    extends RequestMessage<LastRunMethod, LastRunParams, LastRunResult> {}
}
