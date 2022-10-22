import { SparkVariable } from "../../../../sparkdown";

export const getScriptAugmentations = (
  files: Record<string, { name?: string; fileType?: string; fileUrl?: string }>
): { variables: Record<string, SparkVariable> } => {
  const variables: Record<string, SparkVariable> = {};
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
