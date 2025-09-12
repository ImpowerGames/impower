import { MessageConnection } from "@impower/spark-editor-protocol/src/types";
import { DefineOptions } from "../../../../spec-component/src/component";
import { FileSystemReader } from "../../cm-language-client/types/FileSystemReader";
import Main from "./main/sparkdown-script-editor";

interface InitOptions extends DefineOptions {
  tag?: string;
  languageServerConnection: MessageConnection;
  fileSystemReader: FileSystemReader;
}

export default abstract class SparkdownScriptEditor {
  static async init(options: InitOptions) {
    const name = options?.tag ?? Main.tag;
    Main.languageServerConnection = options.languageServerConnection;
    Main.fileSystemReader = options.fileSystemReader;
    customElements.define(name, Main);
    return customElements.whenDefined(name);
  }
}
