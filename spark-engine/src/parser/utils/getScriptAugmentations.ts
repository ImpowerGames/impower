import { SparkAsset, SparkParseResult } from "../../../../sparkdown";
import { FileData } from "../../data";

export const getScriptAugmentations = (
  files: Record<string, FileData>
): Partial<SparkParseResult> => {
  const variables: Record<string, SparkAsset> = {};
  Object.entries(files || {}).forEach(([, { name, fileType, fileUrl }]) => {
    const type = fileType?.startsWith("audio")
      ? "audio"
      : fileType?.startsWith("video")
      ? "video"
      : fileType?.startsWith("text")
      ? "text"
      : fileType?.startsWith("image/svg")
      ? "graphic"
      : "image";
    variables[`.${name}`] = {
      name: name || "",
      type,
      value: fileUrl || "",
      from: -1,
      to: -1,
      line: -1,
    };
  });
  return { variables };
};
