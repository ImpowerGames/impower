import type { NotificationMessage as CoreNotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";

/** Editor event-bus relay metadata; not part of the generic RPC contract. */
export type EditorNotificationParams<P> = P extends object
  ? P & { remote?: boolean }
  : P;

export type NotificationMessage<
  M extends string = string,
  P = unknown,
> = CoreNotificationMessage<M, EditorNotificationParams<P>>;
