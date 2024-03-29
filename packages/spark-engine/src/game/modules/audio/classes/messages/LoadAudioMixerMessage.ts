import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";
import { LoadAudioMixerParams } from "../../types/LoadAudioMixerParams";

export type LoadAudioMixerMethod = typeof LoadAudioMixerMessage.method;

export class LoadAudioMixerMessage {
  static readonly method = "audio/loadMixer";
  static readonly type = new MessageProtocolRequestType<
    LoadAudioMixerMethod,
    LoadAudioMixerParams,
    LoadAudioMixerParams
  >(LoadAudioMixerMessage.method);
}

export interface LoadAudioMixerMessageMap extends Record<string, [any, any]> {
  [LoadAudioMixerMessage.method]: [
    ReturnType<typeof LoadAudioMixerMessage.type.request>,
    ReturnType<typeof LoadAudioMixerMessage.type.response>
  ];
}
