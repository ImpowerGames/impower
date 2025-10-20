import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";

export type DestroyElementMethod = typeof DestroyElementMessage.method;

export interface DestroyElementParams {
  element: string;
}

export class DestroyElementMessage {
  static readonly method = "ui/destroy";
  static readonly type = new MessageProtocolRequestType<
    DestroyElementMethod,
    DestroyElementParams,
    string
  >(DestroyElementMessage.method);
}

export interface DestroyElementMessageMap extends Record<string, [any, any]> {
  [DestroyElementMessage.method]: [
    ReturnType<typeof DestroyElementMessage.type.request>,
    ReturnType<typeof DestroyElementMessage.type.response>
  ];
}
