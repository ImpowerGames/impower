import { MessageProtocolNotificationType } from "../../../../core/classes/MessageProtocolNotificationType";
import { ExitWorldParams } from "../../types/ExitWorldParams";

export type ExitWorldMethod = typeof ExitWorldMessage.method;

export class ExitWorldMessage {
  static readonly method = "world/exit";
  static readonly type = new MessageProtocolNotificationType<
    ExitWorldMethod,
    ExitWorldParams
  >(ExitWorldMessage.method);
}

export interface ExitWorldMessageMap extends Record<string, [any]> {
  [ExitWorldMessage.method]: [
    ReturnType<typeof ExitWorldMessage.type.notification>
  ];
}
