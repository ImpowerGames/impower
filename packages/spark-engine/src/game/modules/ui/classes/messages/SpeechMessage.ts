import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type SpeechMethod = typeof SpeechMessage.method;

export interface SpeechParams {
  character?: string;
  spans: [number, number][];
  beeps?: number[];
  voiced?: true;
  revealed?: true;
  time?: number;
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
