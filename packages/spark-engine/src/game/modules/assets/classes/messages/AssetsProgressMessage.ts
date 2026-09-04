import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { type AssetsProgressParams } from "../../types/AssetsProgressParams";

export type AssetsProgressMethod = typeof AssetsProgressMessage.method;

/** Page to engine: progress of one pinned request. A notification because
 *  the engine routes requests only to its first module. */
export class AssetsProgressMessage {
  static readonly method = "assets/progress";
  static readonly type = new MessageProtocolNotificationType<
    AssetsProgressMethod,
    AssetsProgressParams
  >(AssetsProgressMessage.method);
}

export interface AssetsProgressMessageMap extends Record<string, [any]> {
  [AssetsProgressMessage.method]: [
    ReturnType<typeof AssetsProgressMessage.type.notification>,
  ];
}
