import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";

export type PresenceElementsMethod = typeof PresenceElementsMessage.method;

export type PresenceMotion = "show" | "hide";

export interface PresenceElementsParams {
  effects: {
    element: string;
    presence: PresenceMotion;
  }[];
}

export class PresenceElementsMessage {
  static readonly method = "ui/presence";
  static readonly type = new MessageProtocolRequestType<
    PresenceElementsMethod,
    PresenceElementsParams,
    string[]
  >(PresenceElementsMessage.method);
}

export interface PresenceElementsMessageMap extends Record<string, [any, any]> {
  [PresenceElementsMessage.method]: [
    ReturnType<typeof PresenceElementsMessage.type.request>,
    ReturnType<typeof PresenceElementsMessage.type.response>,
  ];
}
