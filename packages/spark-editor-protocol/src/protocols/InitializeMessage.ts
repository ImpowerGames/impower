import { MessageProtocolRequestType } from "./MessageProtocolRequestType";

export type InitializeMethod = typeof InitializeMessage.method;

export interface InitializeParams {}

export abstract class InitializeMessage {
  static readonly method = "initialize";
  static readonly type = new MessageProtocolRequestType<
    InitializeMethod,
    InitializeParams,
    null
  >(InitializeMessage.method);
}
