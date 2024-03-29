import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";
import { LoadAudioPlayerParams } from "../../types/LoadAudioPlayerParams";

export type LoadAudioPlayerMethod = typeof LoadAudioPlayerMessage.method;

export class LoadAudioPlayerMessage {
  static readonly method = "audio/loadPlayer";
  static readonly type = new MessageProtocolRequestType<
    LoadAudioPlayerMethod,
    LoadAudioPlayerParams,
    LoadAudioPlayerParams
  >(LoadAudioPlayerMessage.method);
}

export interface LoadAudioPlayerMessageMap extends Record<string, [any, any]> {
  [LoadAudioPlayerMessage.method]: [
    ReturnType<typeof LoadAudioPlayerMessage.type.request>,
    ReturnType<typeof LoadAudioPlayerMessage.type.response>
  ];
}
