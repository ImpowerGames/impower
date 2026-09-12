import { MessageProtocolNotificationType as CoreNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { EditorNotificationParams } from "../types/base/NotificationMessage";

/** Compatibility facade carrying the editor's relay hint. */
export class MessageProtocolNotificationType<
  M extends string,
  P = undefined,
> extends CoreNotificationType<M, EditorNotificationParams<P>> {}
