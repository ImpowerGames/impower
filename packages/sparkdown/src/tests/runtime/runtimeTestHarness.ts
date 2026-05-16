// Runtime test harness — mirrors the role of `inkjs`'s
// `src/tests/specs/common.ts` for sparkdown. Compiles a `.sd` fixture
// through the full `SparkdownCompiler` pipeline and returns a runnable
// `Story` plus the diagnostics surfaced during compilation.
//
// The point of these tests is to verify end-to-end runtime behavior
// against the ported inkjs test suite, so anything that diverges from
// inkjs's known-good outputs is a real bug — either in our lowerer, in
// our grammar, or in our runtime patches.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, "fixtures");

export interface RuntimeTestContext {
  story: RuntimeStory;
  errorMessages: string[];
  warningMessages: string[];
  compiledJson: unknown;
}

export interface RuntimeTestOptions {
  /**
   * Force visit-count tracking on every container in the compiled story,
   * the same way the upstream inkjs test harness passes
   * `countAllVisits: true` to `Compiler`. Required for tests that read
   * `state.VisitCountAtPathString(name)` on a container that the source
   * doesn't otherwise reference — without it, the compiler only marks
   * containers that are the target of a `READ_COUNT` / `{knot}` /
   * `TURNS_SINCE` expression, and `VisitCountAtPathString` returns 0
   * even after the container has been visited.
   */
  countAllVisits?: boolean;
}

// Load a fixture by feature folder + filename (without extension), compile
// through SparkdownCompiler, and return a ready-to-run Story.
export function makeRuntimeStoryFromFile(
  feature: string,
  name: string,
  options: RuntimeTestOptions = {},
): RuntimeTestContext {
  const path = join(FIXTURE_ROOT, feature, `${name}.sd`);
  const source = readFileSync(path, "utf8");
  return makeRuntimeStoryFromSource(
    source,
    `inmemory://${feature}/${name}.sd`,
    options,
  );
}

// Load a multi-file fixture from a directory. The directory layout maps
// directly onto sparkdown's include resolution (`include path/to/other.sd`
// resolves relative to the importing file's URI). Every `.sd` file under
// `fixtures/<feature>/<name>/` is registered with the compiler under a
// stable in-memory URI tree rooted at `inmemory://<feature>/<name>/`. The
// `main.sd` entry point is compiled.
//
// Layout convention:
//   fixtures/<feature>/<name>/main.sd
//   fixtures/<feature>/<name>/includes/other.sd
//   fixtures/<feature>/<name>/includes/nested.sd
//
// In the main file, write `include includes/other.sd` (relative path). The
// compiler walks the include graph and pulls in every reachable file.
export function makeRuntimeStoryFromDirectory(
  feature: string,
  name: string,
  options: RuntimeTestOptions = {},
): RuntimeTestContext {
  const fixtureRoot = join(FIXTURE_ROOT, feature, name);
  const files = collectSparkdownFiles(fixtureRoot);
  // `inmemory://<feature>/<name>/` is the URL base; sub-paths use forward
  // slashes so the WHATWG `URL` resolver inside the compiler treats them
  // as URL path components rather than Windows-style backslash separators.
  const baseUri = `inmemory://${feature}/${name}/`;
  const mainUri = `${baseUri}main.sd`;

  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: files.map((f) => ({
      uri: `${baseUri}${f.relativePath}`,
      type: "script",
      name: f.relativePath.replace(/\.sd$/, ""),
      ext: "sd",
      text: f.text,
      version: 1,
      languageId: "sparkdown",
    })),
  });

  return runCompiledStory(compiler, mainUri, options);
}

interface FixtureFile {
  // Forward-slash path relative to the fixture root (e.g. `"main.sd"` or
  // `"includes/other.sd"`). Used to build the in-memory URI.
  relativePath: string;
  text: string;
}

function collectSparkdownFiles(root: string): FixtureFile[] {
  const files: FixtureFile[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      const stats = statSync(abs);
      if (stats.isDirectory()) {
        walk(abs);
      } else if (entry.endsWith(".sd")) {
        const relativePath = relative(root, abs).split(sep).join("/");
        files.push({
          relativePath,
          text: readFileSync(abs, "utf8"),
        });
      }
    }
  };
  walk(root);
  return files;
}

// Compile a sparkdown source string and return a runnable Story plus any
// diagnostics raised during compilation.
export function makeRuntimeStoryFromSource(
  source: string,
  uri: string = "inmemory:///main.sd",
  options: RuntimeTestOptions = {},
): RuntimeTestContext {
  const compiler = new SparkdownCompiler();
  // `configure` initializes the internal document registry. Passing the
  // fixture as the initial file means the compiler is ready to compile
  // immediately, without further `addFile` / `updateDocument` plumbing.
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  return runCompiledStory(compiler, uri, options);
}

// Drive the post-`configure` half of the pipeline: run `compile()`, drain
// diagnostics into error / warning buckets, and construct the runtime
// Story from the produced JSON. Shared by `makeRuntimeStoryFromSource`
// and `makeRuntimeStoryFromDirectory`.
function runCompiledStory(
  compiler: SparkdownCompiler,
  uri: string,
  options: RuntimeTestOptions,
): RuntimeTestContext {
  const errorMessages: string[] = [];
  const warningMessages: string[] = [];

  const result = compiler.compile({
    textDocument: { uri },
    countAllVisits: options.countAllVisits,
  });
  const program = result.program;

  // Pull diagnostics out of `program.diagnostics` (keyed by URI) and split by
  // severity so tests can match the inkjs harness's `errorMessages` /
  // `warningMessages` API.
  for (const docDiagnostics of Object.values(program.diagnostics ?? {})) {
    for (const diag of docDiagnostics) {
      // The LSP diagnostic shape is `{ message: string | { value, kind } }`
      // where the markdown form is `{ value: "<text>", kind: "markdown" }`.
      // Flatten both into a plain string so tests can do substring matches
      // mirroring inkjs's `expect(errorMessages).toContain(...)` style.
      let message: string;
      if (typeof diag === "string") {
        message = diag;
      } else {
        const raw = (diag as { message?: unknown }).message;
        if (typeof raw === "string") {
          message = raw;
        } else if (raw && typeof (raw as { value?: unknown }).value === "string") {
          message = (raw as { value: string }).value;
        } else {
          message = JSON.stringify(diag);
        }
      }
      const severity = (diag as { severity?: number }).severity;
      // 1 = Error, 2 = Warning (DiagnosticSeverity from vscode-languageserver)
      if (severity === 1) errorMessages.push(message);
      else if (severity === 2) warningMessages.push(message);
      else errorMessages.push(message); // unknown severity, surface as error
    }
  }

  if (!program.compiled) {
    throw new Error(
      `Sparkdown compilation produced no JSON output.\n` +
        `Errors:\n  ${errorMessages.join("\n  ") || "(none)"}\n` +
        `Warnings:\n  ${warningMessages.join("\n  ") || "(none)"}`,
    );
  }

  // `Story`'s constructor accepts either a serialized JSON string or the
  // already-parsed JS object directly. `SparkdownCompiler.compile()` deletes
  // `result.story` before returning (it's not JSON-serializable for the LSP
  // wire format), but `program.compiled` is the same plain object the
  // compiler would have stringified — pass it through unchanged. Going
  // through `JSON.stringify` is wrong because the compiler's `WriteFloat`
  // marker convention (whole-number floats serialized as `"3.0f"` strings)
  // only kicks in when the writer is driving the output; here the marker is
  // already encoded in the object form, so re-stringifying would mangle it.
  const story = new RuntimeStory(program.compiled as Record<string, any>);
  return {
    story,
    errorMessages,
    warningMessages,
    compiledJson: program.compiled,
  };
}

// Compile a source string for the sole purpose of collecting diagnostics —
// doesn't construct a Story or throw when `program.compiled` is empty.
// Mirrors inkjs's `compileStoryWithoutRuntime` helper.
export function collectDiagnostics(
  source: string,
  uri: string = "inmemory:///main.sd",
): { errorMessages: string[]; warningMessages: string[] } {
  const errorMessages: string[] = [];
  const warningMessages: string[] = [];
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri } });
  for (const docDiagnostics of Object.values(result.program.diagnostics ?? {})) {
    for (const diag of docDiagnostics) {
      let message: string;
      if (typeof diag === "string") {
        message = diag;
      } else {
        const raw = (diag as { message?: unknown }).message;
        if (typeof raw === "string") message = raw;
        else if (raw && typeof (raw as { value?: unknown }).value === "string")
          message = (raw as { value: string }).value;
        else message = JSON.stringify(diag);
      }
      const severity = (diag as { severity?: number }).severity;
      if (severity === 1) errorMessages.push(message);
      else if (severity === 2) warningMessages.push(message);
      else errorMessages.push(message);
    }
  }
  return { errorMessages, warningMessages };
}

// Convenience: run the story to completion and return the accumulated output.
// Mirrors inkjs's `story.ContinueMaximally()` flow used in their specs.
export function runToEnd(story: RuntimeStory): string {
  return story.ContinueMaximally();
}
