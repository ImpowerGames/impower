import { TextConfig } from "../../../../../data/interfaces/configs/textConfig";
import { FileData } from "../../file/fileData";

export interface TextFileData extends FileData {
  fileType: "text/*";
  config?: TextConfig;
}
