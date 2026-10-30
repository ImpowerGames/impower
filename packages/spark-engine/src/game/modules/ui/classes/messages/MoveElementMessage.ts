import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";

export type MoveElementMethod = typeof MoveElementMessage.method;

export interface MoveElementParams {
  element: string;
  before: string | null;
}

export class MoveElementMessage {
  static readonly method = "ui/move";
  static readonly type = new MessageProtocolRequestType<
    MoveElementMethod,
    MoveElementParams,
    string
  >(MoveElementMessage.method);
}

export interface MoveElementMessageMap extends Record<string, [any, any]> {
  [MoveElementMessage.method]: [
    ReturnType<typeof MoveElementMessage.type.request>,
    ReturnType<typeof MoveElementMessage.type.response>,
  ];
}
