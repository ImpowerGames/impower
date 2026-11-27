import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export interface AudioReleasedParams {
  channel: string;
  key: string;
}

export type AudioReleasedMethod = typeof AudioReleasedMessage.method;

export class AudioReleasedMessage {
  static readonly method = "audio/released";
  static readonly type = new MessageProtocolNotificationType<
    AudioReleasedMethod,
    AudioReleasedParams
  >(AudioReleasedMessage.method);
}

export interface AudioReleasedMessageMap extends Record<string, [any, any]> {
  [AudioReleasedMessage.method]: [
    ReturnType<typeof AudioReleasedMessage.type.notification>,
    undefined,
  ];
}
