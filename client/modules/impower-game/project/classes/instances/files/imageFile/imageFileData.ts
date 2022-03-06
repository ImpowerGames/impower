import { ImageConfig } from "../../../../../data/interfaces/configs/imageConfig";
import { FileData } from "../../file/fileData";

export interface ImageFileData extends FileData {
  fileType: "image/*";
  config?: ImageConfig;
}
