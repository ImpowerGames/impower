import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type ShowingMethod = typeof ShowingMessage.method;

export interface ShowingParams {
  add: string[];
  remove: string[];
  reset?: boolean;
  retired?: boolean;
}

export class ShowingMessage {
  static readonly method = "ui/showing";
  static readonly type = new MessageProtocolNotificationType<
    ShowingMethod,
    ShowingParams
  >(ShowingMessage.method);
}

export interface ShowingMessageMap extends Record<string, [any, any]> {
  [ShowingMessage.method]: [
    ReturnType<typeof ShowingMessage.type.notification>,
    undefined,
  ];
}
