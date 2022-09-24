import { SparkParseResult } from "../../../../../sparkdown";
import { FileData } from "../../data";

export const getScriptAugmentations = (
  files: Record<string, FileData>
): Partial<SparkParseResult> => {
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
      valueText: `"${fileUrl}"`,
    };
  });
  return { assets };
};
