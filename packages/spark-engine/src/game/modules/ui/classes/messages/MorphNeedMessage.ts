import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type MorphNeedMethod = typeof MorphNeedMessage.method;

export interface MorphNeedParams {
  key: string;
}

export class MorphNeedMessage {
  static readonly method = "morph/need";
  static readonly type = new MessageProtocolNotificationType<
    MorphNeedMethod,
    MorphNeedParams
  >(MorphNeedMessage.method);
}
