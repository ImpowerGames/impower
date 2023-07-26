import { MessageConnection } from "vscode-languageserver-protocol";
import { FileSystemReader } from "../../cm-language-client/types/FileSystemReader";
import Main from "./main/sparkdown-script-editor";

export const DEFAULT_CONSTRUCTORS = {
  "sparkdown-script-editor": Main,
} as const;

interface InitOptions {
  useShadowDom?: boolean;
  constructors?: typeof DEFAULT_CONSTRUCTORS;
  dependencies?: Record<string, string>;
  languageServerConnection: MessageConnection;
  fileSystemReader: FileSystemReader;
}

export default abstract class SparkdownScriptEditor {
  static async init(options: InitOptions): Promise<CustomElementConstructor[]> {
    const useShadowDom = options.useShadowDom ?? true;
    const constructors = options.constructors ?? DEFAULT_CONSTRUCTORS;
    const dependencies = options.dependencies ?? {};
    Main.languageServerConnection = options.languageServerConnection;
    Main.fileSystemReader = options.fileSystemReader;
    return Promise.all(
      Object.entries(constructors).map(([k, v]) =>
        v.define(dependencies?.[k] || k, dependencies as any, useShadowDom)
      )
    );
  }
}
