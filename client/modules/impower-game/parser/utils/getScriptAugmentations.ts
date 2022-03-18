import { FountainParseResult } from "../../../impower-script-parser";
import { FileData } from "../../data";

export const getScriptAugmentations = (
  files: Record<string, FileData>
): Partial<FountainParseResult> => {
  const assets = {};
  Object.entries(files || {}).forEach(([, { name, fileType, fileUrl }]) => {
    const type = fileType?.startsWith("audio")
      ? "audio"
      : fileType?.startsWith("video")
      ? "video"
      : fileType?.startsWith("text")
      ? "text"
      : "image";
    assets[`.${name}`] = {
      name,
      type,
      value: fileUrl,
    };
  });
  return { assets };
};
