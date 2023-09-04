import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ChangedHeaderInfoMethod = typeof ChangedHeaderInfoMessage.method;

export interface ChangedHeaderInfoParams {}

export namespace ChangedHeaderInfoMessage {
  export const method = "window/changedHeaderInfo";
  export const type = new MessageProtocolNotificationType<
    ChangedHeaderInfoMethod,
    ChangedHeaderInfoParams
  >(ChangedHeaderInfoMessage.method);
}
