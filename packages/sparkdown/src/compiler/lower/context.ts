import { CompilationConfig } from "../classes/annotators/CompilationAnnotator";

export interface LowerContext {
  read: (from: number, to: number) => string;
  /**
   * Returns the **chunk-relative** 0-based line number for an absolute byte
   * offset. Line 0 is the first line of the chunk currently being lowered.
   * The compiler's `offsetDebugMetadata` later adds the chunk's absolute
   * start line back in.
   */
  lineNumber: (pos: number) => number;
  /**
   * Returns the 0-based column (character offset within the line) for an
   * absolute byte offset.
   */
  characterNumber: (pos: number) => number;
  /**
   * URI of the document being lowered. Stamped onto `DebugMetadata.filePath`
   * so inkjs's `ExportRuntime` diagnostics route back to the right URI in
   * `program.diagnostics`. Optional for snapshot-tool callers that don't
   * surface diagnostics.
   */
  filePath?: string;
  config?: CompilationConfig;
}

// Builds a `LowerContext` from a raw source string. Used by the snapshot
// tools (which compile a string without going through the annotator); the
// annotator builds its own context using the codemirror `Text` so it can
// share the document's line index. Line/character numbers are absolute
// here (chunk = whole source) which is the right behavior for snapshots.
export function createLowerContextFromSource(
  source: string,
  config?: CompilationConfig,
): LowerContext {
  // Pre-compute line starts so we can binary-search positions.
  const lineStarts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) {
      lineStarts.push(i + 1);
    }
  }
  const lineFor = (pos: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (lineStarts[mid]! <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  return {
    read: (from, to) => source.slice(from, to),
    lineNumber: (pos) => lineFor(pos),
    characterNumber: (pos) => pos - lineStarts[lineFor(pos)]!,
    config,
  };
}
