import {
  ProtocolNotificationType,
  ProtocolRequestType,
} from "vscode-languageserver-protocol";
import type { MessageProtocolRequestType } from "../protocols/MessageProtocolRequestType";
import type { MessageProtocolNotificationType } from "../protocols/MessageProtocolNotificationType";
import type { EditorNotificationParams } from "../types/base/NotificationMessage";

/** Real upstream descriptors retain LSP's by-name parameter encoding. */
export const asLspRequest = <M extends string, P, R>(
  type: MessageProtocolRequestType<M, P, R>,
): ProtocolRequestType<P, R, void, void, void> =>
  new ProtocolRequestType<P, R, void, void, void>(type.method);

export const asLspNotification = <M extends string, P>(
  type: MessageProtocolNotificationType<M, P>,
): ProtocolNotificationType<EditorNotificationParams<P>, void> =>
  new ProtocolNotificationType<EditorNotificationParams<P>, void>(type.method);
