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

import { testCompiler, testStory } from "../engineUnderTest";

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

/**
 * A conformance fixture as the document the harness compiles: its body inside
 * `function run() ... end`, which main flow calls.
 */
export function wrapConformanceSource(fixtureSource: string): string {
  return `${PREAMBLE}\n${fixtureSource}\n${EPILOGUE}`;
}

export function runConformanceSource(
  fixtureSource: string,
  uri: string = "inmemory://luau-conformance/main.sd",
  fixtureName: string = "main",
): ConformanceResult {
  const wrappedSource = wrapConformanceSource(fixtureSource);

  const compiler = testCompiler();
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
  if (!program.chunks) {
    return {
      errorMessages,
      warningMessages,
      output: "",
      returnedOK: false,
    };
  }

  const story = testStory(program.chunks);

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
  // The program engine knows the line of the instruction running from its
  // chunk's line table.
  const lookupUserLineFromPointer = (): number | null => {
    const dm = story.currentDebugMetadata;
    return dm ? Math.max(1, dm.startLineNumber - PREAMBLE_LINE_COUNT) : null;
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
