import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

/**
 * One reading of the page's audio clock against the shared clock: at shared
 * time `time` (`sharedNow`, milliseconds), sound scheduled at audio-context
 * time `contextTime` (seconds) starts. Without `contextTime` the page has no
 * running audio context, and the shared clock alone keeps time.
 *
 * `outputLatency` (seconds) is how long sound takes to reach the speakers,
 * 0 without a running context. The page shows a stamped beat that long after
 * its stamp, and the game counts the beat's duration from the same moment.
 */
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
