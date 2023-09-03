import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangePersistenceStateMethod =
  typeof DidChangePersistenceStateMessage.method;

export interface DidChangePersistenceStateParams {
  state: string;
}

export namespace DidChangePersistenceStateMessage {
  export const method = "window/didChangePersistenceState";
  export const type = new MessageProtocolNotificationType<
    DidChangePersistenceStateMethod,
    DidChangePersistenceStateParams
  >(DidChangePersistenceStateMessage.method);
}
