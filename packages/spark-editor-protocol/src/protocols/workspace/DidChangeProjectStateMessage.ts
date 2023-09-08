import { ProjectState } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangeProjectStateMethod =
  typeof DidChangeProjectStateMessage.method;

export interface DidChangeProjectStateParams {
  changed: (keyof ProjectState)[];
  state: ProjectState;
}

export namespace DidChangeProjectStateMessage {
  export const method = "workspace/didChangeProjectState";
  export const type = new MessageProtocolNotificationType<
    DidChangeProjectStateMethod,
    DidChangeProjectStateParams
  >(DidChangeProjectStateMessage.method);
}
