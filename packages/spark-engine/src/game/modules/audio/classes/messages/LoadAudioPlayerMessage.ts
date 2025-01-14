import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";
import { LoadAudioPlayerParams } from "../../types/LoadAudioPlayerParams";
import { LoadAudioPlayerResult } from "../../types/LoadAudioPlayerResult";

export type LoadAudioPlayerMethod = typeof LoadAudioPlayerMessage.method;

export class LoadAudioPlayerMessage {
  static readonly method = "audio/load";
  static readonly type = new MessageProtocolRequestType<
    LoadAudioPlayerMethod,
    LoadAudioPlayerParams,
    LoadAudioPlayerResult
  >(LoadAudioPlayerMessage.method);
}

export interface LoadAudioPlayerMessageMap extends Record<string, [any, any]> {
  [LoadAudioPlayerMessage.method]: [
    ReturnType<typeof LoadAudioPlayerMessage.type.request>,
    ReturnType<typeof LoadAudioPlayerMessage.type.response>
  ];
}
