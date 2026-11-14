import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type PlayBeatMethod = typeof PlayBeatMessage.method;

export interface PlayBeatParams {}

export interface PlayBeatResult {
  playing: boolean;
}

export class PlayBeatMessage {
  static readonly method = "preview/playBeat";
  static readonly type = new MessageProtocolRequestType<
    PlayBeatMethod,
    PlayBeatParams,
    PlayBeatResult
  >(PlayBeatMessage.method);
}

export namespace PlayBeatMessage {
  export interface Request extends RequestMessage<
    PlayBeatMethod,
    PlayBeatParams,
    PlayBeatResult
  > {}
  export type Response = ResponseMessage<PlayBeatMethod, PlayBeatResult>;
}
