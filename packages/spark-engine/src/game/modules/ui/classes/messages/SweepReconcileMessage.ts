import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type SweepReconcileMethod = typeof SweepReconcileMessage.method;

export interface SweepReconcileParams {}

export class SweepReconcileMessage {
  static readonly method = "ui/reconcile-sweep";
  static readonly type = new MessageProtocolNotificationType<
    SweepReconcileMethod,
    SweepReconcileParams
  >(SweepReconcileMessage.method);
}

export interface SweepReconcileMessageMap extends Record<string, [any, any]> {
  [SweepReconcileMessage.method]: [
    ReturnType<typeof SweepReconcileMessage.type.notification>,
    undefined,
  ];
}
