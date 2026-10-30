import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type UnobserveElementMethod = typeof UnobserveElementMessage.method;

export interface UnobserveElementParams {
  element: string;
  event: string;
  retired?: boolean;
}

export class UnobserveElementMessage {
  static readonly method = "ui/unobserve";
  static readonly type = new MessageProtocolNotificationType<
    UnobserveElementMethod,
    UnobserveElementParams
  >(UnobserveElementMessage.method);
}

export interface UnobserveElementMessageMap extends Record<string, [any, any]> {
  [UnobserveElementMessage.method]: [
    ReturnType<typeof UnobserveElementMessage.type.notification>,
    undefined,
  ];
}
