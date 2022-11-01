import { sparkRegexes } from "../constants/sparkRegexes";
import { SparkTokenTypeMap } from "../types/SparkTokenTypeMap";
import { createSparkLine } from "./createSparkLine";
import { getTo } from "./getTo";

export const createSparkToken = <K extends keyof SparkTokenTypeMap = "">(
  type?: K,
  newLineLength?: number,
  obj?: Partial<SparkTokenTypeMap[K]>
): SparkTokenTypeMap[K] => {
  const t = {
    ...createSparkLine(obj),
    type,
    offset: 0,
    indent: 0,
    content: "",
    ...obj,
    ...(obj?.content !== undefined ? { content: obj?.content } : {}),
    ...(obj?.line !== undefined ? { line: obj?.line } : {}),
    ...(obj?.from !== undefined
      ? { offset: 0, from: obj?.from, to: obj?.from }
      : {}),
  } as unknown as SparkTokenTypeMap[K];
  if (obj?.content) {
    const indentMatch = obj.content.match(sparkRegexes.indent);
    const indent = indentMatch?.[0] || "";
    const offset = indent.length;
    t.offset = offset;
    t.indent = Math.floor(offset / 2);
    t.to = getTo(t.from, obj.content, newLineLength || 0);
  }
  return t;
};
