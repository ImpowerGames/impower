import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type BeginReconcileMethod = typeof BeginReconcileMessage.method;

export interface BeginReconcileParams {
  /** The pass reconciles written content only (#657): the text and pictures
   *  writes left are candidates to replace or clear, and the elements stand.
   *  A beat-only display sends it, re-emitting the content of a screen whose
   *  structure is the one the page already shows. */
  content?: boolean;
}

/**
 * Opens a reconcile pass: every element the page is showing becomes a
 * candidate to reuse or sweep. The game sends it at the start of every
 * connect, ahead of the stream that re-emits the screen, so the pass opens in
 * the same stream as the writes it reconciles. A content pass leaves the
 * elements out.
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
