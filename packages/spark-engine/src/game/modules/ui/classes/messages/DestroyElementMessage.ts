import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";

export type DestroyElementMethod = typeof DestroyElementMessage.method;

export interface DestroyElementParams {
  element: string;
  /** The element of a layout a composed close retired, going once its exit
   *  has played (#1820). It is no part of a beat, so a beat waiting for its
   *  commit on the page goes on waiting. */
  retired?: boolean;
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
    ReturnType<typeof DestroyElementMessage.type.response>,
  ];
}
