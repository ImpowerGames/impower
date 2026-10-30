import type { LowerContext } from "../context";

export function documentTag(filePath: string | undefined | null): string {
  if (!filePath) {
    return "";
  }
  let tag = "";
  for (const ch of filePath) {
    // value-level: one character of a file path
    if (/[A-Za-z0-9]/.test(ch)) {
      tag += ch;
    } else {
      const code = ch.codePointAt(0)!;
      tag +=
        code <= 0xff
          ? `_${code.toString(16).padStart(2, "0")}`
          : `_u${code.toString(16).padStart(6, "0")}`;
    }
  }
  return `${tag}__`;
}

export function syntheticId(from: number, ctx: LowerContext): string {
  return `${documentTag(ctx.filePath)}$${from}`;
}
