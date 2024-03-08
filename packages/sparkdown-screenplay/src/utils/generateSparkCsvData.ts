import { SparkToken } from "../../../sparkdown/src/types/SparkToken";

export const generateSparkCsvData = (
  tokens: SparkToken[],
  language = "en-US"
): string[][] => {
  const strings: string[][] = [["KEY", "CONTEXT", language]];
  (tokens || []).forEach((t) => {
    if (t.ignore) {
      return;
    }
    if (t.tag === "dialogue") {
      t.content?.map((box) => {
        const content = box.content?.map((c) => c.text).join("") || "";
        strings.push([box.id, `D`, content]);
      });
    }
    if (t.tag === "action") {
      t.content?.map((box) => {
        const content = box.content?.map((c) => c.text).join("") || "";
        strings.push([box.id, `A`, content]);
      });
    }
    if (t.tag === "transition") {
      const content = t.content?.map((c) => c.text).join("") || "";
      strings.push([t.id, "T", content]);
    }
    if (t.tag === "scene") {
      const content = t.content?.map((c) => c.text).join("") || "";
      strings.push([t.id, "S", content]);
    }
  });
  return strings;
};
