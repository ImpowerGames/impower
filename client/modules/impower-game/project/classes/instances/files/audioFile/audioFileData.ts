import {
  createAudioConfig,
  AudioConfig,
} from "../../../../../data/interfaces/configs/audioConfig";
import { createFileData, FileData, isFileData } from "../../file/fileData";

export interface AudioFileData extends FileData {
  fileType: "audio/*";
  config: AudioConfig;
}

export const createAudioFileData = (
  doc?: Partial<AudioFileData>
): AudioFileData => {
  return {
    ...createFileData(doc),
    name: "",
    storageKey: "",
    fileType: "audio/*",
    config: createAudioConfig(),
    ...doc,
  };
};

export const isAudioFileData = (obj: unknown): obj is AudioFileData => {
  if (!obj) {
    return false;
  }
  const doc = obj as AudioFileData;
  return isFileData(doc) && doc.fileType?.toLowerCase().startsWith("audio");
};
