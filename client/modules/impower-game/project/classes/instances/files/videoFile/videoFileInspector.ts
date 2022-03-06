import { FileInspector } from "../../file/fileInspector";
import { VideoFileData } from "./videoFileData";

export class VideoFileInspector extends FileInspector {
  private static _instance: VideoFileInspector;

  public static get instance(): VideoFileInspector {
    if (!this._instance) {
      this._instance = new VideoFileInspector();
    }
    return this._instance;
  }

  createData(data?: Partial<VideoFileData>): VideoFileData {
    return {
      name: "",
      storageKey: "",
      fileId: "",
      fileType: "video/*",
      ...data,
    };
  }
}
