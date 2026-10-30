import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type BeginReconcileMethod = typeof BeginReconcileMessage.method;

export interface BeginReconcileParams {
  content?: boolean;
}

export class BeginReconcileMessage {
  static readonly method = "ui/reconcile-begin";
  static readonly type = new MessageProtocolNotificationType<
    BeginReconcileMethod,
    BeginReconcileParams
  >(BeginReconcileMessage.method);
}

export interface BeginReconcileMessageMap extends Record<string, [any, any]> {
  [BeginReconcileMessage.method]: [
    ReturnType<typeof BeginReconcileMessage.type.notification>,
    undefined,
  ];
}
