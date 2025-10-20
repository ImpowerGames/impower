import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { ConfigureAudioMixerParams } from "../../types/ConfigureAudioMixerParams";

export type ConfigureAudioMixerMethod =
  typeof ConfigureAudioMixerMessage.method;

export class ConfigureAudioMixerMessage {
  static readonly method = "audio/configure";
  static readonly type = new MessageProtocolRequestType<
    ConfigureAudioMixerMethod,
    ConfigureAudioMixerParams,
    ConfigureAudioMixerParams
  >(ConfigureAudioMixerMessage.method);
}

export interface ConfigureAudioMixerMessageMap
  extends Record<string, [any, any]> {
  [ConfigureAudioMixerMessage.method]: [
    ReturnType<typeof ConfigureAudioMixerMessage.type.request>,
    ReturnType<typeof ConfigureAudioMixerMessage.type.response>
  ];
}
