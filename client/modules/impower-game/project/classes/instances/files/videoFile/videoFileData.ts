import { VideoConfig } from "../../../../../data/interfaces/configs/videoConfig";
import { FileData } from "../../file/fileData";

export interface VideoFileData extends FileData {
  fileType: "video/*";
  config?: VideoConfig;
}
