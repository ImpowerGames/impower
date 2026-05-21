import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
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
  /**
   * Mutable list of synthetic `Knot` ParsedObjects produced by lowering
   * anonymous function literals (`function(x) ... end` in expression
   * position). Each such literal compiles to a uniquely-named top-level
   * knot plus a `DivertTarget` at the literal's source position; the
   * synthetic knot has nowhere to live in the expression's parsed tree
   * so it gets stashed here. Names are derived from the source byte
   * offset (`__anon_fn_<from>`) so they stay unique across chunks and
   * stable across edits. If unset, anonymous-function lowering is a
   * no-op (snapshot tools that don't care about runtime execution can
   * omit it).
   */
  hoistedKnots?: ParsedObject[];
  /**
   * Stack of per-function buffers for nested callable definitions
   * (anonymous function literals, nested named functions, class
   * methods). When a function-definition lowerer enters, it pushes a
   * new buffer onto this stack; inner lowerers that produce a nestable
   * callable push the resulting `Function` (or other FlowBase) onto
   * the top buffer instead of `hoistedKnots`. When the function-
   * definition lowerer pops its buffer, it includes the collected
   * children as subFlows of its own runtime container so they live at
   * their lexical position rather than hoisted to top-level. If the
   * stack is empty (top-level scope), callables fall back to
   * `hoistedKnots`.
   */
  functionScopeStack?: ParsedObject[][];
  /**
   * Buffer for diagnostics produced by lowerers nested deep inside a
   * top-level chunk's lowering tree. Top-level lowerers attach
   * diagnostics directly to their returned `CompiledBlock`; that
   * works for them because the annotator picks the block up from the
   * chunk-level dispatch. But statement-level lowerers (e.g.
   * `lowerExplicitStatement` for `& foo()` inside a function body)
   * are called via `lowerStatements` and their `CompiledBlock` is
   * unwrapped via `appendBlockContent` — which only copies content,
   * dropping `block.diagnostics`. Routing through this buffer lets
   * the chunk-level annotator collect everything before finalizing.
   */
  diagnostics?: import("../classes/annotators/CompilationAnnotator").InkDiagnostic[];
  /**
   * Stack of loop-control targets, innermost-last. Each loop lowerer
   * (`while`, `for`, `repeat`) pushes an entry before lowering its
   * body and pops after. The body's `break` / `continue` lowerers
   * read the top entry to emit a `Divert` to the right label.
   *
   * `continueLabel` is the label that re-enters the loop's next-
   * iteration logic (for `while`, the loop gather itself; for `for`,
   * the step-update gather; for `repeat`, the until-check gather).
   * `breakLabel` is the gather immediately past the loop's exit.
   *
   * Each loop emits both labels — including a sentinel `loop_break`
   * gather past the loop body — so the keyword lowerers just produce
   * a `Divert`, no scope-cleanup bookkeeping needed (each loop
   * structures its bytecode so falling through the break label
   * naturally hits any required `EndScope`).
   */
  loopStack?: { continueLabel: string; breakLabel: string }[];
  /**
   * Names that resolve to globally-addressable callables — top-level
   * function knots, `external NAME(...)` declarations, and `store`
   * declarations at the document root. Populated by a pre-scan of
   * the parse tree before lowering starts. Used by `scanFreeVariables`
   * to distinguish "reference to a sibling local I should capture as
   * an upval" from "reference to a global that the divert resolver
   * can find on its own". Stdlib names are NOT in this set — the
   * grammar tags them under `LuauStdLibFunctions` / `LuauStdLibConstants`
   * and the scanner already skips those.
   */
  globalCallableNames?: ReadonlySet<string>;
  /**
   * Stack of per-enclosing-function-scope local declarations. Each
   * frame holds the names declared via `local` / `store` / `const`
   * (and nested `function NAME(...) end` declarations) in that
   * function's immediate body. `lowerLuauFunctionDefinition` pushes
   * a frame before lowering its body and pops after; the body's
   * recursive lowering of nested functions can then consult the stack
   * to detect shadowing.
   *
   * Specifically: `scanFreeVariables`, when deciding whether to
   * capture a referenced name as an upval, checks the stack. If the
   * name appears in ANY enclosing frame, it's a locally-shadowed
   * binding and MUST be captured — even if the name also matches a
   * stdlib identifier (otherwise `local count = 0; function f() count
   * = count + 1 end` would silently route `count` through the stdlib
   * dispatch instead of the local). Without this stack the scanner
   * has no way to know a stdlib-shaped name is shadowed.
   */
  declaredLocalsStack?: Set<string>[];
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
