import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

/**
 * One reading of the page's audio clock against the shared clock: at shared
 * time `time` (`sharedNow`, milliseconds), sound scheduled at audio-context
 * time `contextTime` (seconds) starts. Without `contextTime` the page has no
 * running audio context, and the shared clock alone keeps time.
 */
export interface AudioClockParams {
  time: number;
  contextTime?: number;
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
