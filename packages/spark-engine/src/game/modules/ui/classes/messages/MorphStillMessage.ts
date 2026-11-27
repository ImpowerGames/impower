import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type MorphStillMethod = typeof MorphStillMessage.method;

export interface MorphStillParams {
  image: string;
  file: string;
  reason: "animated" | "profile" | "unread" | "unsized" | "undrawn" | "styled" | "late";
  declaration?: string;
  placeholder?: true;
}

export class MorphStillMessage {
  static readonly method = "morph/still";
  static readonly type = new MessageProtocolNotificationType<
    MorphStillMethod,
    MorphStillParams
  >(MorphStillMessage.method);
}
