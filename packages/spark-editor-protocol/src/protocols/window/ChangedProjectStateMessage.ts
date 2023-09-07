import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ChangedProjectStateMethod =
  typeof ChangedProjectStateMessage.method;

export interface ChangedProjectStateParams {
  props: string[];
}

export namespace ChangedProjectStateMessage {
  export const method = "window/changedProjectState";
  export const type = new MessageProtocolNotificationType<
    ChangedProjectStateMethod,
    ChangedProjectStateParams
  >(ChangedProjectStateMessage.method);
}
