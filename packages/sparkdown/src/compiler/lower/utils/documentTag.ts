import type { LowerContext } from "../context";

/** An identifier-safe spelling of the document's path that no other path
 *  shares, followed by `__`: letters and digits stay, and every other
 *  character becomes `_` and two hex digits, or `_u` and six for a code point
 *  above 0xff. An escape never contains `__`, so the tag ends at the first
 *  one. The tag is derived from the path alone, unlike a counter, which would
 *  change every name whenever an unrelated file was added. A hash of the path
 *  would be shorter, but two paths whose hashes collide would give their
 *  files one name. */
export function documentTag(filePath: string | undefined | null): string {
  if (!filePath) {
    return "";
  }
  let tag = "";
  for (const ch of filePath) {
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

/** The part of an offset-derived synthetic name that identifies the code
 *  producing it: the document tag, `$`, then the offset within the document,
 *  as in `__anon_fn_file_3a_2f_2fproj_2fmain_2esd__$42`. An offset alone is a
 *  position within one file, so two files would mint the same name for code
 *  at the same offset. `SparkdownCompiler.canonicalizeSyntheticFlowNames`
 *  renames every such name to `__synth_<n>` before export and recognizes it
 *  by the `$`, which no identifier an author writes can contain, so the pass
 *  never mistakes an author's name for one of these. */
export function syntheticId(from: number, ctx: LowerContext): string {
  return `${documentTag(ctx.filePath)}$${from}`;
}
