import { SparkTokenTypeMap } from "../types/SparkTokenTypeMap";
import getIndent from "./getIndent";
import getTo from "./getTo";

const createSparkToken = <K extends keyof SparkTokenTypeMap = "">(
  type: K,
  newLineLength?: number,
  obj?: Partial<SparkTokenTypeMap[K]>
): SparkTokenTypeMap[K] => {
  const t = (obj || {}) as unknown as SparkTokenTypeMap[K];
  t.content = obj?.content ?? "";
  t.line = obj?.line ?? -1;
  t.from = obj?.from ?? -1;
  t.text = obj?.text ?? "";
  t.notes = obj?.notes ?? [];
  t.order = obj?.order ?? 0;
  t.ignore = obj?.ignore ?? false;
  t.skipToNextPreview = obj?.skipToNextPreview ?? false;
  t.html = obj?.html;
  const indent = getIndent(t.content);
  const offset = indent.length;
  t.offset = offset;
  t.indent = Math.floor(offset / 2);
  t.to = getTo(t.from, t.content, newLineLength || 0);
  t.type = type || "comment";
  return t;
};

export default createSparkToken;
