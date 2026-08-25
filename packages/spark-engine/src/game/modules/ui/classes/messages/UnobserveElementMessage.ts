import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type UnobserveElementMethod = typeof UnobserveElementMessage.method;

export interface UnobserveElementParams {
  element: string;
  event: string;
}

// A NOTIFICATION (not a request) — see ObserveElementMessage: the consumer just
// detaches its DOM listener and never replies, so modeling it as a request
// leaked a connection resolve callback per call.
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
