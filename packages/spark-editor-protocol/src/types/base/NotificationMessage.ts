import type { NotificationMessage as CoreNotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";

export type EditorNotificationParams<P> = P extends object
  ? P & { remote?: boolean }
  : P;

export type NotificationMessage<
  M extends string = string,
  P = unknown,
> = CoreNotificationMessage<M, EditorNotificationParams<P>>;
