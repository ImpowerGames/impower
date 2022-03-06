import { FileInspector } from "../../file/fileInspector";
import { TextFileData } from "./textFileData";

export class TextFileInspector extends FileInspector {
  private static _instance: TextFileInspector;

  public static get instance(): TextFileInspector {
    if (!this._instance) {
      this._instance = new TextFileInspector();
    }
    return this._instance;
  }

  createData(data?: Partial<TextFileData>): TextFileData {
    return {
      name: "",
      storageKey: "",
      fileId: "",
      fileType: "text/*",
      ...data,
    };
  }
}
