import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export interface AudioSampleRateParams {
  sampleRate: number;
}

export type AudioSampleRateMethod = typeof AudioSampleRateMessage.method;

export class AudioSampleRateMessage {
  static readonly method = "audio/sample-rate";
  static readonly type = new MessageProtocolNotificationType<
    AudioSampleRateMethod,
    AudioSampleRateParams
  >(AudioSampleRateMessage.method);
}

export interface AudioSampleRateMessageMap extends Record<string, [any, any]> {
  [AudioSampleRateMessage.method]: [
    ReturnType<typeof AudioSampleRateMessage.type.notification>,
    undefined,
  ];
}
