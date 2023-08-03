import { MessageProtocolRequestType } from "./MessageProtocolRequestType";

export type InitializedMethod = typeof InitializedMessage.method;

export interface InitializedParams {}

export abstract class InitializedMessage {
  static readonly method = "initialized";
  static readonly type = new MessageProtocolRequestType<
    InitializedMethod,
    InitializedParams,
    null
  >(InitializedMessage.method);
}
