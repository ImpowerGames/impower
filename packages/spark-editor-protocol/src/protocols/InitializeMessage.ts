import type * as LSP from "../types";
import { MessageProtocolRequestType } from "./MessageProtocolRequestType";

export type InitializeMethod = typeof InitializeMessage.method;

export interface InitializationOptions {
  settings: {
    scriptFiles?: string;
    imageFiles?: string;
    audioFiles?: string;
    fontFiles?: string;
    worldFiles?: string;
  };
  definitions?: {
    builtins?: any;
    optionals?: any;
    schemas?: any;
    descriptions?: any;
  };
  files?: { uri: string; src?: string; text?: string }[];
  skipValidation?: boolean;
  uri?: string;
  omitImageData?: boolean;
}

export interface InitializeParams extends LSP.InitializeParams {
  initializationOptions: InitializationOptions;
}

export interface InitializeResult extends LSP.InitializeResult {}

export abstract class InitializeMessage {
  static readonly method = "initialize";
  static readonly type = new MessageProtocolRequestType<
    InitializeMethod,
    InitializeParams,
    InitializeResult
  >(InitializeMessage.method);
}
