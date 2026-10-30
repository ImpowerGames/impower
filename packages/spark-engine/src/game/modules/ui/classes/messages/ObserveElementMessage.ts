import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type ObserveElementMethod = typeof ObserveElementMessage.method;

export interface ObserveElementParams {
  element: string;
  event: string;
  stopPropagation: boolean;
  once: boolean;
}

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
