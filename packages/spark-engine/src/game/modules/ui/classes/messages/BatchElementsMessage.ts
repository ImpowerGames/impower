import { IMessage } from "@impower/jsonrpc/src/common/types/IMessage";
import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type BatchElementsMethod = typeof BatchElementsMessage.method;

export interface BatchElementsParams {
  /** An ordered run of fire-and-forget UI op messages (create / update /
   *  destroy / move / observe / unobserve / set-theme) coalesced from one
   *  synchronous emit burst. The consumer dispatches each in order through its
   *  normal per-op handling. Awaited ops (write-text / write-image / animate)
   *  are NOT batched — they stay individual requests, emitted after the pending
   *  batch is flushed so ordering is preserved. */
  messages: IMessage[];
}

// `ui/batch` is a NOTIFICATION: the coalesced ops are all fire-and-forget, so
// the batch needs no response. Batching cuts the per-turn message volume the
// reactive runtime emits (one envelope instead of N create/update round-trips)
// and gives a single flush boundary for a future worker/Unity transport.
export class BatchElementsMessage {
  static readonly method = "ui/batch";
  static readonly type = new MessageProtocolNotificationType<
    BatchElementsMethod,
    BatchElementsParams
  >(BatchElementsMessage.method);
}

export interface BatchElementsMessageMap extends Record<string, [any, any]> {
  [BatchElementsMessage.method]: [
    ReturnType<typeof BatchElementsMessage.type.notification>,
    undefined,
  ];
}
