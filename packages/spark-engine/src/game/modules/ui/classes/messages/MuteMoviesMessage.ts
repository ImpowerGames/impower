import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type MuteMoviesMethod = typeof MuteMoviesMessage.method;

export interface MuteMoviesParams {}

export class MuteMoviesMessage {
  static readonly method = "ui/mute-movies";
  static readonly type = new MessageProtocolNotificationType<
    MuteMoviesMethod,
    MuteMoviesParams
  >(MuteMoviesMessage.method);
}

export interface MuteMoviesMessageMap extends Record<string, [any, any]> {
  [MuteMoviesMessage.method]: [
    ReturnType<typeof MuteMoviesMessage.type.notification>,
    undefined,
  ];
}
