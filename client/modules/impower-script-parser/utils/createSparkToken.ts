import { SparkTokenTypeMap } from "../types/SparkTokenTypeMap";
import { createSparkLine } from "./createSparkLine";

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
  } as SparkTokenTypeMap[K];
  if (obj?.content) {
    const indentMatch = obj.content.match(/^([ \t]*)/);
    const indent = indentMatch[0] || "";
    const offset = indent.length;
    t.offset = offset;
    t.indent = Math.floor(offset / 2);
    t.to = obj.from + obj.content.length - 1 + newLineLength;
  }
  return t;
};
