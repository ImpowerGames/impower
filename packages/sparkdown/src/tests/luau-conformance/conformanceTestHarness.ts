// Luau-conformance test harness — runs Luau's official conformance
// suite (https://github.com/luau-lang/luau/tree/master/tests/conformance,
// MIT-licensed; vendored under `upstream/conformance/`) against
// sparkdown's Luau-superset implementation.
//
// Sparkdown is a Luau superset *inside function bodies* — at the top
// level, sparkdown interprets text as narrative. So the harness wraps
// every fixture body in a `function run() ... end` block and calls
// it from main flow. That puts the fixture in Luau-superset territory:
// bare statement-level calls work without the `&` discard-call prefix.
//
// `assert(...)` resolves to the native stdlib entry (which throws via
// `story.Error` on falsy), so failures arrive through `story.onError`
// and end up in `errorMessages` alongside compile-time errors.

import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

export interface ConformanceResult {
  /** Compile-time errors surfaced by sparkdown's diagnostics pipeline. */
  errorMessages: string[];
  /** Compile-time warnings surfaced by sparkdown's diagnostics pipeline. */
  warningMessages: string[];
  /** Full text emitted by the running story (output stream concatenation). */
  output: string;
  /**
   * True when the fixture ran to completion and the OK epilogue marker
   * appeared in the output stream. False if execution was diverted away
   * or terminated before reaching the end of the script (typically
   * because a failed `assert(...)` aborted via `story.Error`).
   */
  returnedOK: boolean;
}

// Marker the harness appends after the fixture body and detects in
// the output stream to compute `returnedOK`. Distinct enough that it
// won't collide with anything an author might emit deliberately.
const OK_MARKER = "__LUAU_CONFORMANCE_OK__";

// Preamble: invokes `run()` from main flow and prints the OK marker
// before declaring `run`. The call has to come BEFORE the function
// declaration because top-level `function ... end` creates a knot
// and the first knot ends the implicit main flow — anything after it
// is unreachable.
const PREAMBLE = `& run()
: ${OK_MARKER}
done

function run()
`;

// Epilogue closes the wrapping `run` function. Main flow has already
// emitted the OK marker before reaching here.
const EPILOGUE = `
end
`;

// Number of lines the PREAMBLE adds before the user's fixtureSource
// starts. Used by the `error()` formatter to translate wrapped-source
// line numbers back to user-fixture line numbers so Luau-spec
// assertions like `error("oops")` returning `"<file>:<line>: oops"`
// report the line the user actually wrote.
//
// The wrapped source is `${PREAMBLE}\n${fixtureSource}\n${EPILOGUE}`.
// PREAMBLE itself already ends with a `\n` (the closing backtick is
// on its own line), and then `\n` is appended before fixtureSource.
// So count = `\n`s in PREAMBLE + 1 (the joining `\n`).
const PREAMBLE_LINE_COUNT =
  (PREAMBLE.match(/\n/g)?.length ?? 0) + 1;

export function runConformanceSource(
  fixtureSource: string,
  uri: string = "inmemory://luau-conformance/main.sd",
  fixtureName: string = "main",
): ConformanceResult {
  const wrappedSource = `${PREAMBLE}\n${fixtureSource}\n${EPILOGUE}`;

  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: wrappedSource,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });

  const errorMessages: string[] = [];
  const warningMessages: string[] = [];

  const result = compiler.compile({ textDocument: { uri } });
  const program = result.program;

  for (const docDiagnostics of Object.values(program.diagnostics ?? {})) {
    for (const diag of docDiagnostics) {
      let message: string;
      if (typeof diag === "string") {
        message = diag;
      } else {
        const raw = (diag as { message?: unknown }).message;
        if (typeof raw === "string") {
          message = raw;
        } else if (
          raw &&
          typeof (raw as { value?: unknown }).value === "string"
        ) {
          message = (raw as { value: string }).value;
        } else {
          message = JSON.stringify(diag);
        }
      }
      const severity = (diag as { severity?: number }).severity;
      // LSP severities: 1 = Error, 2 = Warning, 3 = Information, 4 = Hint.
      // Information / Hint are advisory (deprecated-stdlib strikethrough,
      // redundant-discard prefix, etc.) and don't block execution —
      // drop them silently. Treat anything else (including absent
      // severity) as an error.
      if (severity === 1) errorMessages.push(message);
      else if (severity === 2) warningMessages.push(message);
      else if (severity === 3 || severity === 4) {
        // Information / Hint — drop silently (matches runtimeTestHarness).
      } else errorMessages.push(message);
    }
  }

  // If compilation failed outright, return early with empty output
  // rather than throwing. Tests can decide whether to flag the
  // error or skip — useful while bisecting which features still
  // need lowerer support.
  if (!program.compiled) {
    return {
      errorMessages,
      warningMessages,
      output: "",
      returnedOK: false,
    };
  }

  const story = new RuntimeStory(program.compiled as Record<string, any>);

  // Luau-spec `error(msg)` prepends `<source>:<line>: ` to the
  // message. Sparkdown production hosts (the LSP) intentionally
  // skip this — diagnostics surface source/line through their own
  // UI fields. For the conformance suite we install a formatter
  // that:
  //   1. Reads `currentDebugMetadata` to get the wrapped-source line.
  //   2. Subtracts the preamble offset to get the user-fixture line.
  //   3. Prepends `<fixtureName>:<userLine>: ` to the message.
  // This lets fixtures like basic.luau line 39 (which expects
  // `"false,basic.luau:39: oops"`) check the format precisely.
  // Debug metadata is stripped from the runtime story by JSON
  // serialization — `currentDebugMetadata` returns null even though
  // the compiler tracked source lines. Bridge the gap via the
  // compiler's `program.pathLocations` map, keyed by stringified
  // path (e.g. `"run.0.20.s30.4"`). Look up the current pointer's
  // path to recover the wrapped-source line, then subtract the
  // preamble offset to get the user-fixture line.
  // Debug metadata is stripped from the runtime story by JSON
  // serialization, so `currentDebugMetadata` returns null. Bridge
  // the gap via the compiler's `program.pathLocations` map, keyed
  // by stringified path. The mapping is coarse — the compiler
  // stamps the ENCLOSING function/knot's start line on every
  // bytecode command inside it, not the precise statement line —
  // so the resulting `<file>:<line>:` matches the function's start
  // line, not the exact error site. Good enough for tests that just
  // want the format prefix; not granular enough to match upstream
  // Luau fixtures that hard-code specific lines.
  const pathLocations = program.pathLocations ?? {};
  const lookupUserLineFromPointer = (): number | null => {
    const ptr = story.state.currentPointer;
    const candidates: import("../../inkjs/engine/InkObject").InkObject[] = [];
    if (ptr && !ptr.isNull) {
      const resolved = ptr.Resolve();
      if (resolved) candidates.push(resolved);
    }
    for (let i = story.state.callStack.elements.length - 1; i >= 0; i--) {
      const elPtr = story.state.callStack.elements[i].currentPointer;
      if (elPtr && !elPtr.isNull) {
        const resolved = elPtr.Resolve();
        if (resolved) candidates.push(resolved);
      }
    }
    // Prefer the DEEPEST match (most specific path). We collect all
    // matches along each candidate's parent chain and pick the one
    // with the highest startLine (closer to the actual call site
    // than the enclosing container's start). Picking the MAX
    // recovers something close to the source line of the failing
    // call even when the leaf object's exact path isn't in the
    // location table (which only tracks compiler-emitted objects).
    let best: number | null = null;
    for (const obj of candidates) {
      let cur: any = obj;
      while (cur) {
        const path = cur.path?.toString?.();
        if (path && pathLocations[path]) {
          const [, startLine] = pathLocations[path]!;
          if (best === null || startLine > best) best = startLine;
        }
        cur = cur.parent;
      }
    }
    if (best === null) return null;
    // `pathLocations[path][1]` is `metadata.startLineNumber - 1`
    // (legacy inkjs subtraction inherited from a 1-based metadata
    // convention) AND sparkdown's `metadata.startLineNumber` is
    // already 0-based document line (since `ctx.lineNumber` returns
    // 0-based — see CompilationAnnotator.lineNumber). So `best` is
    // `0-based document line - 1`. To get 1-based user line:
    //   user_line = (0-based_doc_line + 1) - PREAMBLE_LINE_COUNT
    //             = (best + 1) + 1 - PREAMBLE_LINE_COUNT
    //             = best + 2 - PREAMBLE_LINE_COUNT
    // Clamp to >= 1 since the compiler's coarse mapping can still
    // point at the preamble region for inner-knot ControlCommands.
    return Math.max(1, best + 2 - PREAMBLE_LINE_COUNT);
  };
  story.errorMessageFormatter = (_story, raw) => {
    const userLine = lookupUserLineFromPointer();
    if (userLine === null) return raw;
    return `${fixtureName}:${userLine}: ${raw}`;
  };

  // Surface runtime errors (including thrown asserts from native
  // `assert(...)`) through the same `errorMessages` channel as
  // compile-time errors so tests don't have to special-case the
  // source.
  story.onError = (msg: string) => {
    errorMessages.push(msg);
  };

  const output = story.ContinueMaximally();
  const returnedOK = output.includes(OK_MARKER);

  return {
    errorMessages,
    warningMessages,
    output,
    returnedOK,
  };
}
