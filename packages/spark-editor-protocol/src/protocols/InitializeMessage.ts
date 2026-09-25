import type { SparkProgram } from "../../../sparkdown/src/compiler";
import type { SparkdownCompilerConfig } from "../../../sparkdown/src/compiler/types/SparkdownCompilerConfig";
import type * as LSP from "../types";
import { MessageProtocolRequestType } from "./MessageProtocolRequestType";

export type InitializeMethod = typeof InitializeMessage.method;

/**
 * What a client sends the language server at startup. Everything the server
 * does not consume itself is handed straight to the compiler, so the compiler's
 * own configuration is part of this shape — apart from the two fields declared
 * differently here: files arrive as uris the server resolves, and definitions
 * are supplied by the host rather than typed against the compiler's tables.
 */
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
  /** Drop image data from the program the server relays back to the client. */
  omitImageData?: boolean;
  /** Relay a reduced program on change notifications instead of the whole one. */
  slimProgramNotifications?: boolean;
  /** How long the server waits after a change before recompiling, in ms. */
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
