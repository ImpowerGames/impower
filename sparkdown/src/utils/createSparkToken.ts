import { sparkRegexes } from "../constants/sparkRegexes";
import { SparkTokenTypeMap } from "../types/SparkTokenTypeMap";
import { getTo } from "./getTo";

export const createSparkToken = <K extends keyof SparkTokenTypeMap = "">(
  type: K,
  newLineLength?: number,
  obj?: Partial<SparkTokenTypeMap[K]>
): SparkTokenTypeMap[K] => {
  const t = (obj || {}) as unknown as SparkTokenTypeMap[K];
  t.content = obj?.content !== undefined ? obj.content : "";
  t.line = obj?.line !== undefined ? obj.line : -1;
  t.from = obj?.from !== undefined ? obj.from : -1;
  t.to = obj?.to !== undefined ? obj.to : -1;
  t.text = obj?.text !== undefined ? obj.text : "";
  t.notes = obj?.notes !== undefined ? obj.notes : [];
  t.order = obj?.order !== undefined ? obj.order : 0;
  t.ignore = obj?.ignore !== undefined ? obj.ignore : false;
  t.skipToNextPreview =
    obj?.skipToNextPreview !== undefined ? obj.skipToNextPreview : false;
  t.html = obj?.html;
  const indentMatch = t.content.match(sparkRegexes.indent);
  const indent = indentMatch?.[0] || "";
  const offset = indent.length;
  t.offset = offset;
  t.indent = Math.floor(offset / 2);
  t.to = getTo(t.from, t.content, newLineLength || 0);
  t.type = type || "comment";
  return t;
};
