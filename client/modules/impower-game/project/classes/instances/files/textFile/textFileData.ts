import {
  createTextConfig,
  TextConfig,
} from "../../../../../data/interfaces/configs/textConfig";
import { createFileData, FileData, isFileData } from "../../file/fileData";

export interface TextFileData extends FileData {
  fileType: "text/*";
  config: TextConfig;
}

export const createTextFileData = (
  doc?: Partial<TextFileData>
): TextFileData => {
  return {
    ...createFileData(doc),
    name: "",
    storageKey: "",
    fileType: "text/*",
    config: createTextConfig(),
    ...doc,
  };
};

export const isTextFileData = (obj: unknown): obj is TextFileData => {
  if (!obj) {
    return false;
  }
  const doc = obj as TextFileData;
  return isFileData(doc) && doc.fileType?.toLowerCase().startsWith("text");
};
