import { SparkDeclarations, SparkStruct } from "../../../../sparkdown";
import { STRUCT_DEFAULTS } from "../constants/STRUCT_DEFAULTS";

export const getScriptAugmentations = (
  files: Record<
    string,
    {
      name?: string;
      fileType?: string;
      fileUrl?: string;
      fileExtension?: string;
    }
  >
): SparkDeclarations => {
  const structs: Record<string, SparkStruct> = {};
  Object.entries(files || {}).forEach(
    ([, { name, fileType, fileUrl, fileExtension }]) => {
      const type = fileType?.startsWith("audio/mid")
        ? "midi"
        : fileType?.startsWith("audio")
        ? "audio"
        : fileType?.startsWith("video")
        ? "video"
        : fileType?.startsWith("image/svg")
        ? "graphic"
        : fileType?.startsWith("image")
        ? "image"
        : "text";
      const ext = fileType?.startsWith("audio/mid")
        ? "mid"
        : fileType?.startsWith("image/svg")
        ? "svg"
        : fileExtension;
      const structName = name || "";
      structs[structName] = {
        from: -1,
        to: -1,
        line: -1,
        base: "",
        type,
        name: structName,
        fields: {
          [".src"]: {
            from: -1,
            to: -1,
            line: -1,
            name: "src",
            type: "string",
            value: fileUrl,
            valueText: `"${fileUrl}"`,
          },
          [".ext"]: {
            from: -1,
            to: -1,
            line: -1,
            name: "ext",
            type: "string",
            value: ext,
            valueText: `"${ext}"`,
          },
          [".type"]: {
            from: -1,
            to: -1,
            line: -1,
            name: "type",
            type: "string",
            value: type,
            valueText: `"${type}"`,
          },
        },
      };
    }
  );
  const objectMap = STRUCT_DEFAULTS;
  return { structs, objectMap };
};
