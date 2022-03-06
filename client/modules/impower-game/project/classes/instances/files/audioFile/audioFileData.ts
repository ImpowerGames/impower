import { AudioConfig } from "../../../../../data/interfaces/configs/audioConfig";
import { FileData } from "../../file/fileData";

export interface AudioFileData extends FileData {
  fileType: "audio/*";
  config?: AudioConfig;
}
