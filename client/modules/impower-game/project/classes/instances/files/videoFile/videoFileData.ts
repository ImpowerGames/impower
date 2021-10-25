import {
  createVideoConfig,
  VideoConfig,
} from "../../../../../data/interfaces/configs/videoConfig";
import { createFileData, FileData, isFileData } from "../../file/fileData";

export interface VideoFileData extends FileData {
  fileType: "video/*";
  config: VideoConfig;
}

export const createVideoFileData = (
  doc?: Partial<VideoFileData>
): VideoFileData => {
  return {
    ...createFileData(doc),
    name: "",
    storageKey: "",
    fileType: "video/*",
    config: createVideoConfig(),
    ...doc,
  };
};

export const isVideoFileData = (obj: unknown): obj is VideoFileData => {
  if (!obj) {
    return false;
  }
  const doc = obj as VideoFileData;
  return isFileData(doc) && doc.fileType?.toLowerCase().startsWith("video");
};
