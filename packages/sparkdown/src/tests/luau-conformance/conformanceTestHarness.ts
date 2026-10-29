// Luau-conformance test harness — runs Luau's official conformance
// suite (https://github.com/luau-lang/luau/tree/master/tests/conformance,
// MIT-licensed; vendored under `upstream/conformance/`) against
// sparkdown's Luau-superset implementation.

import { testCompiler, testStory } from "../engineUnderTest";

export interface ConformanceResult {
  errorMessages: string[];
  warningMessages: string[];
  output: string;
  returnedOK: boolean;
}

const OK_MARKER = "__LUAU_CONFORMANCE_OK__";

const PREAMBLE = `& run()
: ${OK_MARKER}
done

function run()
`;

const EPILOGUE = `
end
`;

const PREAMBLE_LINE_COUNT =
  (PREAMBLE.match(/\n/g)?.length ?? 0) + 1;

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
      if (severity === 1) errorMessages.push(message);
      else if (severity === 2) warningMessages.push(message);
      else if (severity === 3 || severity === 4) {
      } else errorMessages.push(message);
    }
  }

  if (!program.chunks) {
    return {
      errorMessages,
      warningMessages,
      output: "",
      returnedOK: false,
    };
  }

  const story = testStory(program.chunks);

  const lookupUserLineFromPointer = (): number | null => {
    const dm = story.currentDebugMetadata;
    return dm ? Math.max(1, dm.startLineNumber - PREAMBLE_LINE_COUNT) : null;
  };
  story.errorMessageFormatter = (_story, raw) => {
    const userLine = lookupUserLineFromPointer();
    if (userLine === null) return raw;
    return `${fixtureName}:${userLine}: ${raw}`;
  };

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
