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
 * blank, and a function of the same name and parameters, written after the
 * script's end, hands its arguments to the function the test binds under that
 * name (`BindExternalFunction`), as the current engine's external call hands
 * them, and returns what that function returns. Every other line keeps its
 * number.
 */
export const withTestExternals = (text: string): string => {
  const functions: string[] = [];
  const rewritten = text.replace(EXTERNAL, (_line, name: string, params: string) => {
    const args = params.trim() ? `, ${params.trim()}` : "";
    functions.push(
      `function ${name}(${params.trim()})\n  return ${TEST_EXTERNAL}("${name}"${args})\nend\n`,
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

/** The story of a compile's `program.compiled`: on the program engine, the
 *  engine over its root. A program that fell back to the current engine is
 *  refused there, so that no test passes on the current engine unnoticed. */
export function testStory(compiled: Record<string, any>): RuntimeStory {
  const root = roots.get(compiled);
  if (root) {
    return new TestProgramStory(root) as unknown as RuntimeStory;
  }
  const fallback = fallbacks.get(compiled);
  if (fallback) {
    throw new Error(
      `The program falls back to the current engine for ${fallback.construct} at ${fallback.uri} line ${fallback.line + 1}.`,
    );
  }
  return new RuntimeStory(compiled);
}
