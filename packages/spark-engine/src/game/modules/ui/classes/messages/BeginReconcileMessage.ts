import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type BeginReconcileMethod = typeof BeginReconcileMessage.method;

export interface BeginReconcileParams {
  /** The pass is a preview display, which ends with a sweep: the page holds
   *  everything the pass sends and puts it on the screen in one go at the
   *  sweep, so no frame shows the screen half rebuilt (#1820). */
  hold?: boolean;
}

/**
 * Opens a reconcile pass: every element the page is showing becomes a
 * candidate to reuse or sweep. The game sends it at the start of every
 * connect, ahead of the stream that re-emits the screen, so the pass opens in
 * the same stream as the writes it reconciles.
 */
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
