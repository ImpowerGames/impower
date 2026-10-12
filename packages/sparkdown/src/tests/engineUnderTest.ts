// The engine a story-running test runs its story on: the binary program's
// engine (docs/engine/binary-program.md). A test compiles through
// `testCompiler` and makes its story with `testStory`, which runs the
// program's statement chunks.
import { SparkdownCompiler } from "../compiler/classes/SparkdownCompiler";
import type { SparkdownCompilerConfig } from "../compiler/types/SparkdownCompilerConfig";
import { STDLIB, type StdLibEntry } from "../runtime/StdLib";
import type { ProgramRoot } from "../program/ProgramRoot";
import { ProgramStory } from "../program/ProgramStory";

// The builtin a test's external function is called through on the program
// engine, which runs no external function (docs/engine/binary-program.md,
// section 3).
const TEST_EXTERNAL = "__test_external";

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
export class TestProgramStory extends ProgramStory {
  readonly externals = new Map<string, (...args: any[]) => unknown>();

  BindExternalFunction(name: string, fn: (...args: any[]) => unknown): void {
    this.externals.set(name, fn);
  }
}

if (!STDLIB[TEST_EXTERNAL]) {
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

/** A compiler that compiles scripts for the program engine
 *  (`withTestExternals`). */
class ProgramEngineCompiler extends SparkdownCompiler {
  override configure(config: SparkdownCompilerConfig) {
    return super.configure({
      ...config,
      files: config.files?.map((file) =>
        typeof file.text === "string"
          ? { ...file, text: withTestExternals(file.text) }
          : file,
      ),
    });
  }
}

/** The compiler a story-running test compiles with. */
export function testCompiler(): SparkdownCompiler {
  return new ProgramEngineCompiler();
}

/** The story a test runs: the program engine's, with the external functions
 *  a test binds. */
export type TestStory = TestProgramStory;

/** The story of a compile's root (`program.chunks`): the program engine over
 *  it. A compile that built no statement chunks made no program, and is
 *  refused. */
export function testStory(root: ProgramRoot | undefined): TestStory {
  if (!root) {
    throw new Error("The compile built no statement chunks, so there is no story to run.");
  }
  return new TestProgramStory(root);
}
