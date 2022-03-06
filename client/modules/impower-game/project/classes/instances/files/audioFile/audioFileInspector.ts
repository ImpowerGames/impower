import { FileInspector } from "../../file/fileInspector";
import { AudioFileData } from "./audioFileData";

export class AudioFileInspector extends FileInspector {
  private static _instance: AudioFileInspector;

  public static get instance(): AudioFileInspector {
    if (!this._instance) {
      this._instance = new AudioFileInspector();
    }
    return this._instance;
  }

  createData(data?: Partial<AudioFileData>): AudioFileData {
    return {
      name: "",
      storageKey: "",
      fileId: "",
      fileType: "audio/*",
      ...data,
    };
  }
}
