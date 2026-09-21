import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type SweepReconcileMethod = typeof SweepReconcileMessage.method;

export interface SweepReconcileParams {}

/**
 * Closes a reconcile pass: the page removes whatever it was showing that the
 * stream since the pass opened did not emit again. It follows the last write
 * of the stream, so everything that stream shows is already on the page.
 */
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
