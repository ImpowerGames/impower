// The engine a story-running test runs its story on. The ordinary suite runs
// every story on the current engine. The differential run of the binary
// program (`SPARKDOWN_DIFFERENTIAL=1`, docs/engine/binary-program.md,
// section 9) runs the suites it takes in (`vitest.config.ts`) on the program
// engine: their compiles build statement chunks and their stories run them,
// so their assertions hold of the program engine. A test compiles through
// `testCompiler` and makes its story with `testStory`.
import "../inkjs/engine/Container";
import { SparkdownCompiler } from "../compiler/classes/SparkdownCompiler";
import type { SparkdownCompilerConfig } from "../compiler/types/SparkdownCompilerConfig";
import type { SparkProgram } from "../compiler/types/SparkProgram";
import { STDLIB, type StdLibEntry } from "../inkjs/engine/StdLib";
import { Story as RuntimeStory } from "../inkjs/engine/Story";
import type { ProgramRoot } from "../program/ProgramRoot";
import { ProgramStory } from "../program/ProgramStory";

/** Whether this run's stories run on the program engine. */
export const PROGRAM_ENGINE = process.env["SPARKDOWN_DIFFERENTIAL"] === "1";

// The builtin a test's external function is called through on the program
// engine, which runs no external function (docs/engine/binary-program.md,
// section 3).
const TEST_EXTERNAL = "__test_external";

// The root a chunked compile's `program.compiled` stands for on the program
// engine, and the construct a compile that fell back fell back for.
const roots = new WeakMap<object, ProgramRoot>();
const fallbacks = new WeakMap<object, NonNullable<SparkProgram["fallback"]>>();

// `external NAME(PARAMS)` on a line of its own.
const EXTERNAL = /^external[ \t]+([A-Za-z_]\w*)[ \t]*\(([^)]*)\)[ \t]*$/gm;

/**
 * A script for the program engine: each `external NAME(PARAMS)` line is left
 * blank, and a function of the same name, written after the script's end,
 * hands its arguments to the function the test binds under that name
 * (`BindExternalFunction`) and returns what that function returns. It takes
 * `...`, so that it gets the values a call passes as they are, as an
 * external does, where a function with fixed parameters would spread a last
 * argument that is a multiple value over them. Every other line keeps its
 * number.
 */
export const withTestExternals = (text: string): string => {
  const functions: string[] = [];
  const rewritten = text.replace(EXTERNAL, (_line, name: string) => {
    functions.push(
      `function ${name}(...)\n  return ${TEST_EXTERNAL}("${name}", ...)\nend\n`,
    );
    return "";
  });
  return functions.length === 0
    ? text
    : `${rewritten}${rewritten.endsWith("\n") ? "" : "\n"}\n${functions.join("\n")}`;
};

/** The program engine's story, with the external functions a test binds. */
class TestProgramStory extends ProgramStory {
  readonly externals = new Map<string, (...args: any[]) => unknown>();

  BindExternalFunction(name: string, fn: (...args: any[]) => unknown): void {
    this.externals.set(name, fn);
  }
}

/** The current engine's story of a program that fell back, whose external
 *  functions are the functions `withTestExternals` wrote, as on the program
 *  engine. */
class TestRuntimeStory extends RuntimeStory {
  readonly externals = new Map<string, (...args: any[]) => unknown>();

  override BindExternalFunction(name: string, fn: (...args: any[]) => unknown): void {
    this.externals.set(name, fn);
  }
}

if (PROGRAM_ENGINE && !STDLIB[TEST_EXTERNAL]) {
  // As `Story.CallExternalFunction` calls a bound function: with each
  // argument's JS value, and what it returns made a value again, or nothing.
  STDLIB[TEST_EXTERNAL] = {
    arity: -1,
    fn: (story: any, [name, ...args]: any[]) => {
      const external = (story as Partial<TestProgramStory>).externals?.get(
        name?.value,
      );
      if (!external) {
        story.Error(
          `Trying to call external function '${name?.value}' which has not been bound (and ink fallbacks disabled).`,
        );
      }
      const result = external!(...args.map((arg) => arg?.valueObject ?? null));
      return result == null ? undefined : result;
    },
  } as StdLibEntry;
}

/** A compiler that builds statement chunks and scripts for the program
 *  engine (`withTestExternals`). A chunked compile's `program.compiled`
 *  stands for its root. */
class ProgramEngineCompiler extends SparkdownCompiler {
  override configure(config: SparkdownCompilerConfig) {
    return super.configure({
      ...config,
      programChunks: true,
      files: config.files?.map((file) =>
        typeof file.text === "string"
          ? { ...file, text: withTestExternals(file.text) }
          : file,
      ),
    });
  }

  override compile(params: Parameters<SparkdownCompiler["compile"]>[0]) {
    const result = super.compile(params);
    const program = result.program;
    if (program.chunks) {
      const handle = {};
      roots.set(handle, program.chunks);
      program.compiled = handle;
    } else if (program.compiled && program.fallback) {
      fallbacks.set(program.compiled, program.fallback);
    }
    return result;
  }
}

/** The compiler a story-running test compiles with. */
export function testCompiler(): SparkdownCompiler {
  return PROGRAM_ENGINE ? new ProgramEngineCompiler() : new SparkdownCompiler();
}

/**
 * The constructs a test's program may fall back for, which then runs on the
 * current engine: a choice outside any `choose` block's code, which a script
 * holds only beside a compile error, and a `then` clause of a `choose` block
 * written in another block's preamble, which the writer leaves to the
 * current engine (#697); an included script's top-level content, a `run`
 * statement's call among it, which the design leaves to the current engine
 * (docs/engine/binary-program.md, What is built); and an assignment the
 * parser left without its value, which the writer never emits.
 */
const FALLS_BACK_ELSEWHERE: ReadonlySet<string> = new Set([
  "Choice",
  "a then clause of a choose block in another's preamble",
  "IncludedFile",
  "an assignment without a value",
]);

/** The story of a compile's `program.compiled`: on the program engine, the
 *  engine over its root. A program that fell back to the current engine runs
 *  there only for a construct the program engine leaves to another slice
 *  (`FALLS_BACK_ELSEWHERE`), and is refused for any other, so that no test
 *  passes on the current engine unnoticed. */
export function testStory(compiled: Record<string, any>): RuntimeStory {
  const root = roots.get(compiled);
  if (root) {
    return new TestProgramStory(root) as unknown as RuntimeStory;
  }
  const fallback = fallbacks.get(compiled);
  if (!fallback) {
    return new RuntimeStory(compiled);
  }
  if (!FALLS_BACK_ELSEWHERE.has(fallback.construct)) {
    throw new Error(
      `The program falls back to the current engine for ${fallback.construct} at ${fallback.uri} line ${fallback.line + 1}.`,
    );
  }
  return new TestRuntimeStory(compiled);
}
