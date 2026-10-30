import type { SparkProgram } from "../../../sparkdown/src/compiler";
import type { SparkdownCompilerConfig } from "../../../sparkdown/src/compiler/types/SparkdownCompilerConfig";
import type * as LSP from "../types";
import { MessageProtocolRequestType } from "./MessageProtocolRequestType";

export type InitializeMethod = typeof InitializeMessage.method;

export interface InitializationOptions extends Omit<
  SparkdownCompilerConfig,
  "files" | "definitions"
> {
  settings: {
    scriptFiles?: string;
    imageFiles?: string;
    audioFiles?: string;
    videoFiles?: string;
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
  uri?: string;
  omitImageData?: boolean;
  slimProgramNotifications?: boolean;
  compileDebounceDelay?: number;
}

export interface InitializeParams extends LSP.InitializeParams {
  initializationOptions?: InitializationOptions;
}

export interface InitializeResult extends LSP.InitializeResult {
  program?: SparkProgram;
  textDocuments?: {
    uri: string;
    text: string;
    version: number | null;
    languageId: string | null;
  }[];
}

export abstract class InitializeMessage {
  static readonly method = "initialize";
  static readonly type = new MessageProtocolRequestType<
    InitializeMethod,
    InitializeParams,
    InitializeResult
  >(InitializeMessage.method);
}
