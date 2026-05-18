// Luau-conformance test harness — runs ports of Luau's official
// conformance suite (https://github.com/luau-lang/luau/tree/master/tests/conformance,
// MIT-licensed) against sparkdown's Luau-superset implementation.
//
// Sparkdown is a Luau superset *inside function bodies* — at the top
// level, sparkdown interprets text as narrative. So the harness wraps
// every fixture body inside a `function run() ... end` block and
// calls it from main flow. That puts the fixture in Luau-superset
// territory: bare statement-level calls like `harness_assert(cond)`
// work without the `&` discard-call prefix.
//
// `harness_assert` is bound as an external until native `assert`
// lands (see STDLIB.md — currently ⬜). Once native `assert` is
// implemented, fixtures can call `assert(...)` directly and the
// harness can swap out the external for collecting via
// `story.onError`.
//
// The fixture itself is read verbatim from disk and inserted between
// the preamble and epilogue. Fixtures live under `fixtures/` with the
// `.sd` extension since they're sparkdown sources (vendored upstream
// `.luau` originals live in `upstream/conformance/` for reference).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, "fixtures");

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
   * or terminated before reaching the end of the script.
   */
  returnedOK: boolean;
  /**
   * One entry per `assert(cond, message)` call where `cond` was falsy.
   * Each string is the message (or `"assertion failed"` when no message
   * was supplied). The runtime keeps going after a failure rather than
   * halting, so a fixture can report multiple failures in one run.
   */
  assertionFailures: string[];
}

// Substring the harness appends after the fixture body and detects in
// the output stream to compute `returnedOK`. Distinct enough that it
// won't collide with anything an author might emit deliberately.
const OK_MARKER = "__LUAU_CONFORMANCE_OK__";

// Preamble: declares `harness_assert` as a host-bound external, then
// runs `& run()` and prints the OK marker before declaring `run`.
// The call has to come BEFORE the function declaration because
// top-level `function ... end` creates a knot and the first knot
// ends the implicit main flow — anything after it is unreachable.
//
// `harness_assert` can't be named `assert` because every name in
// `LUAU_STANDARD_LIB_FUNCTIONS` (assert, error, print, tostring,
// pcall, ...) is a reserved stdlib identifier in the grammar; calls
// to them don't route to externals, even when you declare one.
const PREAMBLE = `external harness_assert(cond)

& run()
: ${OK_MARKER}
done

function run()
`;

// Epilogue closes the wrapping `run` function. Main flow has already
// emitted the OK marker before reaching here.
const EPILOGUE = `
end
`;

export function runConformanceFixture(name: string): ConformanceResult {
  const sourcePath = join(FIXTURE_ROOT, `${name}.sd`);
  const fixtureSource = readFileSync(sourcePath, "utf8");
  return runConformanceSource(
    fixtureSource,
    `inmemory://luau-conformance/${name}.sd`,
  );
}

export function runConformanceSource(
  fixtureSource: string,
  uri: string = "inmemory://luau-conformance/main.sd",
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
      if (severity === 1) errorMessages.push(message);
      else if (severity === 2) warningMessages.push(message);
      else if (severity === 4) {
        // Hint — drop silently (matches runtimeTestHarness behavior).
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
      assertionFailures: [],
    };
  }

  const story = new RuntimeStory(program.compiled as Record<string, any>);

  const assertionFailures: string[] = [];
  // Truthiness here follows sparkdown's lowering rules: `nil` becomes
  // numeric `0`, which is falsy. So `assert(0)` records a failure in
  // sparkdown even though Luau would treat 0 as truthy — that's a
  // documented divergence (DIVERGENCES.md) and fixtures need to be
  // aware of it.
  story.BindExternalFunction("harness_assert", (cond: unknown) => {
    if (!cond) assertionFailures.push("assertion failed");
    return cond;
  });

  // Surface runtime errors through the same `errorMessages` channel as
  // compile-time errors so tests don't have to special-case the source.
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
    assertionFailures,
  };
}
