import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { LoadAudioPlayerParams } from "../../../audio/types/LoadAudioPlayerParams";

export type SpeechMethod = typeof SpeechMessage.method;

export interface SpeechClip {
  load: LoadAudioPlayerParams;
  after: number;
}

export interface SpeechParams {
  character?: string;
  spans: [number, number][];
  voiced?: true;
  revealed?: true;
  time?: number;
  clips?: SpeechClip[];
}

export class SpeechMessage {
  static readonly method = "morph/speech";
  static readonly type = new MessageProtocolNotificationType<
    SpeechMethod,
    SpeechParams
  >(SpeechMessage.method);
}

export interface SpeechMessageMap extends Record<string, [any, any]> {
  [SpeechMessage.method]: [
    ReturnType<typeof SpeechMessage.type.notification>,
    undefined,
  ];
}
