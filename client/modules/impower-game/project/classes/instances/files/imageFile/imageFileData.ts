import {
  createImageConfig,
  ImageConfig,
} from "../../../../../data/interfaces/configs/imageConfig";
import { createFileData, FileData, isFileData } from "../../file/fileData";

export interface ImageFileData extends FileData {
  fileType: "image/*";
  config: ImageConfig;
}

export const createImageFileData = (
  doc?: Partial<ImageFileData>
): ImageFileData => {
  return {
    ...createFileData(doc),
    name: "",
    storageKey: "",
    fileType: "image/*",
    config: createImageConfig(),
    ...doc,
  };
};

export const isImageFileData = (obj: unknown): obj is ImageFileData => {
  if (!obj) {
    return false;
  }
  const doc = obj as ImageFileData;
  return isFileData(doc) && doc.fileType?.toLowerCase().startsWith("image");
};
