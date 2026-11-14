import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SetPlayAudioMethod = typeof SetPlayAudioMessage.method;

export interface SetPlayAudioParams {
  enabled: boolean;
}

export interface SetPlayAudioResult {}

export class SetPlayAudioMessage {
  static readonly method = "preview/setPlayAudio";
  static readonly type = new MessageProtocolRequestType<
    SetPlayAudioMethod,
    SetPlayAudioParams,
    SetPlayAudioResult
  >(SetPlayAudioMessage.method);
}

export namespace SetPlayAudioMessage {
  export interface Request extends RequestMessage<
    SetPlayAudioMethod,
    SetPlayAudioParams,
    SetPlayAudioResult
  > {}
  export type Response = ResponseMessage<
    SetPlayAudioMethod,
    SetPlayAudioResult
  >;
}
