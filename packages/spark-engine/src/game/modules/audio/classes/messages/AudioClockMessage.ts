import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export interface AudioClockParams {
  time: number;
  contextTime?: number;
  outputLatency: number;
}

export type AudioClockMethod = typeof AudioClockMessage.method;

export class AudioClockMessage {
  static readonly method = "audio/clock";
  static readonly type = new MessageProtocolNotificationType<
    AudioClockMethod,
    AudioClockParams
  >(AudioClockMessage.method);
}

export interface AudioClockMessageMap extends Record<string, [any, any]> {
  [AudioClockMessage.method]: [
    ReturnType<typeof AudioClockMessage.type.notification>,
    undefined,
  ];
}
