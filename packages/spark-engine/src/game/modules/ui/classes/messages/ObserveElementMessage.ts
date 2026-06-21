import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type ObserveElementMethod = typeof ObserveElementMessage.method;

export interface ObserveElementParams {
  element: string;
  event: string;
  stopPropagation: boolean;
  once: boolean;
}

// A NOTIFICATION (not a request): the consumer attaches a DOM listener and
// reports fired events back via a separate `event` notification — it never
// replies to the observe itself. Modeling it as a request leaked a resolve
// callback per observe in the connection (the response never came), and the
// reactive keyed-`for` reconciler observes/unobserves on every mount.
export class ObserveElementMessage {
  static readonly method = "ui/observe";
  static readonly type = new MessageProtocolNotificationType<
    ObserveElementMethod,
    ObserveElementParams
  >(ObserveElementMessage.method);
}

export interface ObserveElementMessageMap extends Record<string, [any, any]> {
  [ObserveElementMessage.method]: [
    ReturnType<typeof ObserveElementMessage.type.notification>,
    undefined,
  ];
}
