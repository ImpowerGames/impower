import { MessageConnection } from "@impower/spark-editor-protocol/src/types";
import {
  defineAll,
  DefineOptions,
} from "../../../../spec-component/src/component";
import { FileSystemReader } from "../../cm-language-client/types/FileSystemReader";
import Main from "./main/sparkdown-script-editor";

export const DEFAULT_CONSTRUCTORS = [Main] as const;

interface InitOptions extends DefineOptions {
  constructors?: typeof DEFAULT_CONSTRUCTORS;
  languageServerConnection: MessageConnection;
  fileSystemReader: FileSystemReader;
}

export default abstract class SparkdownScriptEditor {
  static async init(options: InitOptions): Promise<CustomElementConstructor[]> {
    const constructors = options.constructors ?? DEFAULT_CONSTRUCTORS;
    constructors.forEach((c) => {
      c.languageServerConnection = options.languageServerConnection;
      c.fileSystemReader = options.fileSystemReader;
    });
    return defineAll(constructors, options);
  }
}
