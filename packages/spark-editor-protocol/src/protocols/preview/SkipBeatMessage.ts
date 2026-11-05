import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SkipBeatMethod = typeof SkipBeatMessage.method;

export interface SkipBeatParams {
  direction: -1 | 1;
}

export interface SkipBeatResult {
  moved: boolean;
}

export class SkipBeatMessage {
  static readonly method = "preview/skipBeat";
  static readonly type = new MessageProtocolRequestType<
    SkipBeatMethod,
    SkipBeatParams,
    SkipBeatResult
  >(SkipBeatMessage.method);
}

export namespace SkipBeatMessage {
  export interface Request extends RequestMessage<
    SkipBeatMethod,
    SkipBeatParams,
    SkipBeatResult
  > {}
  export type Response = ResponseMessage<SkipBeatMethod, SkipBeatResult>;
}
